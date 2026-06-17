/**
 * apply-move — server-authoritative move processor.
 *
 * Step 3 of the server-authoritative migration (see
 * .lovable/server-authoritative-design.md). Every legal user action becomes
 * one entry in a discriminated union, validated + reduced here on the server,
 * and committed atomically via the `commit_move` RPC (which holds a row
 * lock + bumps `seq`).
 *
 * Game rules are not duplicated: we import the engine from
 * `supabase/functions/_shared/game/`, which is a generated mirror of
 * `src/lib/game/{types,board,elements,rotation,engine}.ts`. The
 * `scripts/sync-game-engine.sh --check` step in CI fails the build if the
 * mirror drifts from the client.
 *
 * Flow per request:
 *   1. Verify caller JWT, load match row (service role bypasses RLS).
 *   2. Verify caller is host or guest of this match.
 *   3. Reject if `expected_seq != row.seq` (client is stale → 409).
 *   4. Deserialise full state, dispatch on move.type to the engine reducer.
 *      Engine throws on illegal moves; we map that to a 400 with the
 *      message so the client can show a toast and reconcile.
 *   5. Re-serialise + redact for each side, call `commit_move`.
 *   6. Return the caller's redacted view + new seq.
 */

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  drawInitialFive,
  pickFromDraw,
  pickFromUsed,
  skipDraws,
  endTurnEarly,
  placeOnEcosystem,
  discardCard,
  playDisaster,
  resolveDisaster,
  playSkyCreatureSteal,
  rotateMyPlacedHex,
  moveMyPlacedHex,
  finaliseByScore,
  concedePlayer,
} from "../_shared/game/engine.ts";
import type { Axial, DeckCard, Ecosystem, MatchState, PlacedCard } from "../_shared/game/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Move =
  | { type: "draw_initial_5" }
  | { type: "pickup_from_used"; uid: string }
  | { type: "pickup_from_draw" }
  | { type: "place"; uid: string; pos: Axial; rotation?: number }
  | { type: "play_disaster"; uid: string; target_player_id?: string }
  | { type: "resolve_disaster"; use_hive: boolean }
  | {
      type: "play_sky_steal";
      uid: string;
      from_player_id: string;
      victim_pos_key: string;
      place_at?: Axial;
    }
  | { type: "discard"; uid: string }
  | { type: "skip_draws" }
  | { type: "end_turn" }
  | { type: "concede" }
  | { type: "rotate_hex"; pos_key: string }
  | { type: "move_hex"; from_key: string; to_pos: Axial }
  | { type: "finalise_by_score" };

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

/* ----------------------- serialize / deserialize ----------------------- */
// Inlined mirrors of src/lib/game/serialize.ts so we don't pull a React-y
// import. The shapes must match the client exactly.

function deserialise(raw: any): MatchState {
  return {
    ...raw,
    players: (raw.players ?? []).map((p: any) => ({
      ...p,
      firstPickupDone: p.firstPickupDone ?? true,
      ecosystem: {
        placed: new Map<string, PlacedCard>(p.ecosystem?.placed ?? []),
      } as Ecosystem,
    })),
    pendingDisaster: raw.pendingDisaster ?? null,
  };
}

function serialise(state: MatchState): any {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      ecosystem: { placed: Array.from(p.ecosystem.placed.entries()) },
    })),
  };
}

/** Build the per-recipient public view: hand visible only to its owner. */
function redactFor(serialisedState: any, recipientPlayerId: string | null) {
  if (!serialisedState?.players) return serialisedState;
  return {
    ...serialisedState,
    players: serialisedState.players.map((p: any) =>
      p.id === recipientPlayerId
        ? p
        : { ...p, hand: [], handCount: Array.isArray(p.hand) ? p.hand.length : 0 },
    ),
  };
}

function cardUid(card: DeckCard | null | undefined): string | null {
  return typeof card?.uid === "string" ? card.uid : null;
}

function movePayloadUids(move: Move): string[] {
  const out: string[] = [];
  const add = (uid: unknown) => {
    if (typeof uid === "string" && uid.length > 0) out.push(uid);
  };
  switch (move.type) {
    case "pickup_from_used":
    case "place":
    case "play_disaster":
    case "discard":
      add(move.uid);
      break;
    case "play_sky_steal":
      add(move.uid);
      break;
  }
  return out;
}

function allStateUids(state: MatchState): Set<string> {
  const uids = new Set<string>();
  const addCard = (card: DeckCard | null | undefined) => {
    const uid = cardUid(card);
    if (uid) uids.add(uid);
  };
  for (const card of state.draw) addCard(card);
  for (const card of state.used) addCard(card);
  for (const player of state.players) {
    for (const card of player.hand) addCard(card);
    for (const placed of player.ecosystem.placed.values()) addCard(placed.card);
  }
  addCard(state.pendingDisaster?.creator);
  return uids;
}

/* ----------------------- move dispatch ----------------------- */

