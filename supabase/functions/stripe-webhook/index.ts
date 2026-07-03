import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};




serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    logStep("ERROR", { message: "STRIPE_SECRET_KEY not set" });
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    // FAIL CLOSED: signature verification is mandatory.
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      logStep("CRITICAL: STRIPE_WEBHOOK_SECRET not configured — rejecting all events");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    if (!sig) {
      logStep("ERROR: missing stripe-signature header");
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
      logStep("Webhook signature verified");
    } catch (e) {
      logStep("ERROR: signature verification failed", { message: String(e) });
      return new Response("Invalid signature", { status: 400 });
    }


    logStep("Event received", { type: event.type, id: event.id });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;

      if (!userId) {
        logStep("ERROR: No user_id in session metadata", { sessionId: session.id });
        return new Response("Missing user_id in metadata", { status: 400 });
      }

      logStep("Processing checkout completion", {
        userId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      });

      // Update subscription record
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq("user_id", userId);

      if (subError) {
        logStep("ERROR updating subscription", { error: subError.message });
        return new Response("Database error", { status: 500 });
      }

      // Update profile enrollment_step to payment_complete
      await supabase
        .from("profiles")
        .update({ enrollment_step: "payment_complete" })
        .eq("user_id", userId);

      logStep("Subscription activated and profile updated", { userId });
      await triggerDiscordRoleSync(userId);
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Find user by stripe_customer_id
      const { data: subRecord } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      if (subRecord) {
        await supabase
          .from("subscriptions")
          .update({
            status: subscription.status as any,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("user_id", subRecord.user_id);

        logStep("Subscription updated", { userId: subRecord.user_id, status: subscription.status });
        await triggerDiscordRoleSync(subRecord.user_id);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: subRecord } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      if (subRecord) {
        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("user_id", subRecord.user_id);

        logStep("Subscription canceled", { userId: subRecord.user_id });
        await triggerDiscordRoleSync(subRecord.user_id);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
