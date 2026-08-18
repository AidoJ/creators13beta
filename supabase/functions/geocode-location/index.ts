import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const NOMINATIM_UA = "13CREATORS-Community/1.0 (admin@13creators.com)";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface NominatimResult {
  lat?: string;
  lon?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { user_id?: string; location_label?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const userId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
  const label = typeof payload.location_label === "string" ? payload.location_label.trim() : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "invalid_user_id" }, 400);
  }
  if (label.length === 0 || label.length > 200) {
    return json({ error: "invalid_location_label" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Authorise: either matching user JWT, OR the supplied label matches the
  // profile's current location_label (which is only true immediately after a
  // real DB write — i.e. the trigger fired this call).
  const authHeader = req.headers.get("Authorization") ?? "";
  let authorised = false;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Service-role caller (e.g. another edge function) → trust.
    if (token === SERVICE_KEY) {
      authorised = true;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user?.id === userId) authorised = true;
      else if (userData?.user) return json({ error: "forbidden" }, 403);
    }
  }

  if (!authorised) {
    // Fall back to "trigger-authenticated" mode. The DB trigger that's the
    // real caller here (trigger_geocode_on_location_change) sends no
    // Authorization header at all, so this fallback isn't a rarely-used
    // edge case — it's the only mechanism the trigger actually has. Matching
    // the label alone was guessable (often just a city name) with no time
    // bound, so a caller who once observed a user's label could replay it
    // at any later point. Now also require the profile to have been written
    // within the last few seconds — i.e. this request is arriving right
    // after the real DB write that fired the trigger, not a replay.
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("location_label, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr || !profile) return json({ error: "unauthorized" }, 401);
    if ((profile.location_label ?? "").trim() !== label) {
      return json({ error: "unauthorized" }, 401);
    }
    const updatedAtMs = profile.updated_at ? Date.parse(profile.updated_at) : NaN;
    const TRIGGER_WINDOW_MS = 15_000;
    if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > TRIGGER_WINDOW_MS) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  // Distributed throttle: Nominatim's usage policy is <=1 req/sec. The DB
  // trigger that's the real caller here fires once per profile write with
  // no coalescing, so a bulk write (e.g. an admin import) can burst past
  // that limit and get the shared User-Agent rate-limited/banned,
  // degrading geocoding for every user. Claims a serialised slot via a DB
  // row lock (correct across concurrent edge function instances, unlike an
  // in-memory limiter) and waits for it; if the queue is backed up too far,
  // backs off instead of holding this invocation open indefinitely.
  const MAX_WAIT_MS = 10_000;
  try {
    const { data: waitMs, error: slotErr } = await admin.rpc("claim_nominatim_slot", { _min_interval_ms: 1100 });
    if (slotErr) {
      console.warn("[geocode] slot claim failed; proceeding without throttle", slotErr);
    } else if (typeof waitMs === "number" && waitMs > 0) {
      if (waitMs > MAX_WAIT_MS) {
        console.warn(`[geocode] Nominatim queue backed up (${waitMs}ms) — deferring for user ${userId}`);
        await markFailed(admin, userId, label);
        return json({ ok: true, geocoded: false, error: "provider_busy" });
      }
      console.log(`[geocode] throttle wait ${waitMs}ms for user ${userId}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  } catch (e) {
    console.warn("[geocode] slot claim threw; proceeding without throttle", e);
  }

  // Geocode via Nominatim
  let result: NominatimResult | null = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(label)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[geocode] provider returned ${res.status} for "${label}"`);
      await markFailed(admin, userId, label);
      return json({ ok: true, geocoded: false, error: "provider_unavailable" });
    }
    const arr = (await res.json()) as NominatimResult[];
    result = arr?.[0] ?? null;
  } catch (e) {
    console.warn(`[geocode] provider fetch failed:`, e);
    await markFailed(admin, userId, label);
    return json({ ok: true, geocoded: false, error: "provider_unavailable" });
  }

  if (!result || !result.lat || !result.lon) {
    await markFailed(admin, userId, label);
    return json({ ok: true, geocoded: false });
  }

  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    await markFailed(admin, userId, label);
    return json({ ok: true, geocoded: false });
  }

  // Merge prefs preserving existing keys
  const { data: existing } = await admin
    .from("profiles")
    .select("member_preferences")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = (existing?.member_preferences as Record<string, unknown>) ?? {};
  const nextPrefs = {
    ...prefs,
    geocoded_at: new Date().toISOString(),
    geocoding_label: label,
  };
  delete (nextPrefs as Record<string, unknown>).geocoding_failed_at;

  const { error: uErr } = await admin
    .from("profiles")
    .update({
      location_lat: lat,
      location_lng: lng,
      member_preferences: nextPrefs,
    })
    .eq("user_id", userId);

  if (uErr) {
    console.error(`[geocode] update failed for ${userId}:`, uErr);
    return json({ ok: true, geocoded: false, error: "write_failed" });
  }

  return json({ ok: true, geocoded: true, lat, lng });
});

async function markFailed(admin: ReturnType<typeof createClient>, userId: string, label: string) {
  const { data: existing } = await admin
    .from("profiles")
    .select("member_preferences")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = ((existing?.member_preferences as Record<string, unknown>) ?? {});
  const nextPrefs = {
    ...prefs,
    geocoding_failed_at: new Date().toISOString(),
    geocoding_label: label,
  };
  await admin.from("profiles").update({ member_preferences: nextPrefs }).eq("user_id", userId);
}
