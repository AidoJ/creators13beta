/**
// engine-mirror-hash: 9d68fd08cabfd6d0
 * forfeit-stale-disconnects — A.4 disconnect sweep.
 *
 * Cron-invoked every 30s (see migration). Three responsibilities, run in
 * order per invocation:
 *
 *   1. STAMP: for any active player whose `last_seen_at` is older than
 *      `game_settings.presence_debounce_seconds` and has no
 *      `disconnected_at` yet, set `disconnected_at = last_seen_at` (stable
 *      start time, NOT now()). This is the server-side debounce — transient
 *      client flapping never reaches the DB because report-presence only
 *      bumps last_seen_at; we only convert it into a disconnect once it's
 *      been silent long enough.
 *
 *   2. PAST-GRACE AUTO-SKIP: if the current `state.turn` slot is held by a
 *      player whose disconnect age
 *      exceeds `disconnect_grace_seconds`, the sweep deserialises the state,
 *      injects roster disconnect stamps + grace, calls the engine's
 *      `forceAdvanceTurn`, and commits the result through `commit_move` —
 *      identical to a normal apply-move. The engine's existing ≤1-active
 *      check inside `advanceTurn` is what ends the match (with proper
 *      placements / winnerId / lastEvent), NOT this sweep. The sweep never
 *      writes finished-state directly in this branch.
 *
 *      Idempotency: only fires when `state.turn` is held by a past-grace
 *      seat. After a successful auto-skip, `state.turn` belongs to a
 *      connected player — the next sweep tick observes that and no-ops.
 *      Two concurrent ticks → second one hits `commit_move`'s `stale seq`
 *      (40001) and is caught + ignored. If `state.turn` is held by a
 *      connected player while a different seat is past-grace, we do
 *      nothing: their next real move will run `advanceTurn`, which sees
 *      the past-grace seat and finalises through the same engine path.
 *
 * The engine import below is what binds this function to the engine-mirror
 * hash marker (auto-stamped by scripts/sync-game-engine.sh on line 2 of
 * this file). Any change to _shared/game/ forces a new hash → marker line
 * changes → Lovable auto-redeploys this function.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

import { endTurnEarly, forceAdvanceTurn, forceFinaliseDisconnect2p } from "../_shared/game/engine.ts";
import type { Ecosystem, MatchState, PlacedCard } from "../_shared/game/types.ts";

// engine-mirror dispatch shape for the idle auto-pass synthetic move.
type IdleSweepMove = { type: "sweep_idle_autopass" | "sweep_idle_departed"; slot: number };


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* --- serialize/deserialize: mirror of apply-move's inlined helpers so the
   engine input/output shapes are byte-identical between the two callers.
   If you edit one, edit both (or extract to _shared). --- */
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


interface SettingsRow {
  presence_debounce_seconds: number | null;
  disconnect_grace_seconds: number | null;
  idle_turn_seconds: number | null;
  idle_turn_strikes_limit: number | null;
  active_turn_skip_grace_seconds: number | null;
}

interface MatchSweepRow {
  id: string;
  is_ranked: boolean | null;
  status: string;
  player_count: number | null;
  state: any;
  seq: number | null;
  host_user_id: string | null;
  started_at: string | null;
}

interface RosterRow {
  match_id: string;
  user_id: string;
  slot: number;
  status: string | null;
  last_seen_at: string | null;
  disconnected_at: string | null;
  rank: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Triggered by pg_cron via net.http_post — POST with apikey header. We do
  // not require a user JWT here (service-role internal action).
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Load tunables.
  let debounceSec = 15;
  let graceSec = 300;
  let idleSec = 90;
  let idleStrikesLimit = 3;
  try {
    const { data: settings } = await svc
      .from("game_settings")
      .select("presence_debounce_seconds, disconnect_grace_seconds, idle_turn_seconds, idle_turn_strikes_limit")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<SettingsRow>();
    if (settings) {
      const d = Number(settings.presence_debounce_seconds);
      const g = Number(settings.disconnect_grace_seconds);
      const i = Number(settings.idle_turn_seconds);
      const k = Number(settings.idle_turn_strikes_limit);
      if (Number.isFinite(d) && d > 0) debounceSec = d;
      if (Number.isFinite(g) && g > 0) graceSec = g;
      if (Number.isFinite(i) && i > 0) idleSec = i;
      if (Number.isFinite(k) && k > 0) idleStrikesLimit = k;
    }
  } catch (e) {
    console.warn("[sweep] settings read failed; using defaults", e);
  }

