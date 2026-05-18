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
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Try to get user from JWT first, fall back to body params
    let userEmail: string | undefined;
    let userId: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user?.email) {
        userEmail = data.user.email;
        userId = data.user.id;
        logStep("User from JWT", { userId, email: userEmail });
      }
    }

    const body = await req.json();
    const { priceId, successUrl, cancelUrl, email, user_id, tier, billing, embedded } = body;

    // Fall back to body params if JWT auth didn't work (unconfirmed user)
    if (!userEmail && email) {
      userEmail = email;
      userId = user_id;
      logStep("User from body params", { userId, email: userEmail });
    }

    if (!userEmail) throw new Error("No user email available");
    if (!userId) throw new Error("No user ID available");

    const tierValue = tier || "wren";
    const role = tierValue === "owl" ? "trainee" : "client";
    const practitionerCode = body.practitioner_code || null;
    const inviteToken = body.invite_token || null;

    if (inviteToken) {
      const { data: invitation, error: invitationError } = await supabaseClient
        .from("client_invitations")
        .select("email, practitioner_id")
        .eq("invite_token", inviteToken)
        .maybeSingle();
      if (invitationError) throw new Error(`Could not verify invitation: ${invitationError.message}`);
      if (!invitation) throw new Error("Invitation link was not found");
      if ((invitation.email || "").trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
        throw new Error(`This invitation is for ${invitation.email}. Please sign in with that email address, or sign out and create Goldie's account.`);
      }
    }

    // Always create role + subscription records
    const { error: roleError } = await supabaseClient.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" }
    );
    if (roleError) throw new Error(`Could not create user role: ${roleError.message}`);

    const subData: Record<string, any> = {
      user_id: userId,
      tier: tierValue,
      status: tierValue === "wren" ? "active" : "incomplete",
      billing_period: billing || "monthly",
    };
    if (practitionerCode) subData.referral_code = practitionerCode;

    const { error: subscriptionError } = await supabaseClient.from("subscriptions").upsert(
      subData,
      { onConflict: "user_id" }
    );
    if (subscriptionError) throw new Error(`Could not create subscription record: ${subscriptionError.message}`);
    logStep("Created role + subscription records", { role, tier: tierValue });

    // If practitioner code provided, link client to practitioner
    if (practitionerCode) {
      const { data: pracProfile, error: practitionerError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("practitioner_code", practitionerCode)
        .maybeSingle();
      if (practitionerError) throw new Error(`Could not verify practitioner code: ${practitionerError.message}`);

      if (pracProfile) {
        const { error: linkError } = await supabaseClient.from("client_practitioner").upsert(
          {
            client_id: userId,
            practitioner_id: pracProfile.user_id,
            active: true,
          },
          { onConflict: "client_id,practitioner_id" }
        );
        if (linkError) throw new Error(`Could not link client to practitioner: ${linkError.message}`);
        logStep("Linked client to practitioner", { practitionerId: pracProfile.user_id, code: practitionerCode });
      } else {
        throw new Error("Practitioner code was not found");
      }
    }

    // Insert the profile only if the auth trigger did not create it.
    // Do not overwrite enrollment_step for returning clients already further along.
    const { error: profileError } = await supabaseClient.from("profiles").upsert(
      { user_id: userId, email: userEmail, enrollment_step: "signed_up" },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
    if (profileError) throw new Error(`Could not update enrollment profile: ${profileError.message}`);
    logStep("Upserted profile enrollment_step");

    // NOTE: Invitation status is no longer flipped here. It now flips to "accepted"
    // only when the user completes the Details step (i.e. they have a real, verified
    // account with profile information saved). See src/pages/enrollment/Details.tsx.

    // FREE TIER: no Stripe needed, return success directly
    if (!priceId || tierValue === "wren") {
      logStep("Free tier — skipping Stripe checkout");
      const origin = req.headers.get("origin") || "http://localhost:3000";
      return new Response(JSON.stringify({
        url: successUrl || `${origin}/enroll/details?tier=${tierValue}&billing=monthly&payment=skipped`,
        free: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // PAID TIER: create Stripe checkout session
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });

      // Expire any open checkout sessions to avoid currency conflict
      const openSessions = await stripe.checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 10,
      });
      for (const s of openSessions.data) {
        await stripe.checkout.sessions.expire(s.id);
        logStep("Expired open session", { sessionId: s.id });
      }
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    // EMBEDDED MODE: return client_secret instead of URL
    if (embedded) {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : userEmail,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded",
        return_url: successUrl || `${origin}/enroll/details?session_id={CHECKOUT_SESSION_ID}&tier=${tierValue}&billing=${billing || "monthly"}&payment=success`,
        payment_method_types: ["card"],
        metadata: {
          user_id: userId,
        },
      });

      logStep("Embedded checkout session created", { sessionId: session.id });

      return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // REDIRECT MODE (legacy): return URL
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl || `${origin}/enroll/details?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/enroll/payment?tier=${tierValue}&billing=${billing || "monthly"}&canceled=true`,
      payment_method_types: ["card"],
      metadata: {
        user_id: userId,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
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
