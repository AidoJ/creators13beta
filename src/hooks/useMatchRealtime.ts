/**
 * Realtime sync hook for a multiplayer match.
 *
 * A.1: subscribes to UPDATEs on the caller's own row in
 * `game_match_player_states` (filtered by `user_id = self`) for the
 * redacted state. Also subscribes to UPDATEs on `game_matches` for the
 * scalar fields the page needs (status, seq, winner_user_id, last_action_by).
 *
 * Polling fallback kept in case Realtime is blocked (corp networks, ws issues).
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deserializeMatch } from "@/lib/game/serialize";
import type { MatchState } from "@/lib/game/types";
import type { GameMatchRow } from "@/lib/game/persistence";

const ROW_COLS =
  "id, mode, status, host_user_id, host_name, guest_user_id, guest_name, invite_token, seq, is_ranked, player_count, winner_user_id, last_action_by, created_at, updated_at";

export function useMatchRealtime(
  matchId: string | null,
  selfUserId: string | null,
  onRemoteUpdate: (state: MatchState, row: GameMatchRow) => void,
) {
  useEffect(() => {
    if (!matchId || !selfUserId) return;
    let cancelled = false;

    // Latest known scalar row — cached so the state-row handler can pair
    // the new state with the most recent meta in a single callback.
    let lastRow: GameMatchRow | null = null;

    const channelKey = `${matchId}-${selfUserId}-${Math.random().toString(36).slice(2, 8)}`;

    const channel = supabase
      .channel(`game-match-${channelKey}`)
      // My redacted state row. Fires on every commit_move regardless of actor.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_match_player_states",
          filter: `user_id=eq.${selfUserId}`,
        },
        async (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row || row.match_id !== matchId) return;
          try {
            const state = deserializeMatch(row.state);
            // Refresh meta if we don't have it yet, or if the seq jumped.
            if (!lastRow || (row.seq ?? 0) > (lastRow.seq ?? 0)) {
              const { data } = await supabase
                .from("game_matches")
                .select(ROW_COLS)
                .eq("id", matchId)
                .maybeSingle();
              if (data) lastRow = data as unknown as GameMatchRow;
            }
            if (lastRow && lastRow.last_action_by === selfUserId) return;
            if (lastRow) onRemoteUpdate(state, lastRow);
          } catch (e) {
            console.error("[match-realtime] state deserialize failed", e);
          }
        },
      )
      // Meta updates (status / winner / seq) — keeps lastRow current and
      // catches finished-match transitions even if no state row writes after
      // (e.g. forfeit sweep updates game_matches but not player_states, so
      // the state-row channel above never fires and the client would hang
      // on "Disconnected" forever).
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_matches",
          filter: `id=eq.${matchId}`,
        },
        async (payload) => {
          const newRow = payload.new as unknown as GameMatchRow;
          const prevStatus = lastRow?.status;
          lastRow = newRow;
          if (newRow.status === "finished" && prevStatus !== "finished") {
            try {
              const [stateRes, playersRes] = await Promise.all([
                supabase
                  .from("game_match_player_states")
                  .select("state")
                  .eq("match_id", matchId)
                  .eq("user_id", selfUserId)
                  .maybeSingle(),
                supabase
                  .from("game_match_players")
                  .select("user_id, slot")
                  .eq("match_id", matchId),
              ]);
              const raw = (stateRes.data as { state: any } | null)?.state;
              if (!raw) return;
              const state = deserializeMatch(raw);
              const slotByUser = new Map<string, number>(
                (playersRes.data ?? []).map((r: any) => [r.user_id as string, r.slot as number]),
              );
              const winnerSlot = newRow.winner_user_id
                ? slotByUser.get(newRow.winner_user_id)
                : undefined;
              const winnerPlayerId =
                winnerSlot === 0
                  ? "host"
                  : winnerSlot != null
                  ? `guest${winnerSlot}`
                  : null;
              onRemoteUpdate(
                { ...state, finished: true, winnerId: winnerPlayerId },
                newRow,
              );
            } catch (e) {
              console.error("[match-realtime] finished-status synth failed", e);
            }
          }
        },
      )
      .subscribe((status) => {
        console.log(`[match-realtime] ${matchId} status:`, status);
      });

    // Polling fallback.
    let lastUpdatedAt = "";
    const poll = setInterval(async () => {
      if (cancelled) return;
      const [rowRes, stateRes] = await Promise.all([
        supabase.from("game_matches").select(ROW_COLS).eq("id", matchId).maybeSingle(),
        supabase
          .from("game_match_player_states")
          .select("state, seq, updated_at")
          .eq("match_id", matchId)
          .eq("user_id", selfUserId)
          .maybeSingle(),
      ]);
      if (rowRes.error || !rowRes.data) return;
      const row = rowRes.data as unknown as GameMatchRow;
      lastRow = row;
      if (row.updated_at === lastUpdatedAt) return;
      lastUpdatedAt = row.updated_at;
      if (row.last_action_by && row.last_action_by === selfUserId) return;
      const stateRow = stateRes.data as { state: any } | null;
      if (!stateRow) return;
      try {
        onRemoteUpdate(deserializeMatch(stateRow.state), row);
      } catch (e) {
        console.error("[match-realtime] poll deserialize failed", e);
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [matchId, selfUserId, onRemoteUpdate]);
}