  // Startup grace: a freshly-started match must not be swept before its
  // clients have had time to establish presence on /play. We use 2x the
  // debounce (with a 30s floor) so even a slow first ping after start
  // can't be misread as "disconnected". This is the structural fix —
  // start-time last_seen_at refresh in commit_start_lobby is only belt.
  const startupGraceSec = Math.max(debounceSec * 2, 30);
  const startupCutoffIso = new Date(Date.now() - startupGraceSec * 1000).toISOString();

  const summary = {
    stamped: 0,
    past_grace_forfeited: 0,
    matches_scanned: 0,
    matches_skipped_startup_grace: 0,
    idle_auto_passed: 0,
    idle_departed: 0,
    debounce_sec: debounceSec,
    grace_sec: graceSec,
    startup_grace_sec: startupGraceSec,
    idle_sec: idleSec,
    idle_strikes_limit: idleStrikesLimit,
  };

  // Build the set of match ids currently in startup grace, so we can skip
  // them in both the stamp step and the per-match loop below.
  const startupGraceMatchIds = new Set<string>();
  try {
    const { data: youngMatches } = await svc
      .from("game_matches")
      .select("id")
      .eq("status", "active")
      .not("started_at", "is", null)
      .gt("started_at", startupCutoffIso);
    for (const r of (youngMatches ?? []) as Array<{ id: string }>) {
      startupGraceMatchIds.add(r.id);
    }
  } catch (e) {
    console.warn("[sweep] startup-grace lookup failed", e);
  }

  // 2. STAMP: convert silent last_seen_at into disconnected_at.
  //    disconnected_at = last_seen_at (stable start; NOT now()).
  try {
    const cutoff = new Date(Date.now() - debounceSec * 1000).toISOString();
    const { data: rows, error: selErr } = await svc
      .from("game_match_players")
      .select("match_id, user_id, last_seen_at")
      .is("disconnected_at", null)
      .eq("status", "active")
      .lt("last_seen_at", cutoff);
    if (selErr) throw selErr;
    for (const r of rows ?? []) {
      if (startupGraceMatchIds.has(r.match_id as string)) {
        // Don't penalise a match that just started — clients may not have
        // pinged /play yet. The next sweep will catch real silence.
        continue;
      }
      await svc
        .from("game_match_players")
        .update({ disconnected_at: r.last_seen_at })
        .eq("match_id", r.match_id)
        .eq("user_id", r.user_id)
        .is("disconnected_at", null);
      summary.stamped += 1;
    }
  } catch (e) {
    console.error("[sweep] stamp step failed", e);
  }

