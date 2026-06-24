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
  | { ok: true; seq: number; publicState: any; finished: boolean }
  | { ok: false; rejected: true; reason: "stale" | "not_implemented" | "auth" | "server"; currentSeq?: number; message?: string };

export async function applyMoveServer(
  matchId: string,
  expectedSeq: number,
  move: ServerMove,
): Promise<ApplyMoveResult> {
  try {
    const { data, error } = await supabase.functions.invoke("apply-move", {
      body: { match_id: matchId, expected_seq: expectedSeq, move },
    });
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
      if (status === 409) {
        return { ok: false, rejected: true, reason: "stale", message };
      }
      if (status === 401 || status === 403) {
        return { ok: false, rejected: true, reason: "auth", message };
      }
      if (status === 501) {
        return { ok: false, rejected: true, reason: "not_implemented", message };
      }
      return { ok: false, rejected: true, reason: "server", message };
    }
    if (!data?.ok) {
      return { ok: false, rejected: true, reason: "server", message: "no ok flag" };
    }
    return { ok: true, seq: data.seq, publicState: data.public_state, finished: !!data.finished };
  } catch (e) {
    return { ok: false, rejected: true, reason: "server", message: (e as Error).message };
  }
}
