/**
 * Batch B acceptance tests — offline move queue.
 *
 * Covers the four required cases:
 *  1. Reload-replay: a sessionStorage-restored move is re-validated against
 *     the seq it was made at and DROPPED on 409 — never applied late.
 *  2. Ordered replay: two queued moves replay FIFO, one in flight at a time.
 *  3. Player feedback: a dropped move surfaces a "turn passed" message.
 *  4. Happy path: a move made while offline lands on reconnect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { enqueueMove, loadQueue, clearQueue } from "@/lib/game/moveQueue";

const applyMoveServer = vi.fn();
const loadMatch = vi.fn();
const toastMessage = vi.fn();

vi.mock("@/lib/game/serverMoves", () => ({
  applyMoveServer: (...args: any[]) => applyMoveServer(...args),
}));
vi.mock("@/lib/game/persistence", () => ({
  loadMatch: (...args: any[]) => loadMatch(...args),
}));
vi.mock("sonner", () => ({
  toast: { message: (...a: any[]) => toastMessage(...a), error: vi.fn() },
}));
vi.mock("@/lib/game/debugLog", () => ({ logClientStateChange: vi.fn() }));
vi.mock("@/lib/game/serialize", () => ({ deserializeMatch: (s: any) => s }));

import { usePvpReconcile } from "@/hooks/usePvpReconcile";

const MATCH_ID = "11111111-1111-1111-1111-111111111111";
const row = { id: MATCH_ID, mode: "pvp", seq: 7, turn_started_at: null } as any;

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: v, configurable: true });
}

function mount() {
  const setMatchRow = vi.fn();
  const setState = vi.fn();
  const hook = renderHook(() => usePvpReconcile({ matchRow: row, setMatchRow, setState }));
  return { hook, setMatchRow, setState };
}

describe("offline move queue (Batch B)", () => {
  beforeEach(() => {
    clearQueue(MATCH_ID);
    applyMoveServer.mockReset();
    loadMatch.mockReset();
    toastMessage.mockReset();
    loadMatch.mockResolvedValue({ row: { ...row, seq: 12 }, state: { canonical: true } });
    setOnline(true);
  });
  afterEach(() => clearQueue(MATCH_ID));

  it("drops a restored move on 409 and never applies it late", async () => {
    // Simulate: queued at seq 7, app reloaded, table moved to seq 12.
    enqueueMove(MATCH_ID, { type: "end_turn" }, 7);
    applyMoveServer.mockResolvedValue({ ok: false, rejected: true, reason: "stale" });

    mount();

    await waitFor(() => expect(applyMoveServer).toHaveBeenCalled());
    // Replayed with its ORIGINAL seq, not the current one.
    expect(applyMoveServer.mock.calls[0][1]).toBe(7);
    await waitFor(() => expect(loadQueue(MATCH_ID)).toHaveLength(0));
    expect(loadMatch).toHaveBeenCalledWith(MATCH_ID);
    // Player is told, never a silent vanish.
    expect(toastMessage).toHaveBeenCalledWith(
      "Your turn passed while you were offline",
      expect.anything(),
    );
  });

  it("replays two queued moves in FIFO order, one in flight at a time", async () => {
    enqueueMove(MATCH_ID, { type: "pickup_from_draw" }, 7);
    enqueueMove(MATCH_ID, { type: "end_turn" }, 7);

    let inFlight = 0;
    const order: string[] = [];
    applyMoveServer.mockImplementation(async (_id: string, seq: number, move: any) => {
      inFlight++;
      expect(inFlight).toBe(1);
      order.push(move.type);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, seq: seq + 1, publicState: { s: move.type }, finished: false };
    });

    mount();

    await waitFor(() => expect(loadQueue(MATCH_ID)).toHaveLength(0));
    expect(order).toEqual(["pickup_from_draw", "end_turn"]);
  });

  it("holds a move made while offline and delivers it on reconnect", async () => {
    setOnline(false);
    const { hook } = mount();

    await act(async () => {
      await hook.result.current.submitServerMove({ type: "end_turn" });
    });
    expect(applyMoveServer).not.toHaveBeenCalled();
    expect(loadQueue(MATCH_ID)).toHaveLength(1);
    await waitFor(() => expect(hook.result.current.pendingMoveCount).toBe(1));

    applyMoveServer.mockResolvedValue({ ok: true, seq: 8, publicState: {}, finished: false });
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(loadQueue(MATCH_ID)).toHaveLength(0));
    expect(applyMoveServer).toHaveBeenCalledTimes(1);
  });

  it("queues a move whose request never reached the server (transport blip)", async () => {
    applyMoveServer.mockResolvedValueOnce({ ok: false, rejected: true, reason: "network" });
    const { hook } = mount();
    // Second call (from the drain tick) succeeds.
    applyMoveServer.mockResolvedValue({ ok: true, seq: 8, publicState: {}, finished: false });

    await act(async () => {
      await hook.result.current.submitServerMove({ type: "end_turn" });
    });
    await waitFor(() => expect(loadQueue(MATCH_ID)).toHaveLength(0));
    expect(applyMoveServer.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
