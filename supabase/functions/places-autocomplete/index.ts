// Location suggestions for the profile / settings / project location fields.
// Signed-in members only. Calls Google Places (New) autocomplete via the gateway.
import { requireUser, authErrorResponse, rateLimit, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const u = await requireUser(req);
    if (!rateLimit(`places:${u.id}`, 120, 60_000)) return json({ error: "rate_limited" }, 429);

    const body = await req.json().catch(() => ({}));
    const input = typeof body?.input === "string" ? body.input.trim() : "";
    const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken.slice(0, 64) : undefined;
    if (input.length < 2 || input.length > 120) return json({ suggestions: [] });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return json({ error: "maps_not_configured" }, 500);

    const r = await fetch("https://connector-gateway.lovable.dev/google_maps/places/v1/places:autocomplete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({ input, sessionToken }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`places autocomplete [${r.status}]: ${t}`);
      return json({ error: "provider_failed", status: r.status, details: t }, 502);
    }
    const data = await r.json();
    const suggestions = (data?.suggestions ?? [])
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({ placeId: p.placeId, text: p.text?.text ?? "" }))
      .filter((s: any) => s.text);
    return json({ suggestions });
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e, corsHeaders);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
