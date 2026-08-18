/**
// engine-mirror-hash: 52a692786ebd3056
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
import { finaliseRankedMatchWithRetry } from "../_shared/finaliseRankedMatch.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { endTurnEarly, forceAdvanceTurn, forceFinaliseDisconnect2p } from "../_shared/game/engine.ts";
import type { Ecosystem, MatchState, PlacedCard } from "../_shared/game/types.ts";

// engine-mirror dispatch shape for the idle auto-pass synthetic move.
type IdleSweepMove = { type: "sweep_idle_autopass" | "sweep_idle_departed"; slot: number };


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** How long a client-reported server stall pauses the idle clock for that
 *  seat. Comfortably longer than the client's 20s apply-move ceiling plus
 *  its queued replay, short enough that a genuinely absent player still
 *  gets swept soon after. */
const SERVER_STALL_PAUSE_SEC = 120;

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
  turn_started_at: string | null;
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

  // SINGLE-FLIGHT GUARD. pg_cron fires every 30s and pg_net gives up on the
  // response after 5s, so a slow tick used to overlap the next one — each
  // overlapping tick holding its own set of PostgREST requests. Under any
  // slowdown that compounds until the connection pool is exhausted (the
  // 03 Aug outage). A short DB lease means at most one sweep runs at a time
  // and late ticks exit immediately instead of piling on.
  const LEASE_SECONDS = 55;
  try {
    const { data: gotLease, error: leaseErr } = await svc.rpc("acquire_sweep_lease", {
      _key: "forfeit-stale-disconnects",
      _ttl_seconds: LEASE_SECONDS,
    });
    if (leaseErr) {
      console.warn("[sweep] lease acquisition errored; skipping tick", leaseErr);
      return jsonResponse({ ok: true, skipped: "lease_error" });
    }
    if (!gotLease) {
      return jsonResponse({ ok: true, skipped: "another_sweep_running" });
    }
  } catch (e) {
    console.warn("[sweep] lease acquisition threw; skipping tick", e);
    return jsonResponse({ ok: true, skipped: "lease_throw" });
  }

  // Hard wall-clock budget: never let one tick run long enough to overlap
  // the lease window.
  const startedAtMs = Date.now();
  const BUDGET_MS = 20_000;
  const outOfBudget = () => Date.now() - startedAtMs > BUDGET_MS;


  // 0. Reap abandoned matches: waiting lobbies idle > 15 min, active matches
  // idle > 30 min. Closed with no winner and an audit move row.
  try {
    const { data: reaped, error: reapErr } = await svc.rpc("reap_abandoned_matches", {
      _lobby_idle_minutes: 15,
      _active_idle_minutes: 30,
    });
    if (reapErr) console.warn("[sweep] reap_abandoned_matches failed", reapErr);
    else if (reaped) console.log("[sweep] reaped", reaped);
  } catch (e) {
    console.warn("[sweep] reap threw", e);
  }

  // 1. Load tunables.
  let debounceSec = 15;
  let graceSec = 300;
  let idleSec = 90;
  let idleStrikesLimit = 3;
  let activeTurnSkipGraceSec = 45;
  try {
    const { data: settings } = await svc
      .from("game_settings")
      .select("presence_debounce_seconds, disconnect_grace_seconds, idle_turn_seconds, idle_turn_strikes_limit, active_turn_skip_grace_seconds")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<SettingsRow>();
    if (settings) {
      const d = Number(settings.presence_debounce_seconds);
      const g = Number(settings.disconnect_grace_seconds);
      const i = Number(settings.idle_turn_seconds);
      const k = Number(settings.idle_turn_strikes_limit);
      const a = Number(settings.active_turn_skip_grace_seconds);
      if (Number.isFinite(d) && d > 0) debounceSec = d;
      if (Number.isFinite(g) && g > 0) graceSec = g;
      if (Number.isFinite(i) && i > 0) idleSec = i;
      if (Number.isFinite(k) && k > 0) idleStrikesLimit = k;
      if (Number.isFinite(a) && a > 0) activeTurnSkipGraceSec = a;
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
    paused_server_stall: 0,
    ranked_backstop_finalised: 0,
    debounce_sec: debounceSec,
    grace_sec: graceSec,
    startup_grace_sec: startupGraceSec,
    idle_sec: idleSec,
    idle_strikes_limit: idleStrikesLimit,
    active_turn_skip_grace_sec: activeTurnSkipGraceSec,
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
  //    disconnected_at = last_seen_at (stable start; NOT now()) — used for
  //    match-forfeit grace so the 5min clock runs from when the player was
  //    actually last seen.
  //    disconnect_stamped_at = now() — used for the active-turn-skip grace
  //    so the shorter turn-skip window runs from when we NOTICED the
  //    disconnect, not from last_seen_at (which already ate ~15s of
  //    debounce before we could stamp it).
  try {
    const cutoff = new Date(Date.now() - debounceSec * 1000).toISOString();
    const nowIso = new Date().toISOString();
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
        .update({ disconnected_at: r.last_seen_at, disconnect_stamped_at: nowIso })
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
      .not("turn_started_at", "is", null)
      .limit(2000);
    if ((idleMatches ?? []).length >= 2000) {
      console.warn("[sweep] idle-match candidate query hit row limit (2000); some matches may not be swept");
    }

    // Batch-fetch all roster rows for the candidate matches once, then look
    // them up inside the loop. This avoids N+1 per-match queries against
    // game_match_players on every 30-second tick.
    const idleMatchIds = (idleMatches ?? []).map((m) => m.id);
    const idleRosterByMatch = new Map<string, Array<{
      match_id: string;
      user_id: string;
      slot: number;
      status: string | null;
      idle_strikes: number | null;
      disconnected_at: string | null;
      disconnect_stamped_at: string | null;
      last_presence_gap_at: string | null;
      last_server_stall_at: string | null;
    }>>();
    if (idleMatchIds.length > 0) {
      const { data: idleRosters } = await svc
        .from("game_match_players")
        .select(
          "match_id, user_id, slot, status, idle_strikes, disconnected_at, disconnect_stamped_at, last_presence_gap_at, last_server_stall_at",
        )
        .in("match_id", idleMatchIds);
      for (const r of (idleRosters ?? []) as Array<{
        match_id: string;
        user_id: string;
        slot: number;
        status: string | null;
        idle_strikes: number | null;
        disconnected_at: string | null;
        disconnect_stamped_at: string | null;
        last_presence_gap_at: string | null;
        last_server_stall_at: string | null;
      }>) {
        const list = idleRosterByMatch.get(r.match_id) ?? [];
        list.push(r);
        idleRosterByMatch.set(r.match_id, list);
      }
    }

    for (const m of (idleMatches ?? []) as MatchSweepRow[]) {
      if (outOfBudget()) { console.warn("[sweep] idle loop out of budget — deferring rest"); break; }
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
        .select("user_id, slot, status, idle_strikes, disconnected_at, disconnect_stamped_at, last_presence_gap_at, last_server_stall_at")
        .eq("match_id", m.id)
        .eq("slot", slot)
        .maybeSingle();
      if (!rrow) continue;
      if ((rrow.status ?? "active") !== "active") continue;

      const turnAgeMs = m.turn_started_at
        ? Date.now() - Date.parse(m.turn_started_at)
        : 0;
      // ACTIVE-TURN SKIP GRACE — governs when a mid-turn disconnect converts
      // into an auto-pass. Measured from `disconnect_stamped_at` (when we
      // NOTICED the disconnect), NOT from disconnected_at/last_seen_at,
      // otherwise the debounce window is silently eaten by this grace.
      // Reconnect clears disconnected_at + disconnect_stamped_at via
      // report-presence, which naturally cancels the skip (isAbsent = false).
      const stampedAtMs = rrow.disconnect_stamped_at
        ? Date.parse(rrow.disconnect_stamped_at)
        : rrow.disconnected_at
        // Backfill for rows stamped before disconnect_stamped_at existed:
        // fall back to disconnected_at so old stuck disconnects still resolve.
        ? Date.parse(rrow.disconnected_at)
        : 0;
      const stampedAgeMs = stampedAtMs > 0 ? Date.now() - stampedAtMs : 0;
      const isAbsent =
        !!rrow.disconnected_at && stampedAgeMs > activeTurnSkipGraceSec * 1000;
      const isIdle = !rrow.disconnected_at && turnAgeMs > idleSec * 1000;
      if (!isAbsent && !isIdle) continue;

      // SERVER-STALL GUARD. If this seat reported an apply-move that hung or
      // died in transport within the last SERVER_STALL_PAUSE_SEC, the player
      // IS trying to move — our own pipeline is what's stuck. Auto-passing
      // (or striking) them here punishes the seat for a server fault and is
      // exactly what made matches feel like they "skipped my turn for no
      // reason". Pause the idle clock instead and re-evaluate next tick.
      const stallMs = rrow.last_server_stall_at ? Date.parse(rrow.last_server_stall_at) : NaN;
      if (Number.isFinite(stallMs) && Date.now() - stallMs < SERVER_STALL_PAUSE_SEC * 1000) {
        summary.paused_server_stall += 1;
        console.log(
          `[sweep] server-stall pause match=${m.id} slot=${slot} stall_at=${rrow.last_server_stall_at}`,
        );
        continue;
      }
      // Absent current-turn player → skip seat with no strike penalty.
      // Idle current-turn player → strike logic below.
      let skipStrike = isAbsent;

      // FLAKY-BUT-PRESENT FAIRNESS GUARD (train / bus case).
      // A player bouncing through cellular handoffs keeps returning inside
      // the debounce, so `disconnected_at` is never stamped and they look
      // "idle" to the check above. Striking them — and eventually marking
      // them idle_departed — punishes bad signal, not bad behaviour. If any
      // presence gap was recorded during THIS turn, auto-pass the seat but
      // record no strike.
      if (!skipStrike && rrow.last_presence_gap_at && m.turn_started_at) {
        const gapMs = Date.parse(rrow.last_presence_gap_at);
        const turnStartMs = Date.parse(m.turn_started_at);
        if (Number.isFinite(gapMs) && Number.isFinite(turnStartMs) && gapMs >= turnStartMs) {
          skipStrike = true;
          console.log(
            `[sweep] flaky-connection guard: no strike match=${m.id} slot=${slot} gap_at=${rrow.last_presence_gap_at}`,
          );
        }
      }

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
            disconnect_stamped_at: stampIso,
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
          // ATOMIC: the new turn's stopwatch is stamped inside the same
          // transaction as the auto-pass. Previously this was a follow-up
          // UPDATE that could fail on its own, leaving the next turn born
          // already-expired and the sweep auto-passing forever.
          _bump_turn: true,
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

        // Record the strike for the seat we just passed (commit_move zeroed
        // it as part of the turn bump, so this must come after).
        if (!skipStrike) {
          await svc
            .from("game_match_players")
            .update({ idle_strikes: newStrikes })
            .eq("match_id", m.id)
            .eq("user_id", rrow.user_id);
        }


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
    if (outOfBudget()) { console.warn("[sweep] match loop out of budget — deferring rest"); break; }
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
        // framing. The result IS ranked: survivor wins, points + ELO awarded
        // (see the finalise_ranked_match call below). Anti-exploit is handled
        // in the engine — the survivor wins by STAYING, never by score — so
        // leaving while ahead can never buy a win.
        nextState.endedByDisconnect = true;

        const userIdForSlot = (slot: number): string | null =>
          roster.find((r) => r.slot === slot)?.user_id ?? null;

        let winnerUserId: string | null = null;
        if (nextState.winnerId) {
          const wSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
          if (wSlot >= 0) winnerUserId = userIdForSlot(wSlot);
        }

        const serialisedNext = serialise(nextState);
        // NOTE: do NOT pre-mark __finalised here — that flag is what makes
        // finalise_ranked_match short-circuit, and it was the source of the
        // no-contest/survivor-wins split. finalise_ranked_match sets it
        // itself once the payout has actually been written.
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

        // SURVIVOR WINS, RANKED. Same payout path apply-move uses when a
        // connected player's move trips the ≤1-active finalise — the two
        // paths must not disagree on whether a disconnect-ended match pays.
        if (match.is_ranked) {
          await finaliseRankedMatchWithRetry(
            svc,
            match.id,
            "disconnect",
            placementsSnapshot.length > 0 ? placementsSnapshot : null,
          );
        }



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
      // If the match ended THIS tick because of a past-grace disconnect it is
      // still a RANKED result — the connected players are ranked by the
      // engine's normal finalise, the departed seats take the bottom ranks.
      // Identical to what apply-move records when a connected player's move
      // happens to trip the same ≤1-active finalise.
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
        // Do NOT pre-mark __finalised — finalise_ranked_match owns that flag
        // and sets it after the payout lands.
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
        // Atomic turn stopwatch for the seat that now holds the turn.
        _bump_turn: !finished,
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

      // Ranked payout on the same terms as apply-move's finalise.
      if (finished && match.is_ranked) {
        await finaliseRankedMatchWithRetry(
          svc,
          match.id,
          "disconnect",
          placementsSnapshot.length > 0 ? placementsSnapshot : null,
        );
      }



      summary.past_grace_forfeited += 1;
      console.log(
        `[sweep] past-grace auto-skip match=${match.id} skipped_slot=${stateTurn} finished=${finished}${finished ? ` winner=${winnerUserId ?? "DRAW"}` : ""}`,
      );
    } catch (e) {
      console.error(`[sweep] past-grace auto-skip failed match=${match.id}`, e);
    }
  }


  // 4. RANKED PAYOUT BACKSTOP. A finished ranked match whose inline
  // finalise_ranked_match call failed (timeout/pool blip) would otherwise
  // never pay out. The RPC is idempotent, so re-running it for any recent
  // finished ranked match missing `state.__finalised` is always safe.
  try {
    const backstopSinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: finishedRanked, error: frErr } = await svc
      .from("game_matches")
      .select("id, state")
      .eq("status", "finished")
      .eq("is_ranked", true)
      .gte("updated_at", backstopSinceIso)
      .limit(200);
    if (frErr) {
      console.warn("[sweep] ranked backstop query failed", frErr);
    } else {
      for (const row of finishedRanked ?? []) {
        if (outOfBudget()) {
          console.warn("[sweep] ranked backstop out of budget — deferring rest");
          break;
        }
        if ((row as any)?.state?.__finalised === true) continue;
        const res = await finaliseRankedMatchWithRetry(svc, (row as any).id, "backstop", null, 2);
        if (res.ok) {
          summary.ranked_backstop_finalised += 1;
          console.log(`[sweep] ranked backstop finalised match=${(row as any).id}`);
        }
      }
    }
  } catch (e) {
    console.warn("[sweep] ranked backstop threw", e);
  }

  console.log("[sweep] done", summary);
  return jsonResponse({ ok: true, ...summary });
});
