import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({
          error: "no_stripe_customer",
          message: "We couldn't find a billing record for this account. If you believe this is wrong, contact support.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
      );
    }
    const customerId = customers.data[0].id;

    const origin = req.headers.get("origin") || "https://creators13beta.lovable.app";
    console.log("customer-portal v2");
    const body = await req.json().catch(() => ({}));
    const json = (obj: unknown, status = 200) =>
      new Response(JSON.stringify(obj), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

    // Stripe allows max 4 expansion levels on list calls, so product names are fetched separately.
    const productNames = new Map<string, string | null>();
    const activeSubs = async () => {
      const subs = (await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 10 })).data;
      for (const s of subs) {
        const pid = s.items?.data?.[0]?.price?.product;
        if (typeof pid === "string" && !productNames.has(pid)) {
          try {
            const p = await stripe.products.retrieve(pid);
            productNames.set(pid, (p as any).deleted ? null : p.name);
          } catch { productNames.set(pid, null); }
        }
      }
      return subs;
    };
    const periodEnd = (s: Stripe.Subscription) =>
      (s as any).current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
    const productName = (s: Stripe.Subscription) => {
      const prod = s.items?.data?.[0]?.price?.product as Stripe.Product | string | undefined;
      if (typeof prod === "string") return productNames.get(prod) ?? null;
      return prod && !("deleted" in prod && prod.deleted) ? prod.name : null;
    };

    // Member-safe status: no Stripe ids leave this function.
    if (body?.flow === "status") {
      const subs = await activeSubs();
      return json({
        subscriptions: subs.map((s) => ({
          product_name: productName(s),
          cancel_at_period_end: !!s.cancel_at_period_end,
          access_until: periodEnd(s) ? new Date(periodEnd(s) * 1000).toISOString() : null,
        })),
      });
    }

    if (body?.flow === "resume") {
      const subs = (await activeSubs()).filter((s) => s.cancel_at_period_end);
      if (subs.length === 0) return json({ error: "nothing_to_resume", message: "Your membership is already active." }, 409);
      for (const s of subs) await stripe.subscriptions.update(s.id, { cancel_at_period_end: false });
      return json({ resumed: subs.length });
    }

    const returnUrl = `${origin}/dashboard?portal=returned`;
    const params: Stripe.BillingPortal.SessionCreateParams = { customer: customerId, return_url: returnUrl };
    // Cancel flow: Stripe redirects straight back to the dashboard once the
    // member confirms, instead of leaving them on Stripe's confirmation page.
    if (body?.flow === "cancel") {
      const subs = await activeSubs();
      const target = subs.find((s) => !s.cancel_at_period_end);
      if (!target) {
        return json({
          error: "already_cancelled",
          message: subs.length ? "Your membership is already cancelled and stays active until the end of the paid period." : "There's no active membership to cancel.",
        }, 409);
      }
      params.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: { subscription: target.id },
        after_completion: { type: "redirect", redirect: { return_url: `${origin}/dashboard?portal=cancelled` } },
      };
    }
    const portalSession = await stripe.billingPortal.sessions.create(params);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    // Log the detail for staff; never show raw billing errors or ids to members.
    console.error("customer-portal error", error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ error: "portal_unavailable", message: "We couldn't open your billing page just now. Please try again, or contact us if it keeps happening." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