  // 2.5. IDLE SWEEP — baseline per-turn idle timeout for End-of-Days +
  //      Top Score (Beat-the-Clock has its own turn timer in apply-move
  //      + useBeatTheClockTimer and is skipped here).
  //
  //      For each active match whose current turn has been idle past
  //      `idle_turn_seconds`:
  //        - Increment the current-turn player's `idle_strikes`.
  //        - If new strike count < limit: AUTO-PASS the seat (engine
  //          forceAdvanceTurn with a transient injected past-grace
  //          disconnect for that slot, exactly like the past-grace skip
  //          flow below) and bump `turn_started_at`.
  //        - If new strike count >= limit: ESCALATE — stamp the roster
  //          row as departed (`disconnected_at = now - graceMs - 1s`,
  //          `disconnect_reason = 'idle_departed'`) so the standard
  //          disconnect path picks them up in the SAME tick (2-player
  //          instant-end OR past-grace skip in 3+ player matches). The
  //          rank-by-score finalisation is the same one used for genuine
  //          disconnects — an absent player is not a quitter.
  //
  //      ALSO: if the current-turn player is `disconnected_at` past the
  //      presence debounce, force-advance the seat IMMEDIATELY (no idle
  //      strike). The engine semantic is "disconnect-within-grace is skip,
  //      not stuck" — and without this, the table sat blocked until the
  //      full 300s past-grace forfeit kicked in, which read as a freeze
  //      when the active turn-holder dropped offline.
  try {
    // Wider scan: any active match with a turn_started_at. Per-row gate
    // below decides whether to act (disconnected → immediate, idle → 120s).
    const { data: idleMatches } = await svc
      .from("game_matches")
      .select("id, state, seq, player_count, is_ranked, started_at, turn_started_at")
      .eq("status", "active")
      .not("turn_started_at", "is", null);

    for (const m of (idleMatches ?? []) as MatchSweepRow[]) {
      if (startupGraceMatchIds.has(m.id)) continue;
      const ms = (m.state ?? {}) as any;
      // Skip Beat-the-Clock — its own turn timer is the strategic mechanism.
      if (ms.gameMode === "beat_clock") continue;
      // Skip finished states defensively (status=active should preclude this).
      if (ms.finished) continue;
      const slot = Number(ms.turn);
      if (!Number.isFinite(slot)) continue;

      const { data: rrow } = await svc
        .from("game_match_players")
        .select("user_id, slot, status, idle_strikes, disconnected_at")
        .eq("match_id", m.id)
        .eq("slot", slot)
        .maybeSingle();
      if (!rrow) continue;
      if ((rrow.status ?? "active") !== "active") continue;

      const turnAgeMs = m.turn_started_at
        ? Date.now() - Date.parse(m.turn_started_at)
        : 0;
      const discAgeMs = rrow.disconnected_at
        ? Date.now() - Date.parse(rrow.disconnected_at)
        : 0;
      const isAbsent = !!rrow.disconnected_at && discAgeMs > debounceSec * 1000;
      const isIdle = !rrow.disconnected_at && turnAgeMs > idleSec * 1000;
      if (!isAbsent && !isIdle) continue;
      // Absent current-turn player → skip seat with no strike penalty.
      // Idle current-turn player → strike logic below.
      let skipStrike = isAbsent;

      // Fairness guard: never strike a player who had NO legal action.
      // Concrete wedge: phase==="draw" but hand.length >= HAND_LIMIT — engine
      // refused draws (hand limit) AND refused plays/discards (wrong phase).
      // Detect BEFORE escalation so we don't false-depart a wedged seat.
      if (!skipStrike) {
        try {
          const preState = deserialise(m.state);
          const preP = preState.players[slot];
          if (preState.phase === "draw" && (preP?.hand?.length ?? 0) >= 5) {
            skipStrike = true;
            console.log(`[sweep] wedged-seat guard: no strike match=${m.id} slot=${slot}`);
          }
        } catch { /* ignore — auto-pass block will re-report */ }
      }

      const newStrikes = skipStrike
        ? Number(rrow.idle_strikes ?? 0)
        : Number(rrow.idle_strikes ?? 0) + 1;


      if (!skipStrike && newStrikes >= idleStrikesLimit) {
        // ESCALATE → reuse disconnect rank-by-score path. Stamp with
        // disconnected_at in the past so past-grace fires THIS tick.
        const stampIso = new Date(Date.now() - graceSec * 1000 - 1000).toISOString();
        const { error: stampErr } = await svc
          .from("game_match_players")
          .update({
            disconnected_at: stampIso,
            disconnect_reason: "idle_departed",
            idle_strikes: newStrikes,
          })
          .eq("match_id", m.id)
          .eq("user_id", rrow.user_id);
        if (stampErr) {
          console.error(`[sweep] idle escalate stamp failed match=${m.id}`, stampErr);
          continue;
        }
        summary.idle_departed += 1;
        console.log(
          `[sweep] idle departed match=${m.id} slot=${slot} user=${rrow.user_id} strikes=${newStrikes}/${idleStrikesLimit}`,
        );
        // The downstream candidate fetch + 2p-instant-end / past-grace
        // loop below will pick this up in the same invocation.
        continue;
      }


      // AUTO-PASS: advance the turn without disconnecting. This must NOT
      // inject a fake past-grace disconnect for the current slot: in a 2P
      // match that leaves only one continuing player, so the engine correctly
      // finalises the match — but that is wrong for a 1st/2nd idle strike.
      // Instead, apply the same reducer as a manual "end turn" and record
      // the strike below; only the 3rd strike escalates to idle_departed.
      try {
        let state: MatchState;
        try {
          state = deserialise(m.state);
        } catch (e) {
          console.error(`[sweep] idle deserialise failed match=${m.id}`, e);
          continue;
        }
        const nextState = endTurnEarly(state);
        if (nextState === state) {
          console.log(`[sweep] idle force-advance no-op match=${m.id}`);
          continue;
        }
        // Keep match.state free of transient presence flags; the roster table
        // remains the source of truth for real disconnects.
        nextState.players = nextState.players.map((p) => ({ ...p, disconnectedAt: null }));

        const { data: rosterAll } = await svc
          .from("game_match_players")
          .select("user_id, slot")
          .eq("match_id", m.id);
        const userIdForSlot = (s: number): string | null =>
          (rosterAll ?? []).find((x: any) => x.slot === s)?.user_id ?? null;

        const serialisedNext = serialise(nextState);
        const playerStates: Array<{ user_id: string; state: any }> = [];
        for (let s = 0; s < nextState.players.length; s++) {
          const uid = userIdForSlot(s);
          if (!uid) continue;
          const pid = nextState.players[s]?.id;
          if (!pid) continue;
          playerStates.push({ user_id: uid, state: redactFor(serialisedNext, pid) });
        }

        const move: IdleSweepMove = { type: "sweep_idle_autopass", slot };
        const { error: commitErr } = await svc.rpc("commit_move", {
          _match_id: m.id,
          _expected_seq: Number(m.seq ?? 0),
          _actor: rrow.user_id,
          _move: move as any,
          _new_state: serialisedNext,
          _player_states: playerStates as any,
          _winner: null,
          _finished: false,
          _placements: null,
        });
        if (commitErr) {
          const code = (commitErr as any).code ?? "";
          const msg = String(commitErr.message ?? "");
          if (code === "40001" || msg.includes("stale seq")) {
            // A real move landed between our read and write — drop this
            // strike (player did act after all). Don't bump idle_strikes.
            console.log(`[sweep] idle auto-pass race-lost match=${m.id}`);
            continue;
          }
          throw commitErr;
        }

        // Bump idle_strikes + refresh turn_started_at AFTER commit so the
        // next sweep tick measures from now.
        if (!skipStrike) {
          await svc
            .from("game_match_players")
            .update({ idle_strikes: newStrikes })
            .eq("match_id", m.id)
            .eq("user_id", rrow.user_id);
        }
        await svc

          .from("game_matches")
          .update({ turn_started_at: new Date().toISOString() })
          .eq("id", m.id);

        summary.idle_auto_passed += 1;
        console.log(
          `[sweep] idle auto-pass match=${m.id} slot=${slot} user=${rrow.user_id} strikes=${newStrikes}/${idleStrikesLimit}`,
        );
      } catch (e) {
        console.error(`[sweep] idle auto-pass failed match=${m.id}`, e);
      }
    }
  } catch (e) {
    console.error("[sweep] idle step failed", e);
  }

