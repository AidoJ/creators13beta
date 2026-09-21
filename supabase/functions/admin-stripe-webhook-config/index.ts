// Admin-only utility: inspect (and optionally update) the Stripe webhook
// endpoint's subscribed event list. Read-only unless { events: [...] } is sent.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { requireRole, authErrorResponse, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireRole(req, ["admin", "trainer"]);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const list = await stripe.webhookEndpoints.list({ limit: 20 });
    let updated: any = null;

    if (Array.isArray(body?.events) && body.events.length && body?.endpoint_id) {
      updated = await stripe.webhookEndpoints.update(body.endpoint_id, {
        enabled_events: body.events,
      });
    }

    return new Response(JSON.stringify({
      livemode: list.data[0]?.livemode ?? null,
      endpoints: list.data.map(e => ({
        id: e.id, url: e.url, status: e.status, enabled_events: e.enabled_events, api_version: e.api_version,
      })),
      updated: updated ? { id: updated.id, enabled_events: updated.enabled_events } : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r.status !== 0) return r;
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
