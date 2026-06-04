/**
 * Realtime sync hook for a multiplayer match row.
 *
 * Subscribes to UPDATE events on the game_matches row. Whenever the OTHER
 * player writes (last_action_by !== us), we deserialize the canonical state
 * into our local React state.
 *
 * Hand redaction: PvP matches now have a server-managed `public_state`
 * column that is the opponent-redacted view (their hand stripped, only a
 * `handCount` left). We prefer that whenever it's present; the full `state`
 * column is service-role-only and clients can't read it directly, but the
 * old code path keeps working for legacy / pre-server-auth rows.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deserializeMatch } from "@/lib/game/serialize";
import type { MatchState } from "@/lib/game/types";
import type { GameMatchRow } from "@/lib/game/persistence";

function pickStateForRecipient(row: GameMatchRow): MatchState {
  // public_state is opponent-redacted (the actor's hand is visible, the
  // OTHER side's hand was stripped before write). Since this hook only
  // fires for updates NOT performed by us, public_state is the right view
  // for our side. Fall back to `state` for older rows.
  const raw = (row.public_state ?? row.state) as any;
  return deserializeMatch(raw);
}

export function useMatchRealtime(
  matchId: string | null,
  selfUserId: string | null,
  onRemoteUpdate: (state: MatchState, row: GameMatchRow) => void,
) {
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    const channel = supabase
      .channel(`game-match-${matchId}-${selfUserId ?? "anon"}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as unknown as GameMatchRow;
          if (row.last_action_by && row.last_action_by === selfUserId) return;
          try {
            onRemoteUpdate(pickStateForRecipient(row), row);
          } catch (e) {
            console.error("[match-realtime] deserialize failed", e);
          }
        },
      )
      .subscribe((status) => {
        console.log(`[match-realtime] ${matchId} status:`, status);
      });

    // Polling fallback in case realtime is blocked (corp networks, ws issues).
    let lastUpdatedAt = "";
    const poll = setInterval(async () => {
      if (cancelled) return;
      const { data, error } = await supabase
        .from("game_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();
      if (error || !data) return;
      const row = data as unknown as GameMatchRow;
      if (row.updated_at === lastUpdatedAt) return;
      lastUpdatedAt = row.updated_at;
      if (row.last_action_by && row.last_action_by === selfUserId) return;
      try {
        onRemoteUpdate(pickStateForRecipient(row), row);
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
