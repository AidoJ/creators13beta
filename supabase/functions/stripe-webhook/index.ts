import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { grantEntitlement, expireEntitlementsByRef, TIER_LEVEL_MAP } from "../_shared/entitlements.ts";

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

    // IDEMPOTENCY LEDGER — claim the event id before doing any work. Stripe can
    // deliver the same event more than once; a replay must never double-grant.
    const { error: ledgerError } = await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });
    if (ledgerError) {
      if ((ledgerError as any).code === "23505") {
        logStep("Duplicate event ignored", { id: event.id });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }
      logStep("ERROR writing event ledger", { error: ledgerError.message });
      return new Response("Database error", { status: 500 });
    }

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

      // --- Entitlement granting -------------------------------------------
      const productId = session.metadata?.product_id || null;
      const levelKey = session.metadata?.level_key || null;
      const billingShape = session.metadata?.billing_shape || null;
      const termMonths = Number(session.metadata?.term_months || 0);
      const reservationId = session.metadata?.reservation_id || null;
      const subscriptionId = (session.subscription as string) || null;

      if (productId && levelKey) {
        // Seat cap re-check: the reservation we hold is counted in seats_taken,
        // so a full course is only "over" if others beat us to it.
        const { data: product } = await supabase
          .from("products").select("seat_cap").eq("id", productId).maybeSingle();
        let seatOk = true;
        if (product?.seat_cap) {
          const { data: taken } = await supabase.rpc("seats_taken", { _level_key: levelKey });
          // our own reservation is included in the count, hence > seat_cap
          seatOk = (taken ?? 0) <= product.seat_cap;
        }
        if (!seatOk) {
          logStep("WARNING: seat cap exceeded at payment time — granting anyway, flag for admin", { userId, levelKey });
        }

        // Fixed term = termMonths total payments: the checkout payment is
        // instalment one, the schedule supplies the remaining (termMonths - 1).
        // Access therefore ends termMonths calendar months after signup.
        let endsAt: string | null = null;
        if (billingShape === "fixed_term" && termMonths > 0) {
          const end = new Date();
          end.setMonth(end.getMonth() + termMonths);
          endsAt = end.toISOString();
        }

        const result = await grantEntitlement(supabase, {
          userId, levelKey, source: "stripe", stripeRef: subscriptionId || session.id, endsAt,
        });
        logStep("Entitlement", { userId, levelKey, result });

        // Fixed-term course: convert the subscription into a schedule that
        // supplies the remaining instalments and cancels at the end.
        // termMonths counts TOTAL payments; the checkout payment is #1.
        const remainingInstalments = termMonths - 1;
        if (billingShape === "fixed_term" && remainingInstalments > 0 && subscriptionId) {
          try {
            const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
            const phase = schedule.phases[0];
            await stripe.subscriptionSchedules.update(schedule.id, {
              end_behavior: "cancel",
              phases: [{
                items: phase.items.map((i: any) => ({ price: i.price as string, quantity: i.quantity ?? 1 })),
                start_date: phase.start_date,
                iterations: remainingInstalments,
                metadata: { user_id: userId, level_key: levelKey, product_id: productId },
              }],
              metadata: { user_id: userId, level_key: levelKey, product_id: productId },
            });
            logStep("Fixed-term schedule attached", { scheduleId: schedule.id, iterations: remainingInstalments });
          } catch (e) {
            logStep("ERROR attaching fixed-term schedule", { message: String(e) });
          }
        }
      } else {
        // Legacy tier path — grant the matching level alongside the existing role.
        const { data: subRow } = await supabase
          .from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
        const tierLevel = subRow?.tier ? TIER_LEVEL_MAP[subRow.tier] : null;
        if (tierLevel) {
          const result = await grantEntitlement(supabase, {
            userId, levelKey: tierLevel, source: "stripe", stripeRef: subscriptionId,
          });
          logStep("Tier entitlement", { userId, tierLevel, result });
        }
      }

      if (reservationId) await supabase.from("seat_reservations").delete().eq("id", reservationId);
    }

    // Each successful instalment / renewal. Access is already granted; this is
    // where a past_due account comes good again.
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: subRecord } = await supabase
        .from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (subRecord) {
        await supabase.from("subscriptions").update({ status: "active" }).eq("user_id", subRecord.user_id);
        logStep("Invoice paid — subscription marked active", { userId: subRecord.user_id });
      }
    }

    // Mid-term failure: access is KEPT while Stripe retries. Stripe sets the
    // subscription past_due, which the app shows as a payment-problem notice.
    // Access only ends when Stripe gives up and cancels (subscription.deleted).
    if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const { data: subRecord } = await supabase
        .from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (subRecord) {
        await supabase.from("subscriptions").update({ status: "past_due" }).eq("user_id", subRecord.user_id);
        logStep("Payment problem — access retained during Stripe retries", { userId: subRecord.user_id });
      }
    }

    // A fixed-term course reached the end of its final instalment, or the
    // schedule was stopped early. Either way the entitlement ends.
    if (event.type === "subscription_schedule.completed" ||
        event.type === "subscription_schedule.canceled" ||
        event.type === "subscription_schedule.aborted") {
      const schedule = event.data.object as Stripe.SubscriptionSchedule;
      const subId = typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id;
      if (subId) {
        await expireEntitlementsByRef(supabase, subId);
        logStep("Schedule ended — entitlements expired", { scheduleId: schedule.id, subId });
      }
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

        // Stripe has given up retrying (or the customer cancelled): end access.
        await expireEntitlementsByRef(supabase, subscription.id);
        logStep("Subscription canceled — entitlements expired", { userId: subRecord.user_id });
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
