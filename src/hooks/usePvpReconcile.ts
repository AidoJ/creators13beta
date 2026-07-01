/**
 * usePvpReconcile — owns the PvP server-sync surface.
 *
 * Responsibilities:
 *  - Track the canonical server `seq` (the optimistic-concurrency token).
 *  - Serialise outgoing apply-move requests via a promise-chain mutex so
 *    concurrent submits don't race each other and `seq` stays monotonic.
 *  - On rejection (stale / server error) refetch the canonical row + state
 *    and hand them back to the page via the supplied setters.
 *
 * Extracted from Play.tsx to keep the page component focused on UI.
 */

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { applyMoveServer, type ServerMove } from "@/lib/game/serverMoves";
import { loadMatch, type GameMatchRow } from "@/lib/game/persistence";
import { logClientStateChange } from "@/lib/game/debugLog";
import { deserializeMatch, type SerializedMatchState } from "@/lib/game/serialize";
import type { MatchState } from "@/lib/game/types";

interface Args {
  matchRow: GameMatchRow | null;
  setMatchRow: (row: GameMatchRow) => void;
  setState: (state: MatchState) => void;
}

export interface PvpReconcile {
  /** Latest server-confirmed seq for this match. */
  serverSeqRef: React.MutableRefObject<number>;
  /** Submit a Move to the apply-move edge function. Returns a promise that
   *  resolves after the server has acked AND any rejection-reconcile has
   *  finished. Safe to fire-and-forget. */
  submitServerMove: (move: ServerMove) => Promise<void>;
}

export function usePvpReconcile({ matchRow, setMatchRow, setState }: Args): PvpReconcile {
  const serverSeqRef = useRef(0);
  /** HARD in-flight guard. While true, any further submitServerMove call is
   *  a no-op (logged and dropped). This makes double-submit structurally
   *  impossible regardless of how many gesture/timer paths fire. The flag
   *  is cleared in finally{}, so both success and error paths release it. */
  const inFlightRef = useRef(false);

  // Keep serverSeqRef in sync whenever the row reference changes (initial
  // load, post-realtime push, or a fresh reconcile fetch).
  useEffect(() => {
    if (matchRow) serverSeqRef.current = Number(matchRow.seq ?? 0);
  }, [matchRow]);

  const submitServerMove = useCallback(
    async (move: ServerMove): Promise<void> => {
      if (!matchRow) return;
      if (inFlightRef.current) {
        console.warn("[apply-move DROP] another submit is in flight", {
          moveType: move.type,
        });
        return;
      }
      inFlightRef.current = true;
      const matchId = matchRow.id;
      const expected = serverSeqRef.current;
      const cardUid = "uid" in move ? move.uid : undefined;
      console.warn("[apply-move CALL]", {
        seq: expected,
        moveType: move.type,
        cardUid,
      });
      try {
        let result = await applyMoveServer(matchId, expected, move);
        // Auth recovery: one silent refresh + retry before surfacing.
        if (result.ok === false && result.reason === "auth") {
          console.warn("[apply-move] auth rejected — refreshing session and retrying once");
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data.session) {
              result = await applyMoveServer(matchId, expected, move);
            }
          } catch (e) {
            console.error("[apply-move] refreshSession threw", e);
          }
          if (result.ok === false && result.reason === "auth") {
            toast.error("Your session expired. Please sign in again.");
            const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
            setTimeout(() => {
              window.location.href = `/auth?returnTo=${returnTo}`;
            }, 1200);
            return;
          }
        }
        if (result.ok === true) {
          serverSeqRef.current = result.seq;
          setMatchRow({
            ...matchRow,
            seq: result.seq,
            turn_started_at: result.turnStartedAt ?? matchRow.turn_started_at,
          });
          if (result.publicState) {
            try {
              const canonical = deserializeMatch(result.publicState as SerializedMatchState);
              logClientStateChange("move_response", result.seq, canonical);
              setState(canonical);
            } catch (e) {
              console.error("[apply-move] could not hydrate publicState", e);
            }
          }
          return;
        }
        const rejected = result as Extract<typeof result, { ok: false }>;
        if (rejected.reason === "not_implemented") {
          console.warn("[apply-move] server not yet implementing", move.type);
          return;
        }
        if (rejected.reason === "stale") {
          toast.message("Catching up to opponent…");
        } else {
          toast.error(rejected.message ?? "Move rejected by server");
        }

        try {
          const { row, state: canonical } = await loadMatch(matchId);
          setMatchRow(row);
          logClientStateChange("move_response", Number(row.seq ?? 0), canonical);
          setState(canonical);
          serverSeqRef.current = Number(row.seq ?? 0);
        } catch (e) {
          console.error("[apply-move] reconcile failed", e);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [matchRow, setMatchRow, setState],
  );

  return { serverSeqRef, submitServerMove };
}
