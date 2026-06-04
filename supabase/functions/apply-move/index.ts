/**
 * apply-move — server-authoritative move processor.
 *
 * Step 2 of the server-authoritative migration (see
 * .lovable/server-authoritative-design.md). This edge function is the ONLY
 * path through which the canonical match state is mutated once migration
 * is complete.
 *
 * Flow per request:
 *   1. Verify caller JWT, load match row by id (RLS bypassed via service role).
 *   2. Verify caller is host or guest.
 *   3. Reject if `expected_seq != row.seq` (client is stale → 409).
 *   4. Dispatch on move.type. Each handler:
 *        - validates the move against current full state,
 *        - runs the engine reducer to produce the next full state,
 *        - returns { state, publicState, finished?, winner? }.
 *   5. Call public.commit_move RPC (locks row + appends move + bumps seq).
 *   6. Return the caller's redacted view + new seq.
 *
 * Status: scaffolding. Only `concede` is wired end-to-end as a vertical
 * slice. The remaining 10 move types return 501 until they're migrated
 * one-by-one in the next step (which keeps each migration small + testable
 * + revertable).
 */

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Move =
  | { type: "draw_initial_5" }
  | { type: "pickup_from_used"; uid: string }
  | { type: "pickup_from_draw" }
  | { type: "place"; uid: string; pos: { q: number; r: number }; rotation: number }
  | { type: "play_disaster"; uid: string; target_player_id: string }
  | { type: "resolve_disaster"; use_hive: boolean }
  | { type: "play_sky_steal"; uid: string; from_player_id: string; target_uid: string }
  | { type: "discard"; uid: string }
  | { type: "skip_draws" }
  | { type: "end_turn" }
  | { type: "concede" };

interface ApplyBody {
  match_id: string;
  expected_seq: number;
  move: Move;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Strip opponent hands from full state to produce per-recipient public state. */
function redactFor(fullState: any, recipientPlayerId: string) {
  if (!fullState?.players) return fullState;
  return {
    ...fullState,
    players: fullState.players.map((p: any) =>
      p.id === recipientPlayerId
        ? p
        : { ...p, hand: [], handCount: Array.isArray(p.hand) ? p.hand.length : 0 },
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  // Identify the caller from their JWT.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "missing bearer token" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userResult, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResult.user) return jsonResponse({ error: "auth failed" }, 401);
  const userId = userResult.user.id;

  let body: ApplyBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body?.match_id || typeof body.expected_seq !== "number" || !body.move?.type) {
    return jsonResponse({ error: "missing fields" }, 400);
  }

  // Service-role client to read full state + call commit_move.
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: match, error: matchErr } = await svc
    .from("game_matches")
    .select("*")
    .eq("id", body.match_id)
    .maybeSingle();
  if (matchErr || !match) return jsonResponse({ error: "match not found" }, 404);

  if (match.host_user_id !== userId && match.guest_user_id !== userId) {
    return jsonResponse({ error: "not a player in this match" }, 403);
  }

  if (Number(match.seq ?? 0) !== body.expected_seq) {
    return jsonResponse(
      { error: "stale", current_seq: Number(match.seq ?? 0) },
      409,
    );
  }

  // Resolve which player slot the caller represents in the state players[] array.
  // host_user_id maps to players[0].id, guest_user_id maps to players[1].id.
  const state: any = match.state;
  if (!state?.players?.length) return jsonResponse({ error: "match has no state" }, 500);
  const callerSlot =
    match.host_user_id === userId ? 0 : 1;
  const callerPlayerId = state.players[callerSlot]?.id;
  if (!callerPlayerId) return jsonResponse({ error: "player slot empty" }, 500);

  // ---------- Move dispatch ----------
  let nextState = state;
  let finished = false;
  let winnerUserId: string | null = null;

  switch (body.move.type) {
    case "concede": {
      // Other player wins.
      const otherSlot = callerSlot === 0 ? 1 : 0;
      const otherPlayer = state.players[otherSlot];
      nextState = {
        ...state,
        finished: true,
        winnerId: otherPlayer?.id ?? null,
        lastEvent: `${state.players[callerSlot].name} conceded.`,
      };
      finished = true;
      winnerUserId =
        otherSlot === 0 ? match.host_user_id : match.guest_user_id;
      break;
    }

    // TODO(step 3): port one move at a time from src/lib/game/engine.ts.
    // Each port should: (a) reuse engine logic via a shared module, or
    // (b) re-implement validation+reducer in this function. Recommended
    // order: end_turn → pickup_from_draw → pickup_from_used → place →
    // discard → skip_draws → draw_initial_5 → play_disaster →
    // resolve_disaster → play_sky_steal.
    default:
      return jsonResponse(
        { error: `move type '${body.move.type}' not yet implemented server-side` },
        501,
      );
  }

  // ---------- Commit ----------
  const publicStateForCaller = redactFor(nextState, callerPlayerId);
  // public_state on the row is the OPPONENT's redaction (so the row update is
  // valuable to the listener on the other side). Caller gets their own view
  // in the response.
  const otherPlayerId = state.players[callerSlot === 0 ? 1 : 0]?.id;
  const publicStateForRow = redactFor(nextState, otherPlayerId);

  const { error: commitErr } = await svc.rpc("commit_move", {
    _match_id: body.match_id,
    _expected_seq: body.expected_seq,
    _actor: userId,
    _move: body.move as any,
    _new_state: nextState,
    _public_state: publicStateForRow,
    _winner: winnerUserId,
    _finished: finished,
  });
  if (commitErr) {
    if (String(commitErr.message ?? "").includes("stale seq")) {
      return jsonResponse({ error: "stale", message: commitErr.message }, 409);
    }
    console.error("[apply-move] commit failed", commitErr);
    return jsonResponse({ error: "commit failed", detail: commitErr.message }, 500);
  }

  return jsonResponse({
    ok: true,
    seq: body.expected_seq + 1,
    public_state: publicStateForCaller,
    finished,
  });
});
