/**
 * Batch B — offline move queue.
 *
 * Turn-based play is highly salvageable on flaky mobile signal: a move made
 * during a 5–10s cellular handoff should land when the connection returns
 * instead of failing. This module is the *durable* half of that: queued moves
 * live in sessionStorage so they survive a mid-blip reload.
 *
 * SAFETY INVARIANT: every queued move carries the `expectedSeq` it was made
 * against. On replay it is submitted with that ORIGINAL seq — so if the match
 * moved on while the player was offline, the server answers 409 stale and the
 * move is DROPPED, never applied late/out of order.
 */

import type { ServerMove } from "@/lib/game/serverMoves";

export interface QueuedMove {
  /** Stable client id (also used as an idempotency hint in logs). */
  id: string;
  /** Server seq this move was composed against. Never rewritten. */
  expectedSeq: number;
  move: ServerMove;
  createdAt: number;
}

const KEY_PREFIX = "c13:moveQueue:v1:";

function key(matchId: string) {
  return KEY_PREFIX + matchId;
}

function safeStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadQueue(matchId: string): QueuedMove[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(key(matchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q: any) => q && typeof q.id === "string" && q.move && typeof q.expectedSeq === "number",
    ) as QueuedMove[];
  } catch {
    return [];
  }
}

function writeQueue(matchId: string, queue: QueuedMove[]) {
  const s = safeStorage();
  if (!s) return;
  try {
    if (queue.length === 0) s.removeItem(key(matchId));
    else s.setItem(key(matchId), JSON.stringify(queue));
  } catch {
    /* quota / private mode — queue degrades to in-memory only */
  }
}

/** Append to the tail. FIFO order is the replay order. */
export function enqueueMove(
  matchId: string,
  move: ServerMove,
  expectedSeq: number,
): QueuedMove {
  const entry: QueuedMove = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    expectedSeq,
    move,
    createdAt: Date.now(),
  };
  writeQueue(matchId, [...loadQueue(matchId), entry]);
  return entry;
}

/** Remove a single entry by id (used after it resolves — ack OR drop). */
export function removeQueued(matchId: string, id: string): QueuedMove[] {
  const next = loadQueue(matchId).filter((q) => q.id !== id);
  writeQueue(matchId, next);
  return next;
}

export function clearQueue(matchId: string) {
  writeQueue(matchId, []);
}

export function queueLength(matchId: string): number {
  return loadQueue(matchId).length;
}
