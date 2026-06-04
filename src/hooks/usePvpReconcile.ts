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
  /** Promise-chain mutex so only one apply-move request is in flight per
   *  match at a time. */
  const inFlightMoveRef = useRef<Promise<void> | null>(null);

  // Keep serverSeqRef in sync whenever the row reference changes (initial
  // load, post-realtime push, or a fresh reconcile fetch).
  useEffect(() => {
    if (matchRow) serverSeqRef.current = Number(matchRow.seq ?? 0);
  }, [matchRow]);

  const submitServerMove = useCallback(
    (move: ServerMove): Promise<void> => {
      if (!matchRow) return Promise.resolve();
      const matchId = matchRow.id;
      const run = async () => {
        const expected = serverSeqRef.current;
        const result = await applyMoveServer(matchId, expected, move);
        if (result.ok === true) {
          serverSeqRef.current = result.seq;
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
          setState(canonical);
          serverSeqRef.current = Number(row.seq ?? 0);
        } catch (e) {
          console.error("[apply-move] reconcile failed", e);
        }
      };
      const chained = (inFlightMoveRef.current ?? Promise.resolve())
        .then(run, run)
        .finally(() => {
          if (inFlightMoveRef.current === chained) inFlightMoveRef.current = null;
        });
      inFlightMoveRef.current = chained;
      return chained;
    },
    [matchRow, setMatchRow, setState],
  );

  return { serverSeqRef, submitServerMove };
}
