/**
// engine-mirror-hash: 40e77405f8a44f75
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
  | { type: "finalise_by_score" }
  | { type: "start_lobby_match" };

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
    .select("user_id, slot, display_name, disconnected_at")
    .eq("match_id", body.match_id)
    .order("slot", { ascending: true });
  if (rosterErr) {
    console.error("[apply-move] roster fetch failed", rosterErr);
    return jsonResponse({ error: "roster fetch failed" }, 500);
  }

  // A.4 — load turn/disconnect timers from game_settings so server-side move
  // validation uses the same admin-configured idle window as the sweep/UI.
  let disconnectGraceMs = 5 * 60 * 1000;
  let idleTurnMs = 90 * 1000;
  try {
    const { data: settings } = await svc
      .from("game_settings")
      .select("disconnect_grace_seconds, idle_turn_seconds")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const disconnectSecs = Number(settings?.disconnect_grace_seconds);
    const idleSecs = Number(settings?.idle_turn_seconds);
    if (Number.isFinite(disconnectSecs) && disconnectSecs > 0) disconnectGraceMs = disconnectSecs * 1000;
    if (Number.isFinite(idleSecs) && idleSecs > 0) idleTurnMs = idleSecs * 1000;
  } catch (e) {
    console.warn("[apply-move] game_settings read failed, using default timers", e);
  }


  const rosterRows = (roster ?? []) as Array<{
    user_id: string;
    slot: number;
    display_name: string;
    disconnected_at: string | null;
  }>;
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
  // A.3 — slot resolution generalised to N players. `otherSlots` is the
  // list of all slots OTHER than the caller; per-slot user IDs come from
  // the roster (with legacy host/guest fallback for pre-A.1 rows).
  const totalPlayers = Math.max(rosterRows.length, 2, Number(match.player_count ?? 2));
  const otherSlots: number[] = [];
  for (let s = 0; s < totalPlayers; s++) if (s !== callerSlot) otherSlots.push(s);

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
  if (!callerPlayerId) {
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

  // A.4 — inject disconnect state from the roster into each player so the
  // engine's auto-pass scan and ≤1-active match-end check can see it.
  // Transient: never persisted by the engine; overwritten on every load.
  // The presence layer (report-presence + forfeit-stale-disconnects sweep)
  // is the source of truth for `disconnected_at`.
  state.disconnectGraceMs = disconnectGraceMs;
  state.players = state.players.map((p, i) => {
    const r = rosterRows.find((x) => x.slot === i);
    const at = r?.disconnected_at ? Date.parse(r.disconnected_at) : null;
    return { ...p, disconnectedAt: Number.isFinite(at) ? at : null };
  });

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
    "start_lobby_match",
  ]);
  const isTurnBoundMove = !NON_TURN_MOVES.has(body.move.type);
  if (isTurnBoundMove) {
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
  const turnStartedRaw = (match as any).turn_started_at;
  const turnStartedAt = typeof turnStartedRaw === "string" ? Date.parse(turnStartedRaw) : NaN;
  const callerTurnExpired =
    match.status === "active" &&
    state.gameMode !== "beat_clock" &&
    state.turn === callerSlot &&
    Number.isFinite(turnStartedAt) &&
    Date.now() >= turnStartedAt + idleTurnMs;
  if (callerTurnExpired && body.move.type !== "concede" && body.move.type !== "resolve_disaster") {
    console.warn("[apply-move] idle turn expired", {
      match_id: body.match_id,
      move: body.move.type,
      callerSlot,
      stateTurn: state.turn,
      idle_ms: idleTurnMs,
    });
    return jsonResponse(
      { error: "turn expired", message: "Time ran out — waiting for auto-pass." },
      400,
    );
  }
  if (body.move.type === "resolve_disaster") {
    // A.3 — use victimIds (source of truth post-A.2); victimId is a
    // legacy single-element alias we no longer rely on here.
    const queue = state.pendingDisaster?.victimIds ?? [];
    if (!queue.includes(callerPlayerId)) {
      return jsonResponse(
        { error: "you are not the disaster victim", message: "You are not the disaster victim" },
        400,
      );
    }
  }

  // ----- apply -----
  let nextState: MatchState;
  let lobbyJustStarted = false;
  if (body.move.type === "concede") {
    // A.3 — route concede through the engine so ranking direction (bottom-up
    // for quitters) and N-player partial finalisation are handled correctly.
    // For N=2 the engine collapses to identical legacy behaviour.
    nextState = concedePlayer(state, callerPlayerId);
  } else if (body.move.type === "start_lobby_match") {
    // B — host-only lobby start trigger.
    //
    //   1. Authority: caller MUST be slot 0 (host). Invitees can never start.
    //   2. Match must be a lobby_mode match still in 'waiting' status.
    //   3. Roster must have AT LEAST 2 filled slots. Host-start-with-2+:
    //      empty slots are TRIMMED at start so the engine sees a clean
    //      N-player match with no phantom seats.
    //   4. Trim is one atomic transaction across four things via the
    //      commit_start_lobby RPC: (a) filter state.players to filled slots,
    //      (b) re-index game_match_players.slot contiguously 0..N-1,
    //      (c) update game_matches.player_count to actual count,
    //      (d) write per-player redacted states. All commit together with
    //      status='active' and seq+1.
    //   5. Shuffle turn order across the trimmed slots (Fisher–Yates). The
    //      host triggers the start but doesn't necessarily go first.
    if (callerSlot !== 0) {
      return jsonResponse({ error: "host only", message: "Only the host can start the match" }, 403);
    }
    if (!(match as any).lobby_mode) {
      return jsonResponse({ error: "not a lobby match" }, 400);
    }
    if (match.status !== "waiting") {
      return jsonResponse({ error: "lobby already started or closed" }, 400);
    }
    if (rosterRows.length < 2) {
      return jsonResponse({
        error: "lobby needs 2+ players",
        message: `Need at least 2 players to start (have ${rosterRows.length})`,
      }, 400);
    }

    // --- Build the trimmed state ---
    // rosterRows is already ordered by slot ascending. Map old slot -> new
    // contiguous slot, keeping the existing player objects (with their
    // user-supplied id/name) for filled slots only.
    const filledOldSlots = rosterRows
      .map((r) => r.slot)
      .filter((s) => s < state.players.length)
      .sort((a, b) => a - b);
    const slotRemap = filledOldSlots.map((oldSlot, newSlot) => ({
      old_slot: oldSlot,
      new_slot: newSlot,
    }));
    const trimmedPlayers = filledOldSlots.map((oldSlot) => state.players[oldSlot]);
    const newPlayerCount = trimmedPlayers.length;

    // Fisher–Yates over the NEW contiguous slot indices.
    const newSlotOrder = trimmedPlayers.map((_, i) => i);
    for (let i = newSlotOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newSlotOrder[i], newSlotOrder[j]] = [newSlotOrder[j], newSlotOrder[i]];
    }

    const trimmedState: MatchState = {
      ...state,
      players: trimmedPlayers,
      turnOrder: newSlotOrder,
      turn: newSlotOrder[0],
      phase: "draw",
      turnNumber: 1,
    };

    const serialisedTrimmed = serialise(trimmedState);
    // Per-player redacted states using NEW slot indices.
    const lobbyPlayerStates: Array<{ user_id: string; state: any }> = [];
    for (let newSlot = 0; newSlot < trimmedPlayers.length; newSlot++) {
      const oldSlot = filledOldSlots[newSlot];
      const rosterRow = rosterRows.find((r) => r.slot === oldSlot);
      if (!rosterRow) continue;
      const pid = trimmedPlayers[newSlot]?.id;
      if (!pid) continue;
      lobbyPlayerStates.push({
        user_id: rosterRow.user_id,
        state: redactFor(serialisedTrimmed, pid),
      });
    }

    console.log("[apply-move] start_lobby_match (trim+start)", {
      match_id: body.match_id,
      filled_old_slots: filledOldSlots,
      slot_remap: slotRemap,
      new_player_count: newPlayerCount,
      shuffled_turn_order: newSlotOrder,
      first_turn_new_slot: newSlotOrder[0],
    });

    const { error: startErr } = await svc.rpc("commit_start_lobby", {
      _match_id: body.match_id,
      _expected_seq: body.expected_seq,
      _actor: userId,
      _move: body.move as any,
      _new_state: serialisedTrimmed,
      _player_states: lobbyPlayerStates as any,
      _slot_remap: slotRemap as any,
      _new_player_count: newPlayerCount,
    });
    if (startErr) {
      const code = (startErr as any).code ?? "";
      const msg = String(startErr.message ?? "");
      if (code === "40001" || msg.includes("stale seq")) {
        return jsonResponse({ error: "stale", message: msg }, 409);
      }
      console.error("[apply-move] commit_start_lobby failed", startErr);
      return jsonResponse({ error: "commit failed", detail: msg }, 500);
    }

    // The host's redacted view of the trimmed state.
    const hostNewSlot = filledOldSlots.indexOf(0);
    const hostPid = hostNewSlot >= 0 ? trimmedPlayers[hostNewSlot]?.id ?? null : null;
    return jsonResponse({
      ok: true,
      seq: body.expected_seq + 1,
      public_state: redactFor(serialisedTrimmed, hostPid),
      finished: false,
      winner_user_id: null,
      lobby_started: true,
    });

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
      `  any_uid_drift: ${anyUidDrift}\n` +
      `  finished: ${nextState.finished}\n` +
      `  placements: ${JSON.stringify(nextState.placements ?? [])}`,
  );

  const finished = !!nextState.finished;
  // A.3 — winner resolution via roster lookup, not hardcoded slot 0/1.
  let winnerUserId: string | null = null;
  if (finished && nextState.winnerId) {
    const winnerSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
    if (winnerSlot >= 0) winnerUserId = userIdForSlot(winnerSlot);
  }

  const serialisedNext = serialise(nextState);
  const publicStateForCaller = redactFor(serialisedNext, callerPlayerId);

  // Per-player redacted states. Each player sees their own hand fully and
  // every other player's hand replaced with `handCount`. Boards are public.
  // Solo bot slots (no user_id) are skipped.
  const playerStates: Array<{ user_id: string; state: any }> = [];
  for (let slot = 0; slot < nextState.players.length; slot++) {
    const uid = userIdForSlot(slot);
    if (!uid) continue;
    const pid = nextState.players[slot]?.id;
    if (!pid) continue;
    playerStates.push({ user_id: uid, state: redactFor(serialisedNext, pid) });
  }

  // A.3 — build placements snapshot for commit_move (syncs roster table) and
  // for finalise_ranked_match (N-player ELO + points).
  const placementsSnapshot = (nextState.placements ?? [])
    .map((pl) => {
      const slot = nextState.players.findIndex((p) => p.id === pl.playerId);
      if (slot < 0) return null;
      const uid = userIdForSlot(slot);
      if (!uid) return null;
      const status = nextState.players[slot]?.status ?? "finalised";
      return { user_id: uid, rank: pl.rank, status };
    })
    .filter((x): x is { user_id: string; rank: number; status: string } => !!x);

  const { error: commitErr } = await svc.rpc("commit_move", {
    _match_id: body.match_id,
    _expected_seq: body.expected_seq,
    _actor: userId,
    _move: body.move as any,
    _new_state: serialisedNext,
    _player_states: playerStates as any,
    _winner: winnerUserId,
    _finished: finished,
    _placements: placementsSnapshot.length > 0 ? (placementsSnapshot as any) : null,
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

  // Server-vouched ranked match outcome. Idempotent — finalise_ranked_match
  // tags `state.__finalised` and short-circuits subsequent calls.
  if (finished && match.is_ranked) {
    const { error: finErr } = await svc.rpc("finalise_ranked_match", {
      _match_id: body.match_id,
      _reason: "normal",
      _placements: placementsSnapshot.length > 0 ? (placementsSnapshot as any) : null,
    });
    if (finErr) console.error("[apply-move] finalise_ranked_match failed", finErr);
  }

  // Per-turn idle stopwatch + strike reset.
  //   - turn_started_at is stamped ONCE PER TURN — only when the active seat
  //     changes (turn handed to the next player). Mid-turn actions
  //     (draw → place → rotate within the same turn) MUST NOT reset it,
  //     otherwise the idle window measures "time since last click" instead of
  //     "time since your turn began" and slow-play / disconnect-reconnect can
  //     reset the clock indefinitely.
  //   - Caller's consecutive idle strikes reset on ANY real action by that
  //     player (strikes are consecutive, per existing behaviour).
  // Skipped on finished matches (no more turns) and lobby start (handled
  // alongside the lobby flip below).
  let committedTurnStartedAt: string | null = null;
  if (!finished && !lobbyJustStarted && isTurnBoundMove) {
    const turnChanged = nextState.turn !== state.turn;
    if (turnChanged) {
      const nowIso = new Date().toISOString();
      committedTurnStartedAt = nowIso;
      const { error: bumpErr } = await svc
        .from("game_matches")
        .update({ turn_started_at: nowIso })
        .eq("id", body.match_id);
      if (bumpErr) console.warn("[apply-move] turn_started_at bump failed", bumpErr);
    }
    if (callerRosterRow) {
      const { error: strikeErr } = await svc
        .from("game_match_players")
        .update({ idle_strikes: 0 })
        .eq("match_id", body.match_id)
        .eq("user_id", userId)
        .gt("idle_strikes", 0);
      if (strikeErr) console.warn("[apply-move] idle_strikes reset failed", strikeErr);
    }
  }

  // B — flip lobby match to 'active' once the host has triggered start.
  // commit_move preserves status for non-finished moves, so we do it here.
  if (lobbyJustStarted) {
    const nowIso = new Date().toISOString();
    committedTurnStartedAt = nowIso;
    const { error: statusErr } = await svc
      .from("game_matches")
      .update({ status: "active", turn_started_at: nowIso, updated_at: nowIso })
      .eq("id", body.match_id)
      .eq("status", "waiting");
    if (statusErr) console.error("[apply-move] lobby status flip failed", statusErr);
  }

  return jsonResponse({
    ok: true,
    seq: body.expected_seq + 1,
    public_state: publicStateForCaller,
    finished,
    winner_user_id: winnerUserId,
    turn_started_at: committedTurnStartedAt ?? (match as any).turn_started_at ?? null,
    lobby_started: lobbyJustStarted,
  });
});