  // 3. Find every active multiplayer match with at least one disconnected
  //    active player.
  const { data: candidateRows, error: candErr } = await svc
    .from("game_match_players")
    .select("match_id")
    .not("disconnected_at", "is", null)
    .eq("status", "active");
  if (candErr) {
    console.error("[sweep] candidate fetch failed", candErr);
    return jsonResponse({ error: "candidate fetch failed" }, 500);
  }
  const matchIds = Array.from(new Set((candidateRows ?? []).map((r) => r.match_id as string)));
  summary.matches_scanned = matchIds.length;

  if (matchIds.length === 0) {
    return jsonResponse({ ok: true, ...summary });
  }

  // Pull match rows + full rosters for the affected matches.
  const { data: matches } = await svc
    .from("game_matches")
    .select("id, is_ranked, status, player_count, state, seq, host_user_id, started_at")
    .in("id", matchIds)
    .eq("status", "active");
  const { data: rosters } = await svc
    .from("game_match_players")
    .select("match_id, user_id, slot, status, last_seen_at, disconnected_at, rank")
    .in("match_id", matchIds);

  const rosterByMatch = new Map<string, RosterRow[]>();
  for (const r of (rosters ?? []) as RosterRow[]) {
    const list = rosterByMatch.get(r.match_id) ?? [];
    list.push(r);
    rosterByMatch.set(r.match_id, list);
  }

