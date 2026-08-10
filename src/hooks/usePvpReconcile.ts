/**
 * usePvpReconcile — owns the PvP server-sync surface.
 *
 * Responsibilities:
 *  - Track the canonical server `seq` (the optimistic-concurrency token).
 *  - Serialise outgoing apply-move requests via a hard in-flight guard so
 *    concurrent submits don't race each other and `seq` stays monotonic.
 *  - Batch B: queue moves through connectivity drops (durably, in
 *    sessionStorage) and replay them FIFO, one-in-flight-at-a-time, on
 *    reconnect — each replayed move re-validated against the seq it was
 *    made at, so a move that the match has moved past is DROPPED (409),
 *    never applied late.
 *  - On rejection (stale / server error) refetch the canonical row + state
 *    and hand them back to the page via the supplied setters.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { applyMoveServer, type ServerMove } from "@/lib/game/serverMoves";
import { loadMatch, type GameMatchRow } from "@/lib/game/persistence";
import { logClientStateChange } from "@/lib/game/debugLog";
import { deserializeMatch, type SerializedMatchState } from "@/lib/game/serialize";
import {
  clearQueue,
  enqueueMove,
  loadQueue,
  queueLength,
  removeQueued,
} from "@/lib/game/moveQueue";
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
  /** How many moves are waiting to reach the server (offline queue). Drives
   *  the "Sending…" marker in the UI. */
  pendingMoveCount: number;
}

const RETRY_INTERVAL_MS = 3000;

