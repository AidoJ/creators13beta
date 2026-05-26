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
    const channel = supabase
      .channel(`game-match-${matchId}`)
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
            console.error("Failed to deserialize remote match state", e);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, selfUserId, onRemoteUpdate]);
}
