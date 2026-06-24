/**
// engine-mirror-hash: 4feb47126459928b
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

import { forceAdvanceTurn, forceFinaliseDisconnect2p } from "../_shared/game/engine.ts";
import type { Ecosystem, MatchState, PlacedCard } from "../_shared/game/types.ts";


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
}

interface MatchSweepRow {
  id: string;
  is_ranked: boolean | null;
  status: string;
  player_count: number | null;
  state: any;
  seq: number | null;
  host_user_id: string | null;
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
  try {
    const { data: settings } = await svc
      .from("game_settings")
      .select("presence_debounce_seconds, disconnect_grace_seconds")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<SettingsRow>();
    if (settings) {
      const d = Number(settings.presence_debounce_seconds);
      const g = Number(settings.disconnect_grace_seconds);
      if (Number.isFinite(d) && d > 0) debounceSec = d;
      if (Number.isFinite(g) && g > 0) graceSec = g;
    }
  } catch (e) {
    console.warn("[sweep] settings read failed; using defaults", e);
  }

  const summary = {
    stamped: 0,
    past_grace_forfeited: 0,
    matches_scanned: 0,
    debounce_sec: debounceSec,
    grace_sec: graceSec,
  };

  // 2. STAMP: convert silent last_seen_at into disconnected_at.
  //    disconnected_at = last_seen_at (stable start; NOT now()).
  try {
    const { data: stamped, error: stampErr } = await svc.rpc("sweep_stamp_disconnects", {
      _debounce_seconds: debounceSec,
    });
    if (stampErr) {
      // RPC may not exist in dev; fall back to inline SQL via .from(...).update with a filter.
      // Use a single UPDATE bounded by ages computed in JS to avoid a custom RPC dependency.
      const cutoff = new Date(Date.now() - debounceSec * 1000).toISOString();
      const { data: rows, error: selErr } = await svc
        .from("game_match_players")
        .select("match_id, user_id, last_seen_at")
        .is("disconnected_at", null)
        .eq("status", "active")
        .lt("last_seen_at", cutoff);
      if (selErr) throw selErr;
      for (const r of rows ?? []) {
        await svc
          .from("game_match_players")
          .update({ disconnected_at: r.last_seen_at })
          .eq("match_id", r.match_id)
          .eq("user_id", r.user_id)
          .is("disconnected_at", null);
        summary.stamped += 1;
      }
    } else {
      summary.stamped = Number(stamped ?? 0);
    }
  } catch (e) {
    console.error("[sweep] stamp step failed", e);
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
    .select("id, is_ranked, status, player_count, state, seq, host_user_id")
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
    // 2-PLAYER INSTANT-END: as soon as `disconnected_at` is stamped
    // (post-debounce, ~15s after the drop), end the match regardless
    // of whose turn it is — the survivor wins, no grace wait. Routed
    // through the engine via forceFinaliseDisconnect2p so the same
    // advanceTurn ≤1-active finalise path runs that the past-grace
    // sweep uses for 3+ player matches. No new 2-player finalise
    // codepath is introduced.
    // ---------------------------------------------------------------
    if (playerCount <= 2 && anyDisconnected.length > 0) {
      // Pick any roster row as the actor for commit_move (service-role
      // bypasses the auth.uid check; commit_move only requires the
      // actor be a player in the match). Use the disconnected seat to
      // mirror the past-grace pattern semantically.
      const actorRow = anyDisconnected[0];
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

        const userIdForSlot = (slot: number): string | null =>
          roster.find((r) => r.slot === slot)?.user_id ?? null;

        let winnerUserId: string | null = null;
        if (nextState.winnerId) {
          const wSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
          if (wSlot >= 0) winnerUserId = userIdForSlot(wSlot);
        }

        const serialisedNext = serialise(nextState);
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

        if (match.is_ranked) {
          const { error: finErr } = await svc.rpc("finalise_ranked_match", {
            _match_id: match.id,
            _reason: "two_player_disconnect",
            _placements: placementsSnapshot.length > 0 ? (placementsSnapshot as any) : null,
          });
          if (finErr) console.error(`[sweep] 2p finalise_ranked_match failed match=${match.id}`, finErr);
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
      const userIdForSlot = (slot: number): string | null =>
        roster.find((r) => r.slot === slot)?.user_id ?? null;

      let winnerUserId: string | null = null;
      if (finished && nextState.winnerId) {
        const wSlot = nextState.players.findIndex((p) => p.id === nextState.winnerId);
        if (wSlot >= 0) winnerUserId = userIdForSlot(wSlot);
      }

      const serialisedNext = serialise(nextState);
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

      if (finished && match.is_ranked) {
        const { error: finErr } = await svc.rpc("finalise_ranked_match", {
          _match_id: match.id,
          _reason: "past_grace_disconnect",
          _placements: placementsSnapshot.length > 0 ? (placementsSnapshot as any) : null,
        });
        if (finErr) console.error(`[sweep] finalise_ranked_match failed match=${match.id}`, finErr);
      }

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