export function usePvpReconcile({ matchRow, setMatchRow, setState }: Args): PvpReconcile {
  const serverSeqRef = useRef(0);
  /** HARD in-flight guard. While true, any further submit/replay is deferred
   *  so exactly one request is on the wire at a time. Cleared in finally{}. */
  const inFlightRef = useRef(false);
  const [pendingMoveCount, setPendingMoveCount] = useState(0);

  // Latest values behind refs so the drain loop (driven by timers/events)
  // never runs against a stale closure.
  const matchRowRef = useRef<GameMatchRow | null>(matchRow);
  matchRowRef.current = matchRow;
  const setMatchRowRef = useRef(setMatchRow);
  setMatchRowRef.current = setMatchRow;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  // Keep serverSeqRef in sync whenever the row reference changes (initial
  // load, post-realtime push, or a fresh reconcile fetch).
  useEffect(() => {
    if (matchRow) serverSeqRef.current = Number(matchRow.seq ?? 0);
  }, [matchRow]);

  const syncPending = useCallback((matchId: string) => {
    setPendingMoveCount(queueLength(matchId));
  }, []);

  /** Pull the authoritative row + redacted state and push it into the page. */
  const reconcile = useCallback(async (matchId: string) => {
    try {
      const { row, state: canonical } = await loadMatch(matchId);
      setMatchRowRef.current(row);
      logClientStateChange("move_response", Number(row.seq ?? 0), canonical);
      setStateRef.current(canonical);
      serverSeqRef.current = Number(row.seq ?? 0);
    } catch (e) {
      console.error("[apply-move] reconcile failed", e);
    }
  }, []);

  /**
   * Drain the durable queue. FIFO, strictly one request at a time.
   * Each entry replays with the seq it was ORIGINALLY made against:
   *   ok       → dequeue, adopt canonical state
   *   stale    → the turn moved on while we were away: DROP it (and any
   *              siblings behind it, which were composed against the same
   *              dead seq), tell the player, resync
   *   network  → still offline: stop, keep the queue, try again later
   *   other    → dequeue, surface, resync
   */
  const drainQueue = useCallback(async () => {
    const row = matchRowRef.current;
    if (!row || row.mode !== "pvp") return;
    if (inFlightRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const matchId = row.id;
    if (queueLength(matchId) === 0) return;

    inFlightRef.current = true;
    try {
      // Re-read each iteration so a concurrent enqueue is picked up.
      for (let guard = 0; guard < 25; guard++) {
        const queue = loadQueue(matchId);
        const entry = queue[0];
        if (!entry) break;
        if (typeof navigator !== "undefined" && navigator.onLine === false) break;

        console.warn("[apply-move REPLAY]", {
          seq: entry.expectedSeq,
          moveType: entry.move.type,
          queued: queue.length,
        });
        const result = await applyMoveServer(matchId, entry.expectedSeq, entry.move);

        if (result.ok === true) {
          removeQueued(matchId, entry.id);
          syncPending(matchId);
          serverSeqRef.current = result.seq;
          const current = matchRowRef.current ?? row;
          setMatchRowRef.current({
            ...current,
            seq: result.seq,
            turn_started_at: result.turnStartedAt ?? current.turn_started_at,
          });
          if (result.publicState) {
            try {
              const canonical = deserializeMatch(result.publicState as SerializedMatchState);
              logClientStateChange("move_response", result.seq, canonical);
              setStateRef.current(canonical);
            } catch (e) {
              console.error("[apply-move] could not hydrate publicState", e);
            }
          }
          continue;
        }

        if (result.reason === "network") {
          // Still no signal — leave the queue intact for the next attempt.
          break;
        }

        if (result.reason === "stale") {
          // THE critical safety path: the match advanced while we were
          // offline. Nothing in the queue is valid any more.
          console.warn("[apply-move REPLAY DROPPED — stale]", {
            moveType: entry.move.type,
            expectedSeq: entry.expectedSeq,
          });
          clearQueue(matchId);
          syncPending(matchId);
          toast.message("Your turn passed while you were offline", {
            description: "That move was discarded — catching up to the table.",
          });
          await reconcile(matchId);
          break;
        }

        // auth / server / not_implemented — drop the entry, surface, resync.
        removeQueued(matchId, entry.id);
        syncPending(matchId);
        if (result.reason !== "not_implemented") {
          toast.error(result.message ?? "Move rejected by server");
          await reconcile(matchId);
        }
      }
    } finally {
      inFlightRef.current = false;
      const id = matchRowRef.current?.id;
      if (id) syncPending(id);
    }
  }, [reconcile, syncPending]);

  // Replay triggers: mount/restore (covers a mid-blip reload), signal return,
  // tab focus, and a slow retry tick while anything is still queued.
  useEffect(() => {
    if (!matchRow || matchRow.mode !== "pvp") return;
    syncPending(matchRow.id);
    void drainQueue();
    const onOnline = () => void drainQueue();
    const onVisible = () => {
      if (document.visibilityState === "visible") void drainQueue();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => void drainQueue(), RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [matchRow?.id, matchRow?.mode, drainQueue, syncPending]);

  const submitServerMove = useCallback(
    async (move: ServerMove): Promise<void> => {
      const row = matchRowRef.current;
      if (!row) return;
      const matchId = row.id;
      const expected = serverSeqRef.current;

      // Offline, or something already on the wire / queued: park it durably
      // and let the drain loop deliver it in order.
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline || inFlightRef.current || queueLength(matchId) > 0) {
        enqueueMove(matchId, move, expected);
        syncPending(matchId);
        console.warn("[apply-move QUEUED]", {
          reason: offline ? "offline" : inFlightRef.current ? "in-flight" : "queue-nonempty",
          moveType: move.type,
          seq: expected,
        });
        if (!offline) void drainQueue();
        return;
      }

      inFlightRef.current = true;
      const cardUid = "uid" in move ? move.uid : undefined;
      console.warn("[apply-move CALL]", { seq: expected, moveType: move.type, cardUid });
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
          const current = matchRowRef.current ?? row;
          setMatchRowRef.current({
            ...current,
            seq: result.seq,
            turn_started_at: result.turnStartedAt ?? current.turn_started_at,
          });
          if (result.publicState) {
            try {
              const canonical = deserializeMatch(result.publicState as SerializedMatchState);
              logClientStateChange("move_response", result.seq, canonical);
              setStateRef.current(canonical);
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
        if (rejected.reason === "network") {
          // The request never reached the table — this is exactly the blip
          // case. Park the move and show it as "Sending…" instead of an
          // error; the drain loop delivers it when signal returns.
          enqueueMove(matchId, move, expected);
          syncPending(matchId);
          return;
        }
        if (rejected.reason === "stale") {
          toast.message("Catching up to opponent…");
        } else {
          toast.error(rejected.message ?? "Move rejected by server");
        }
        await reconcile(matchId);
      } finally {
        inFlightRef.current = false;
        syncPending(matchId);
        // A move may have been queued behind this one while it was in flight.
        void drainQueue();
      }
    },
    [drainQueue, reconcile, syncPending],
  );

  return { serverSeqRef, submitServerMove, pendingMoveCount };
}
