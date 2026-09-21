// Admin/trainer action: move everyone currently subscribed to a product onto its
// current price. Inline price_data is used, so there are no stored Stripe Price
// objects to swap — each subscription item is rewritten with the new amount.
// Proration: none. The new amount takes effect at the subscriber's next renewal.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { requireRole, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { admin } = await requireRole(req, ["admin", "trainer"]);
    const { product_id, dry_run } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product, error: prodErr } = await admin
      .from("products").select("*").eq("id", product_id).maybeSingle();
    if (prodErr || !product) throw new Error("Product not found");
    if (product.billing_shape === "one_off") throw new Error("One-off products have no subscribers to move");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const moved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    // Subscriptions created by this app carry product_id in their metadata.
    const search = await stripe.subscriptions.search({
      query: `status:'active' AND metadata['product_id']:'${product_id}'`,
      limit: 100,
    });

    for (const sub of search.data) {
      const item = sub.items.data[0];
      if (!item) { skipped.push({ id: sub.id, reason: "no items" }); continue; }
      const current = item.price.unit_amount ?? null;
      if (current === product.price_cents && (item.price.currency ?? "") === (product.currency ?? "aud")) {
        skipped.push({ id: sub.id, reason: "already on current price" });
        continue;
      }
      if (dry_run) { moved.push(sub.id); continue; }
      await stripe.subscriptions.update(sub.id, {
        items: [{
          id: item.id,
          price_data: {
            currency: product.currency ?? "aud",
            unit_amount: product.price_cents,
            product_data: { name: product.name },
            recurring: { interval: "month" },
          },
        }],
        proration_behavior: "none",
      });
      moved.push(sub.id);
    }

    return new Response(JSON.stringify({ dry_run: !!dry_run, moved_count: moved.length, moved, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r.status !== 0) return r;
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