function applyMove(state: MatchState, move: Move, callerPlayerId: string): MatchState {
  switch (move.type) {
    case "draw_initial_5":
      return drawInitialFive(state);
    case "pickup_from_draw":
      return pickFromDraw(state);
    case "pickup_from_used":
      return pickFromUsed(state);
    case "skip_draws":
      return skipDraws(state);
    case "end_turn":
      return endTurnEarly(state);
    case "place":
      return placeOnEcosystem(state, move.uid, move.pos);
    case "discard":
      return discardCard(state, move.uid);
    case "play_disaster":
      return playDisaster(state, move.uid);
    case "resolve_disaster":
      return resolveDisaster(state, !!move.use_hive);
    case "play_sky_steal":
      return playSkyCreatureSteal(
        state,
        move.uid,
        move.from_player_id,
        move.victim_pos_key,
        move.place_at,
      );
    case "rotate_hex":
      // Caller can only rotate hexes in their own ecosystem.
      return rotateMyPlacedHex(state, callerPlayerId, move.pos_key);
    case "move_hex":
      // Caller can only reposition hexes in their own ecosystem.
      return moveMyPlacedHex(state, callerPlayerId, move.from_key, move.to_pos);
    case "finalise_by_score": {
      // Legality: only legal in beat_clock mode after the match deadline.
      // Allow a 2s clock-skew tolerance so the first client whose timer
      // fires isn't rejected by a server that thinks the deadline is a
      // beat away.
      const endsAt = state.gameConfig?.matchEndsAt ?? 0;
      if (state.gameMode !== "beat_clock" || !endsAt || Date.now() + 2000 < endsAt) {
        throw new Error("finalise_by_score not legal: match has not ended");
      }
      return finaliseByScore(state);
    }
    case "concede": {
      // No engine fn — straight mutation. The caller's opponent wins.
      // Caller authority is enforced below (slot resolution).
      throw new Error("__handled_in_dispatcher__");
    }
  }
}

