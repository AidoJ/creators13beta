/**
 * dev-create-multiplayer-match — A.3 bootstrap affordance.
 *
 * Admin-gated dev tool for testing N-player multiplayer end-to-end before
 * Batch B ships the production lobby. The CLIENT builds the deck + initial
 * state (using the same buildDeck/createMatch path as handleCreatePvp), so
 * this function has zero deck logic. It validates admin, inserts the match
 * row with the supplied serialised N-player state, seeds the host roster,
 * and returns N-1 join links.
 *
 * Removable in one commit when Batch B's lobby UI lands.
 */

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // Admin-only.
  const { data: isAdmin } = await svc.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) return jsonResponse({ error: "admin only" }, 403);

  let body: {
    player_count?: number;
    host_name?: string;
    origin?: string;
    state?: any;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const playerCount = Math.max(2, Math.min(4, Number(body.player_count ?? 3)));
  const hostName = (body.host_name && String(body.host_name).slice(0, 40)) || "Host";
  const origin = body.origin && /^https?:\/\//.test(body.origin) ? body.origin : null;
  const state = body.state;

  // Validate the client-supplied state matches the requested player_count.
  // Defence against a 2-player state being inserted into a 3/4-player row
  // (which would explode on first move).
  if (!state || !Array.isArray(state.players)) {
    return jsonResponse({ error: "missing or invalid state.players" }, 400);
  }
  if (state.players.length !== playerCount) {
    return jsonResponse({
      error: "state/player_count mismatch",
      detail: `state.players.length=${state.players.length} player_count=${playerCount}`,
    }, 400);
  }
  if (!Array.isArray(state.turnOrder) || state.turnOrder.length !== playerCount) {
    return jsonResponse({
      error: "state.turnOrder missing or wrong length",
      detail: `expected ${playerCount}, got ${Array.isArray(state.turnOrder) ? state.turnOrder.length : "none"}`,
    }, 400);
  }

  const inviteToken = makeToken();
  const { data: matchRow, error: insErr } = await svc
    .from("game_matches")
    .insert({
      mode: "pvp",
      status: "waiting",
      host_user_id: userId,
      host_name: hostName,
      invite_token: inviteToken,
      is_ranked: true,
      player_count: playerCount,
      state,
      last_action_by: userId,
    })
    .select("id, invite_token, player_count")
    .single();
  if (insErr) return jsonResponse({ error: "match insert failed", detail: insErr.message }, 500);

  const { error: rosterErr } = await svc.from("game_match_players").insert({
    match_id: matchRow.id,
    user_id: userId,
    slot: 0,
    display_name: hostName,
  });
  if (rosterErr) {
    return jsonResponse({ error: "roster insert failed", detail: rosterErr.message }, 500);
  }

  const baseOrigin = origin ?? "https://creators13beta.lovable.app";
  const joinUrl = `${baseOrigin}/play/join/${inviteToken}`;
  const slotsToFill = playerCount - 1;
  const joinLinks = Array.from({ length: slotsToFill }, (_, i) => ({
    label: `Slot ${i + 1}`,
    url: joinUrl,
  }));

  return jsonResponse({
    ok: true,
    match_id: matchRow.id,
    player_count: playerCount,
    invite_token: inviteToken,
    join_url: joinUrl,
    join_links: joinLinks,
    note: "All slots share one invite token — open each link in a different incognito window / account.",
  });
});