  const nowMs = Date.now();
  const graceMs = graceSec * 1000;

  for (const match of (matches ?? []) as MatchSweepRow[]) {
    // Startup grace: don't end (or auto-skip in) a match whose clients
    // may not have established presence on /play yet.
    if (match.started_at) {
      const startedMs = Date.parse(match.started_at);
      if (Number.isFinite(startedMs) && nowMs - startedMs < startupGraceSec * 1000) {
        summary.matches_skipped_startup_grace += 1;
        continue;
      }
    }
    const roster = rosterByMatch.get(match.id) ?? [];
    const activeRoster = roster.filter((r) => (r.status ?? "active") === "active");
    if (activeRoster.length === 0) continue;

    const playerCount = match.player_count ?? 2;
    const anyDisconnected = activeRoster.filter((r) => !!r.disconnected_at);
    const pastGrace = anyDisconnected.filter((r) => {
      const t = r.disconnected_at ? Date.parse(r.disconnected_at) : NaN;
      return Number.isFinite(t) && nowMs - t > graceMs;
    });

    // ---------------------------------------------------------------
    // 2-PLAYER GRACE-THEN-END: once a player's `disconnected_at` age
    // exceeds `disconnect_grace_seconds` (300s default), end the match;
    // the survivor wins. We deliberately wait the full grace (not just
    // the 15s presence debounce) so short mobile blips — screen lock,
    // wifi handoff, tab backgrounding — don't terminate the match.
    // Routed through the engine via forceFinaliseDisconnect2p so the
    // same advanceTurn ≤1-active finalise path runs that the 3+ player
    // past-grace sweep uses. No new 2-player finalise codepath.
    // ---------------------------------------------------------------
    if (playerCount <= 2 && pastGrace.length > 0) {

      // Pick any roster row as the actor for commit_move (service-role
      // bypasses the auth.uid check; commit_move only requires the
      // actor be a player in the match). Use the disconnected seat to
      // mirror the past-grace pattern semantically.
      const actorRow = pastGrace[0];
      try {
        let state: MatchState;
        try {
          state = deserialise(match.state);
        } catch (e) {
          console.error(`[sweep] 2p deserialise failed match=${match.id}`, e);
          continue;
        }
        state.disconnectGraceMs = graceMs;
        state.players = state.players.map((p, i) => {
          const r = roster.find((x) => x.slot === i);
          const at = r?.disconnected_at ? Date.parse(r.disconnected_at) : null;
          return { ...p, disconnectedAt: Number.isFinite(at) ? at : null };
        });

        const nextState = forceFinaliseDisconnect2p(state, nowMs);
        if (!nextState.finished) {
          // Defensive: in 2-player, with one disconnected and grace=0,
          // advanceTurn must finalise. If it didn't, log and skip.
          console.warn(`[sweep] 2p force-finalise produced non-finished state match=${match.id}`);
          continue;
        }

        // Belt-and-braces: whatever finalise path ran inside the engine, this
        // sweep only fires because at least one seat is past-grace. Flag the
        // match state so the MatchOverDialog shows the "opponent left"
        // framing, and treat it as a no-contest (no ELO / no ranked points).
        nextState.endedByDisconnect = true;

        const userIdForSlot = (slot: number): string | null =>
          roster.find((r) => r.slot === slot)?.user_id ?? null;

        let winnerUserId: string | null = null;
        if (nextState.winnerId) {
          const wSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
          if (wSlot >= 0) winnerUserId = userIdForSlot(wSlot);
        }

        const serialisedNext = serialise(nextState);
        // Pre-mark __finalised in the persisted state so finalise_ranked_match
        // is a no-op even if some other code path invokes it later. This is
        // the mechanism that makes disconnect-wins a NO-CONTEST: no points,
        // no ELO, no wins/losses recorded.
        (serialisedNext as any).__finalised = true;
        (serialisedNext as any).endedByDisconnect = true;
        const playerStates: Array<{ user_id: string; state: any }> = [];
        for (let slot = 0; slot < nextState.players.length; slot++) {
          const uid = userIdForSlot(slot);
          if (!uid) continue;
          const pid = nextState.players[slot]?.id;
          if (!pid) continue;
          playerStates.push({ user_id: uid, state: redactFor(serialisedNext, pid) });
        }

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
          _match_id: match.id,
          _expected_seq: Number(match.seq ?? 0),
          _actor: actorRow.user_id,
          _move: { type: "sweep_2p_disconnect_end" } as any,
          _new_state: serialisedNext,
          _player_states: playerStates as any,
          _winner: winnerUserId,
          _finished: true,
          _placements: placementsSnapshot.length > 0 ? (placementsSnapshot as any) : null,
        });
        if (commitErr) {
          const code = (commitErr as any).code ?? "";
          const msg = String(commitErr.message ?? "");
          if (code === "40001" || msg.includes("stale seq")) {
            console.log(`[sweep] 2p instant-end race-lost match=${match.id} (concurrent commit)`);
            continue;
          }
          throw commitErr;
        }

        // NO-CONTEST: intentionally NOT calling finalise_ranked_match here.
        // Disconnect-ended matches must not award ELO or ranked points to
        // either seat (otherwise rage-quitting feeds wins to opponents).


        summary.past_grace_forfeited += 1;
        console.log(
          `[sweep] 2p instant-end match=${match.id} winner=${winnerUserId ?? "DRAW"}`,
        );
      } catch (e) {
        console.error(`[sweep] 2p instant-end failed match=${match.id}`, e);
      }
      continue;
    }

    // ---------------------------------------------------------------
    // PAST-GRACE AUTO-SKIP (3+ players): the sweep NEVER writes
    // finished-state directly. It only auto-skips the current turn
    // when that turn is held by a past-grace disconnected seat (the
    // match would otherwise hang forever because the disconnected
    // player will never call apply-move to trigger advanceTurn). The
    // engine's advanceTurn handles the ≤1-active end via its existing
    // finalise() path — placements, winnerId, lastEvent all populated
    // correctly, identical shape to a normal match end.
    //
    // If state.turn is held by a CONNECTED player while a different
    // seat is past-grace, do nothing: their next real move will fire
    // advanceTurn and the engine will end the match cleanly.
    // ---------------------------------------------------------------
    if (pastGrace.length === 0) continue;

    const stateTurn = Number((match.state ?? {}).turn);
    if (!Number.isFinite(stateTurn)) continue;
    const turnIsPastGrace = pastGrace.some((r) => r.slot === stateTurn);
    if (!turnIsPastGrace) {
      // Engine will handle on the next real move from a connected player.
      continue;
    }

    const actorRow = activeRoster.find((r) => r.slot === stateTurn);
    if (!actorRow) continue;

    try {
      // Build the engine state exactly the way apply-move does: inject
      // grace + per-slot disconnectedAt from the roster so advanceTurn
      // sees who's past-grace.
      let state: MatchState;
      try {
        state = deserialise(match.state);
      } catch (e) {
        console.error(`[sweep] deserialise failed match=${match.id}`, e);
        continue;
      }
      state.disconnectGraceMs = graceMs;
      state.players = state.players.map((p, i) => {
        const r = roster.find((x) => x.slot === i);
        const at = r?.disconnected_at ? Date.parse(r.disconnected_at) : null;
        return { ...p, disconnectedAt: Number.isFinite(at) ? at : null };
      });

      const nextState = forceAdvanceTurn(state, nowMs);
      // Guard: if forceAdvanceTurn no-op'd (shouldn't happen given the
      // turnIsPastGrace check, but defensive), skip.
      if (nextState === state) {
        console.log(`[sweep] past-grace force-advance no-op match=${match.id}`);
        continue;
      }

      const finished = !!nextState.finished;
      // If the match ended THIS tick because of a past-grace disconnect, treat
      // it as a no-contest — no ranked points, no ELO. This covers the 3/4-
      // player case where one or more players go past-grace and the survivors'
      // ≤1-active check trips finalise. Rage-quitting a bad match must not
      // feed wins to whoever happened to still be connected.
      if (finished) {
        nextState.endedByDisconnect = true;
      }
      const userIdForSlot = (slot: number): string | null =>
        roster.find((r) => r.slot === slot)?.user_id ?? null;

      let winnerUserId: string | null = null;
      if (finished && nextState.winnerId) {
        const wSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
        if (wSlot >= 0) winnerUserId = userIdForSlot(wSlot);
      }

      const serialisedNext = serialise(nextState);
      if (finished) {
        // Pre-mark __finalised so finalise_ranked_match short-circuits.
        (serialisedNext as any).__finalised = true;
        (serialisedNext as any).endedByDisconnect = true;
      }
      const playerStates: Array<{ user_id: string; state: any }> = [];
      for (let slot = 0; slot < nextState.players.length; slot++) {
        const uid = userIdForSlot(slot);
        if (!uid) continue;
        const pid = nextState.players[slot]?.id;
        if (!pid) continue;
        playerStates.push({ user_id: uid, state: redactFor(serialisedNext, pid) });
      }

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
        _match_id: match.id,
        _expected_seq: Number(match.seq ?? 0),
        _actor: actorRow.user_id,
        _move: { type: "sweep_skip_disconnected", slot: stateTurn } as any,
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
          console.log(`[sweep] past-grace skip race-lost match=${match.id} (concurrent commit)`);
          continue;
        }
        throw commitErr;
      }

      // NO-CONTEST: disconnect-ended matches never call finalise_ranked_match.
      // (Pre-set __finalised above is a second belt on the same braces.)


      summary.past_grace_forfeited += 1;
      console.log(
        `[sweep] past-grace auto-skip match=${match.id} skipped_slot=${stateTurn} finished=${finished}${finished ? ` winner=${winnerUserId ?? "DRAW"}` : ""}`,
      );
    } catch (e) {
      console.error(`[sweep] past-grace auto-skip failed match=${match.id}`, e);
    }
  }


  console.log("[sweep] done", summary);
  return jsonResponse({ ok: true, ...summary });
});
