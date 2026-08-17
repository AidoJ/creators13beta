/**
 * Client wrapper for the apply-move edge function (the server-authoritative
 * move pipeline). Wraps optimistic UX:
 *   1. Caller applies the move locally for instant feedback.
 *   2. Caller awaits `applyMoveServer` and reconciles state from the server.
 *
 * Until step 3 of the migration is complete, only `concede` is implemented
 * server-side; other move types currently return `{ rejected: true,
 * reason: "not_implemented" }` and the caller should fall back to the
 * existing client-authoritative path.
 */

import { supabase } from "@/integrations/supabase/client";

export type ServerMove =
  | { type: "draw_initial_5" }
  | { type: "pickup_from_used"; uid: string }
  | { type: "pickup_from_draw" }
  | { type: "place"; uid: string; pos: { q: number; r: number }; rotation?: number }
  | { type: "play_disaster"; uid: string; target_player_id?: string }
  | { type: "resolve_disaster"; use_hive: boolean }
  | {
      type: "play_sky_steal";
      uid: string;
      from_player_id: string;
      victim_pos_key: string;
      place_at?: { q: number; r: number };
    }
  | { type: "discard"; uid: string }
  | { type: "skip_draws" }
  | { type: "end_turn" }
  | { type: "concede" }
  | { type: "rotate_hex"; pos_key: string }
  | { type: "move_hex"; from_key: string; to_pos: { q: number; r: number } }
  | { type: "finalise_by_score" }
  | { type: "start_lobby_match" };

export type ApplyMoveResult =
  | { ok: true; seq: number; publicState: any; finished: boolean; turnStartedAt?: string | null }
  | { ok: false; rejected: true; reason: "stale" | "finished" | "not_implemented" | "auth" | "server" | "network"; currentSeq?: number; message?: string };

const NETWORK_RETRIES = 2;
/** Hard ceiling on a single apply-move request. Without this, a wedged
 *  edge invocation (we saw one run 125s before the platform killed it with
 *  "upstream request timeout") holds the client's in-flight lock open, so
 *  the UI sits on "Sending your move…" forever and every later move piles
 *  up behind it. Aborting turns that into a normal queued retry. */
const REQUEST_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for transport-level failures ("Failed to send a request to the Edge
 *  Function") — the request never reached the server, so retrying is safe.
 *  If a retry races an earlier attempt that DID land, the server answers 409
 *  stale and the caller reconciles. */
function isTransportFailure(error: any): boolean {
  const status = error?.context?.status;
  if (typeof status === "number" && status > 0) return false;
  const name = String(error?.name ?? "");
  const msg = String(error?.message ?? "");
  return (
    name === "FunctionsFetchError" ||
    name === "AbortError" ||
    /abort|timed? ?out/i.test(msg) ||
    /failed to (send|fetch)/i.test(msg) ||
    /network|load failed/i.test(msg)
  );
}

/** Tell the server "my move request hung / never landed" so the disconnect
 *  sweep pauses this seat's idle clock instead of auto-passing a player
 *  whose only fault is that our pipeline stalled. Fire-and-forget: it must
 *  never delay or fail the move path. Throttled so a burst of retries
 *  doesn't spam the function. */
let lastStallReportAt = 0;
function reportServerStall(matchId: string) {
  const now = Date.now();
  if (now - lastStallReportAt < 10_000) return;
  lastStallReportAt = now;
  void supabase.functions
    .invoke("report-presence", { body: { match_id: matchId, event: "server_stall" } })
    .catch(() => { /* best-effort */ });
}


export async function applyMoveServer(
  matchId: string,
  expectedSeq: number,
  move: ServerMove,
): Promise<ApplyMoveResult> {
  try {
    let data: any = null;
    let error: any = null;
    for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
      ({ data, error } = await supabase.functions.invoke("apply-move", {
        body: { match_id: matchId, expected_seq: expectedSeq, move },
        timeout: REQUEST_TIMEOUT_MS,

      }));
      if (!error || !isTransportFailure(error)) break;
      // A timeout means the request MAY have landed. Don't hammer it in a
      // tight loop — hand it to the durable queue, which replays it once
      // with a fresh seq check.
      const timedOut = /abort|timed? ?out/i.test(String(error?.name ?? "") + String(error?.message ?? ""));
      if (timedOut) {
        console.warn("[apply-move] request timed out — deferring to queue", { moveType: move.type });
        reportServerStall(matchId);
        break;
      }
      console.warn("[apply-move] transport failure — retrying", { attempt, moveType: move.type });
      await sleep(400 * (attempt + 1));
    }

    if (error) {
      const ctx: any = (error as any)?.context;
      const status = ctx?.status ?? 0;
      // supabase-js swallows the response body into a generic "non-2xx"
      // message. Recover the real server error so toasts/logs are useful.
      let serverMessage: string | undefined;
      try {
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.clone().json();
          serverMessage = body?.message ?? body?.error;
        }
      } catch {
        try {
          if (ctx && typeof ctx.text === "function") {
            serverMessage = await ctx.clone().text();
          }
        } catch { /* ignore */ }
      }
      const message = serverMessage || error.message;
      console.warn("[apply-move] rejected", { status, message, moveType: move.type });
      if (status === 410) {
        // Terminal — the match is over. Never retry, never queue.
        return { ok: false, rejected: true, reason: "finished", message };
      }
      if (status === 409) {
        return { ok: false, rejected: true, reason: "stale", message };
      }
      if (status === 401 || status === 403) {
        return { ok: false, rejected: true, reason: "auth", message };
      }
      if (status === 501) {
        return { ok: false, rejected: true, reason: "not_implemented", message };
      }
      if (isTransportFailure(error)) {
        reportServerStall(matchId);
        return {
          ok: false,
          rejected: true,
          reason: "network",
          message: "Connection dropped — your move didn't reach the table. Resyncing…",
        };
      }
      return { ok: false, rejected: true, reason: "server", message };
    }
    if (!data?.ok) {
      return { ok: false, rejected: true, reason: "server", message: "no ok flag" };
    }
    return { ok: true, seq: data.seq, publicState: data.public_state, finished: !!data.finished, turnStartedAt: data.turn_started_at ?? null };
  } catch (e) {
    return { ok: false, rejected: true, reason: "server", message: (e as Error).message };
  }
}