/* ----------------------- entrypoint ----------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

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

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: match, error: matchErr } = await svc
    .from("game_matches")
    .select("*")
    .eq("id", body.match_id)
    .maybeSingle();
  if (matchErr || !match) return jsonResponse({ error: "match not found" }, 404);

  // A.1: roster lookup. PvP membership now comes from game_match_players.
  // Solo bot matches (is_ranked=false) have no roster row for the bot — fall
  // back to the legacy host_user_id check for the human side.
  const { data: roster, error: rosterErr } = await svc
    .from("game_match_players")
    .select("user_id, slot, display_name")
    .eq("match_id", body.match_id)
    .order("slot", { ascending: true });
  if (rosterErr) {
    console.error("[apply-move] roster fetch failed", rosterErr);
    return jsonResponse({ error: "roster fetch failed" }, 500);
  }

  const rosterRows = (roster ?? []) as Array<{ user_id: string; slot: number; display_name: string }>;
  const callerRosterRow = rosterRows.find((r) => r.user_id === userId);
  const isLegacyHost = match.host_user_id === userId && rosterRows.length === 0;
  if (!callerRosterRow && !isLegacyHost) {
    return jsonResponse({ error: "not a player in this match" }, 403);
  }

  if (Number(match.seq ?? 0) !== body.expected_seq) {
    return jsonResponse(
      { error: "stale", current_seq: Number(match.seq ?? 0) },
      409,
    );
  }

  // Slot resolution: prefer roster.slot; fall back to host/guest for
  // pre-A.1 rows without a roster.
  const callerSlot = callerRosterRow
    ? callerRosterRow.slot
    : match.host_user_id === userId
      ? 0
      : 1;
  // A.1 stays 2-player; A.2 generalises this to N opponents.
  const otherSlot = callerSlot === 0 ? 1 : 0;

  let state: MatchState;
  try {
    state = deserialise(match.state);
  } catch (e) {
    console.error("[apply-move] deserialise failed", e);
    return jsonResponse({ error: "state corrupt" }, 500);
  }
  if (!state?.players?.length) {
    return jsonResponse({ error: "match has no state" }, 500);
  }

  const callerPlayerId = state.players[callerSlot]?.id;
  const otherPlayerId = state.players[otherSlot]?.id;
  if (!callerPlayerId || !otherPlayerId) {
    return jsonResponse({ error: "player slot empty" }, 500);
  }

  // Name sync: prefer roster display_name; fall back to legacy host/guest_name.
  const nameForSlot = (slot: number): string => {
    const r = rosterRows.find((x) => x.slot === slot);
    if (r?.display_name) return r.display_name;
    return slot === 0 ? (match.host_name ?? "") : (match.guest_name ?? "");
  };
  let namesPatched = false;
  state.players = state.players.map((p, i) => {
    const rowName = nameForSlot(i);
    if (rowName && p.name !== rowName) {
      namesPatched = true;
      return { ...p, name: rowName };
    }
    return p;
  });
  if (namesPatched) console.log("[apply-move] patched player names from roster");

  // Build a map of slot → user_id for per-player state writes.
  const userIdForSlot = (slot: number): string | null => {
    const r = rosterRows.find((x) => x.slot === slot);
    if (r) return r.user_id;
    if (slot === 0) return match.host_user_id ?? null;
    if (slot === 1) return match.guest_user_id ?? null;
    return null;
  };

  const preStateSeq = Number(match.seq ?? 0);
  const preStateUids = allStateUids(state);
  const preCallerHandUids = state.players[callerSlot]?.hand.map((card) => card.uid) ?? [];
  const payloadUids = movePayloadUids(body.move);
  console.log(
    `[server] apply-move received\n` +
      `  match_id: ${body.match_id}\n` +
      `  caller_slot: ${callerSlot}\n` +
      `  move_type: ${body.move.type}\n` +
      `  move_payload_uids: ${JSON.stringify(payloadUids)}\n` +
      `  pre_state_seq: ${preStateSeq}\n` +
      `  pre_state_caller_hand_uids: ${JSON.stringify(preCallerHandUids)}`,
  );

  // Turn check (skipped for non-turn-bound actions).
  // rotate_hex is purely presentational on the caller's own ecosystem, so
  // we allow it any time. Everything else requires it to be the caller's turn.
  const NON_TURN_MOVES = new Set<Move["type"]>([
    "resolve_disaster",
    "concede",
    "rotate_hex",
    "finalise_by_score",
  ]);
  if (!NON_TURN_MOVES.has(body.move.type)) {
    if (state.turn !== callerSlot) {
      console.warn("[apply-move] not your turn", {
        match_id: body.match_id,
        move: body.move.type,
        callerSlot,
        stateTurn: state.turn,
      });
      return jsonResponse({ error: "not your turn", message: "Not your turn yet" }, 400);
    }
  }
  if (body.move.type === "resolve_disaster") {
    if (state.pendingDisaster?.victimId !== callerPlayerId) {
      return jsonResponse({ error: "you are not the disaster victim", message: "You are not the disaster victim" }, 400);
    }
  }

  // ----- apply -----
  let nextState: MatchState;
  if (body.move.type === "concede") {
    nextState = {
      ...state,
      players: state.players.map((p) => ({ ...p })),
      finished: true,
      winnerId: otherPlayerId,
      lastEvent: `${state.players[callerSlot].name} conceded.`,
    };
  } else {
    try {
      nextState = applyMove(state, body.move, callerPlayerId);
    } catch (e) {
      console.warn("[apply-move] illegal move", {
        match_id: body.match_id,
        move: body.move,
        callerSlot,
        stateTurn: state.turn,
        message: (e as Error).message,
      });
      return jsonResponse(
        { error: "illegal move", message: (e as Error).message },
        400,
      );
    }
  }

  const postStateSeq = body.expected_seq + 1;
  const postStateUids = allStateUids(nextState);
  const anyUidDrift = Array.from(postStateUids).some((uid) => !preStateUids.has(uid));
  console.log(
    `[server] engine result\n` +
      `  post_state_seq: ${postStateSeq}\n` +
      `  any_uid_drift: ${anyUidDrift}`,
  );

  const finished = !!nextState.finished;
  let winnerUserId: string | null = null;
  if (finished && nextState.winnerId) {
    const winnerSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
    if (winnerSlot >= 0) winnerUserId = userIdForSlot(winnerSlot);
  }

  const serialisedNext = serialise(nextState);
  const publicStateForCaller = redactFor(serialisedNext, callerPlayerId);

  // Build per-player redacted states (A.1: still 2; A.2 generalises to N).
  // Solo bot matches won't have a user_id for the bot slot — skip those.
  const playerStates: Array<{ user_id: string; state: any }> = [];
  for (let slot = 0; slot < nextState.players.length; slot++) {
    const uid = userIdForSlot(slot);
    if (!uid) continue;
    const pid = nextState.players[slot]?.id;
    if (!pid) continue;
    playerStates.push({ user_id: uid, state: redactFor(serialisedNext, pid) });
  }

  const { error: commitErr } = await svc.rpc("commit_move", {
    _match_id: body.match_id,
    _expected_seq: body.expected_seq,
    _actor: userId,
    _move: body.move as any,
    _new_state: serialisedNext,
    _player_states: playerStates as any,
    _winner: winnerUserId,
    _finished: finished,
  });
  if (commitErr) {
    const code = (commitErr as any).code ?? "";
    const msg = String(commitErr.message ?? "");
    if (code === "40001" || msg.includes("stale seq")) {
      return jsonResponse({ error: "stale", message: msg }, 409);
    }
    console.error("[apply-move] commit failed", commitErr);
    return jsonResponse({ error: "commit failed", detail: msg }, 500);
  }

  // Server-vouched ranked match outcome. Only fires for ranked PvP matches
  // that just transitioned to finished. The RPC is service-role only and is
  // idempotent (it tags `state.__finalised`).
  if (finished && match.is_ranked) {
    const { error: finErr } = await svc.rpc("finalise_ranked_match", {
      _match_id: body.match_id,
    });
    if (finErr) console.error("[apply-move] finalise_ranked_match failed", finErr);
  }

  return jsonResponse({
    ok: true,
    seq: body.expected_seq + 1,
    public_state: publicStateForCaller,
    finished,
    winner_user_id: winnerUserId,
  });
});
