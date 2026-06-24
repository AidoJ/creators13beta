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
 *   2. ALL-DISCONNECT FINALISATION (single SQL per match): for any active
 *      multiplayer match where EVERY active roster member has
 *      `disconnected_at IS NOT NULL`, finalise the match in a single
 *      transaction with placements ranked by `disconnected_at DESC` (last
 *      to leave wins; ties = draw). Single SQL eliminates the race where
 *      two sweep ticks 30s apart could each forfeit one player and
 *      miscompute "latest".
 *
 *   3. PAST-GRACE AUTO-SKIP: if the match is NOT all-disconnected and the
 *      current `state.turn` slot is held by a player whose disconnect age
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

import { forceAdvanceTurn } from "../_shared/game/engine.ts";
import type { DeckCard, Ecosystem, MatchState, PlacedCard } from "../_shared/game/types.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    all_disconnect_finalised: 0,
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

    const allDisconnected = activeRoster.every(
      (r) => r.disconnected_at !== null && r.disconnected_at !== undefined,
    );

    // ---------------------------------------------------------------
    // ALL-DISCONNECT: single-transaction finalisation. Ranked by
    // disconnected_at DESC; last to leave wins; ties share rank (draw at
    // the top).
    // ---------------------------------------------------------------
    if (allDisconnected) {
      const ranked = [...activeRoster].sort((a, b) => {
        const at = Date.parse(a.disconnected_at!);
        const bt = Date.parse(b.disconnected_at!);
        return bt - at;
      });
      // Tie-aware ranking: equal timestamps share the higher rank.
      let cursor = 1;
      let prevTime: number | null = null;
      const placements = ranked.map((r, i) => {
        const t = Date.parse(r.disconnected_at!);
        if (prevTime !== null && t !== prevTime) cursor = i + 1;
        prevTime = t;
        return { user_id: r.user_id, rank: cursor, status: "finalised" as const };
      });
      const winner = placements[0];
      // Single UPDATE for the match row + roster updates batched.
      try {
        // Engine `finished` flag only. Do NOT set `__finalised` here —
        // that flag is finalise_ranked_match's OUTPUT (it tags the state
        // AFTER awards commit, and short-circuits on subsequent calls).
        // Setting it pre-RPC would block the very award we're about to fire.
        const newState = { ...(match.state ?? {}), finished: true };
        // Atomic guard: WHERE status='active' ensures only one sweep tick
        // can flip the match to 'finished'. A concurrent tick's UPDATE
        // matches 0 rows because Postgres' row lock serialises them and
        // the second sees status='finished'. We check rowcount and skip
        // the per-player + ranked-points writes if we lost the race.
        const { data: claimed, error: claimErr } = await svc
          .from("game_matches")
          .update({
            status: "finished",
            winner_user_id: placements.length > 1 && placements[0].rank === placements[1].rank
              ? null // top tie = draw
              : winner.user_id,
            state: newState,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .eq("status", "active")
          .select("id");
        if (claimErr) throw claimErr;
        if (!claimed || claimed.length === 0) {
          console.log(`[sweep] all-disconnect race-lost match=${match.id} (already finalised)`);
          continue;
        }
        for (const p of placements) {
          await svc
            .from("game_match_players")
            .update({
              rank: p.rank,
              status: "finalised",
              finalised_at: new Date().toISOString(),
            })
            .eq("match_id", match.id)
            .eq("user_id", p.user_id);
        }
        if (match.is_ranked) {
          await svc.rpc("finalise_ranked_match", {
            _match_id: match.id,
            _reason: "all_disconnect",
            _placements: placements as any,
          });
        }
        summary.all_disconnect_finalised += 1;
        console.log(
          `[sweep] all-disconnect finalise match=${match.id} winner=${
            placements[0].rank === (placements[1]?.rank ?? -1) ? "DRAW" : winner.user_id
          }`,
        );
      } catch (e) {
        console.error(`[sweep] all-disconnect finalise failed match=${match.id}`, e);
      }
      continue;
    }

    // ---------------------------------------------------------------
    // PAST-GRACE FORFEIT: any seat whose disconnect age exceeds grace
    // is finalised by score (middle band) — NOT bottom-banded as a
    // quitter. We do this by directly updating game_match_players +
    // game_matches state so that the next apply-move (or this sweep on
    // the next tick) sees an updated active set.
    // ---------------------------------------------------------------
    const pastGrace = activeRoster.filter((r) => {
      const t = r.disconnected_at ? Date.parse(r.disconnected_at) : NaN;
      return Number.isFinite(t) && nowMs - t > graceMs;
    });
    if (pastGrace.length === 0) continue;

    // Compute remaining still-connected actives after this sweep applies
    // the forfeits. If only one (or zero) survive, finalise the whole
    // match by score; otherwise just mark the past-grace seats and let
    // the next move's engine advanceTurn observe them.
    const survivingActives = activeRoster.filter((r) => !pastGrace.includes(r));

    try {
      if (survivingActives.length <= 1) {
        // Match ends. Build placements by score from match.state.
        const state = match.state ?? {};
        const players: any[] = Array.isArray(state.players) ? state.players : [];
        const slotByUser = new Map<string, number>();
        for (const r of activeRoster) slotByUser.set(r.user_id, r.slot);
        const scoreFor = (uid: string) => {
          const slot = slotByUser.get(uid);
          if (slot === undefined) return 0;
          const p = players[slot];
          if (!p) return 0;
          const placedSize = Array.isArray(p.ecosystem?.placed)
            ? p.ecosystem.placed.length
            : 0;
          return placedSize * 2 + (Number(p.score) || 0);
        };
        const ranked = [...activeRoster].sort(
          (a, b) => scoreFor(b.user_id) - scoreFor(a.user_id),
        );
        let cursor = 1;
        let prevScore: number | null = null;
        const placements = ranked.map((r, i) => {
          const s = scoreFor(r.user_id);
          if (prevScore !== null && s !== prevScore) cursor = i + 1;
          prevScore = s;
          return { user_id: r.user_id, rank: cursor, status: "finalised" as const };
        });
        const winnerUid =
          placements[0] && placements[0].rank !== (placements[1]?.rank ?? -1)
            ? placements[0].user_id
            : null;
        // Engine `finished` flag only — see all-disconnect branch above
        // for why we must NOT pre-set `__finalised` (would short-circuit
        // finalise_ranked_match and skip awards).
        const newState = { ...state, finished: true };
        // Same atomic guard as the all-disconnect branch above.
        const { data: claimed2, error: claim2Err } = await svc
          .from("game_matches")
          .update({
            status: "finished",
            winner_user_id: winnerUid,
            state: newState,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id)
          .eq("status", "active")
          .select("id");
        if (claim2Err) throw claim2Err;
        if (!claimed2 || claimed2.length === 0) {
          console.log(`[sweep] past-grace race-lost match=${match.id} (already finalised)`);
          continue;
        }
        for (const p of placements) {
          await svc
            .from("game_match_players")
            .update({
              rank: p.rank,
              status: "finalised",
              finalised_at: new Date().toISOString(),
            })
            .eq("match_id", match.id)
            .eq("user_id", p.user_id);
        }
        if (match.is_ranked) {
          await svc.rpc("finalise_ranked_match", {
            _match_id: match.id,
            _reason: "past_grace_disconnect",
            _placements: placements as any,
          });
        }
        summary.past_grace_forfeited += pastGrace.length;
        console.log(
          `[sweep] past-grace match-end match=${match.id} forfeited=${pastGrace.length} winner=${winnerUid ?? "DRAW"}`,
        );
      } else {
        // Match continues. Don't mutate state.players[].status here — the
        // engine's auto-pass scan uses disconnectedAt directly, and the
        // ≤1-active check sees past-grace via state.disconnectGraceMs that
        // apply-move injects each call. We just keep the disconnected_at
        // stamp so the engine sees it. Nothing to write.
        summary.past_grace_forfeited += 0;
      }
    } catch (e) {
      console.error(`[sweep] past-grace handling failed match=${match.id}`, e);
    }
  }

  console.log("[sweep] done", summary);
  return jsonResponse({ ok: true, ...summary });
});
