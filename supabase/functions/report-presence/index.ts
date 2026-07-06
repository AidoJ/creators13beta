/**
 * report-presence — A.4 client-driven presence pings.
 *
 * Called by `useMatchPresence` whenever the client's realtime presence
 * channel emits a join, leave, or heartbeat for a multiplayer match. The
 * function:
 *
 *   - On `join` / `heartbeat`: clears `disconnected_at` + `disconnect_reason`
 *     and bumps `last_seen_at = now()`. A returning player resumes cleanly
 *     within the grace window with this single write.
 *
 *   - On `leave`: bumps `last_seen_at` only (does NOT stamp
 *     `disconnected_at`). The actual grace-clock start is delegated to the
 *     `forfeit-stale-disconnects` sweep, which stamps `disconnected_at` only
 *     when `now() - last_seen_at > presence_debounce_seconds`. This collapses
 *     the "debounce 15s before considering them gone" rule into a single
 *     source of truth (the sweep) and avoids relying on edge-function
 *     instance lifetime, which Supabase doesn't guarantee between
 *     invocations.
 *
 * Auth: JWT verified in-code; caller must be a roster member of the match.
 * Note: this is one of A.4's two new edge functions. The marker line on L2
 * is auto-stamped by `scripts/sync-game-engine.sh` whenever the shared
 * engine changes so the auto-deploy fires. (We don't import the engine
 * directly here, but the sweep does, and the stamp is harmless.)
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Event = "join" | "leave" | "heartbeat";

interface Body {
  match_id: string;
  event: Event;
  reason?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body?.match_id || !body?.event) {
    return jsonResponse({ error: "missing fields" }, 400);
  }
  if (body.event !== "join" && body.event !== "leave" && body.event !== "heartbeat") {
    return jsonResponse({ error: "invalid event" }, 400);
  }
  if (typeof body.reason === "string" && body.reason.length > 200) {
    return jsonResponse({ error: "reason too long" }, 400);
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // Verify caller is a roster member of the match.
  const { data: rosterRow, error: rosterErr } = await svc
    .from("game_match_players")
    .select("user_id")
    .eq("match_id", body.match_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (rosterErr || !rosterRow) {
    return jsonResponse({ error: "not a player in this match" }, 403);
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> =
    body.event === "leave"
      ? {
          // Bump last_seen_at to mark the moment we noticed the leave. The
          // sweep decides whether enough time has passed to stamp
          // disconnected_at. We do NOT stamp it here — that's the entire
          // point of the server-side debounce.
          last_seen_at: nowIso,
          disconnect_reason: body.reason ?? "presence_leave",
        }
      : {
          // Join or heartbeat: clear any stale disconnect markers, including
          // the stamp used by the active-turn-skip grace.
          last_seen_at: nowIso,
          disconnected_at: null,
          disconnect_stamped_at: null,
          disconnect_reason: null,
        };

  const { error: updErr } = await svc
    .from("game_match_players")
    .update(update)
    .eq("match_id", body.match_id)
    .eq("user_id", userId);
  if (updErr) {
    console.error("[report-presence] update failed", updErr);
    return jsonResponse({ error: "update failed" }, 500);
  }

  return jsonResponse({ ok: true, event: body.event, at: nowIso });
});
