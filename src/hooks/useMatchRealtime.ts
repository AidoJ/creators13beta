/**
 * Realtime sync hook for a multiplayer match row.
 *
 * Subscribes to UPDATE events on the game_matches row. Whenever the OTHER
 * player writes (last_action_by !== us), we deserialize their state into
 * our local React state.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deserializeMatch } from "@/lib/game/serialize";
import type { MatchState } from "@/lib/game/types";
import type { GameMatchRow } from "@/lib/game/persistence";

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
            onRemoteUpdate(deserializeMatch(row.state), row);
          } catch (e) {
            console.error("[match-realtime] deserialize failed", e);
          }
        },
      )
      .subscribe((status) => {
        console.log(`[match-realtime] ${matchId} status:`, status);
      });

    // Polling fallback in case realtime is blocked (corp networks, ws issues).
    // Light: every 4s pull the row and emit if last_action_by !== self and updated_at advanced.
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
        onRemoteUpdate(deserializeMatch(row.state), row);
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
