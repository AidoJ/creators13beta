import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { grantEntitlement, levelKeyForTier } from "../_shared/entitlements.ts";

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

    // Require a verified JWT. We no longer accept user_id / email from
    // the request body — that path allowed unauthenticated role granting.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: sign-in required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabaseClient.auth.getUser(token);
    if (authErr || !authData.user?.id || !authData.user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized: invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId: string = authData.user.id;
    const userEmail: string = authData.user.email;
    logStep("User from JWT", { userId, email: userEmail });

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      body = null as unknown as Record<string, any>;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      logStep("Rejected: malformed body");
      return new Response(JSON.stringify({ error: "invalid_request", message: "A valid checkout request body is required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { priceId, successUrl, cancelUrl, tier, billing, embedded } = body;


    // ------------------------------------------------------------------
    // NEW PRODUCT PATH — inline pricing straight from the products table.
    // Runs only when product_id is supplied; the legacy tier flow below is
    // untouched.
    // ------------------------------------------------------------------
    if (body.product_id) {
      const { data: product, error: prodErr } = await supabaseClient
        .from("products").select("*").eq("id", body.product_id).maybeSingle();
      if (prodErr || !product) throw new Error("Product not found");
      if (!product.active) throw new Error("This product is not currently available");

      const origin = req.headers.get("origin") || "http://localhost:3000";
      const currency = (product.currency || "aud").toLowerCase();
      const levelKey: string | null = product.grants_level_key ?? null;

      // ---- Clinic Profile referral -------------------------------------
      // The practitioner pays on behalf of someone who has no account yet.
      // Nothing may be granted to the payer: the webhook marks the invitation
      // paid, and the access level is granted to the client on redemption.
      let referralInvitationId: string | null = null;
      if (body.invitation_id) {
        const { data: invite, error: invErr } = await supabaseClient
          .from("client_invitations")
          .select("id, practitioner_id, kind, paid_at")
          .eq("id", body.invitation_id)
          .maybeSingle();
        if (invErr) throw new Error(`Could not verify invitation: ${invErr.message}`);
        if (!invite) throw new Error("Invitation not found");
        if (invite.practitioner_id !== userId) throw new Error("This invitation is not yours");
        if (invite.kind !== "clinic_profile") throw new Error("Invitation is not a Clinic Profile referral");
        if (invite.paid_at) throw new Error("This invitation has already been paid for");
        referralInvitationId = invite.id;
        logStep("Referral purchase", { invitationId: referralInvitationId });
      }

      // Seat cap: check-and-hold happens atomically inside reserve_seat, which
      // takes a per-level lock. Two simultaneous checkouts for the last seat
      // cannot both succeed. Re-checked in the webhook before granting.
      let reservationId: string | null = null;
      if (product.seat_cap && levelKey && !referralInvitationId) {
        const { data: res, error: resErr } = await supabaseClient.rpc("reserve_seat", {
          _product_id: product.id,
          _level_key: levelKey,
          _user_id: userId,
          _seat_cap: product.seat_cap,
          _minutes: 30,
        });
        if (resErr) throw new Error(`Could not hold a seat: ${resErr.message}`);
        if (!res) {
          return new Response(JSON.stringify({ error: "sold_out", message: "This course is fully booked." }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        reservationId = res as string;
      }

      // FREE / NO-CHARGE product (e.g. case study): grant straight away.
      if (!product.price_cents || product.price_cents <= 0) {
        if (levelKey && !referralInvitationId) {
          await grantEntitlement(supabaseClient, { userId, levelKey, source: "admin" });
        }
        if (reservationId) await supabaseClient.from("seat_reservations").delete().eq("id", reservationId);
        return new Response(JSON.stringify({ free: true, url: successUrl || `${origin}/dashboard` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      const customerId = customers.data[0]?.id;

      const recurring = product.billing_shape === "recurring" || product.billing_shape === "fixed_term";
      const metadata: Record<string, string> = {
        user_id: userId,
        product_id: product.id,
        billing_shape: product.billing_shape,
        // Referral purchases grant nothing to the payer.
        level_key: referralInvitationId ? "" : (levelKey ?? ""),
        term_months: product.term_months ? String(product.term_months) : "",
        reservation_id: reservationId ?? "",
        invitation_id: referralInvitationId ?? "",
        app_origin: origin,
      };

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : userEmail,
        mode: recurring ? "subscription" : "payment",
        ...(embedded
          ? { ui_mode: "embedded", return_url: successUrl || `${origin}/dashboard?purchase=success` }
          : {
              success_url: successUrl || `${origin}/dashboard?purchase=success`,
              cancel_url: cancelUrl || `${origin}/dashboard?purchase=canceled`,
            }),
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: product.price_cents,
            product_data: {
              name: product.name,
              ...(product.description ? { description: product.description } : {}),
            },
            ...(recurring ? { recurring: { interval: "month" as const } } : {}),
          },
        }],
        metadata,
        ...(recurring ? { subscription_data: { metadata } } : {}),
      });

      if (reservationId) {
        await supabaseClient.from("seat_reservations").update({ stripe_session_id: session.id }).eq("id", reservationId);
      }
      logStep("Product checkout session created", { sessionId: session.id, productId: product.id });

      return new Response(JSON.stringify(
        embedded ? { clientSecret: session.client_secret } : { url: session.url }
      ), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }



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

    const signupPath: string =
      body.signup_path === "player" ? "player"
      : practitionerCode || body.signup_path === "case_study" ? "case_study"
      : "paying";

    const subData: Record<string, any> = {
      user_id: userId,
      tier: tierValue,
      status: tierValue === "wren" ? "active" : "incomplete",
      billing_period: billing || "monthly",
      signup_path: signupPath,
    };
    if (practitionerCode) subData.referral_code = practitionerCode;

    const { error: subscriptionError } = await supabaseClient.from("subscriptions").upsert(
      subData,
      { onConflict: "user_id" }
    );
    if (subscriptionError) throw new Error(`Could not create subscription record: ${subscriptionError.message}`);
    logStep("Created role + subscription records", { role, tier: tierValue });

    // Entitlements, granted ALONGSIDE the existing role (role removal happens at
    // switch-over, not now). Paid tiers are granted by the webhook once payment
    // succeeds; only the no-charge paths grant here.
    if (signupPath === "case_study") {
      // Case study: the case_study level plus 30 days of Connect, no charge.
      // Idempotent — nothing re-granted while an active one exists.
      await grantEntitlement(supabaseClient, { userId, levelKey: "case_study", source: "code" });
      await grantEntitlement(supabaseClient, {
        userId, levelKey: "taster", source: "code",
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      logStep("Granted case study entitlements", { userId });
    } else if (tierValue === "wren") {
      const level = await levelKeyForTier(supabaseClient, tierValue);
      if (level) await grantEntitlement(supabaseClient, { userId, levelKey: level, source: "stripe" });
    }

    // If practitioner code provided, link client to practitioner
    if (practitionerCode) {
      const { data: pracProfile, error: practitionerError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("practitioner_code", practitionerCode)
        .maybeSingle();
      if (practitionerError) throw new Error(`Could not verify practitioner code: ${practitionerError.message}`);

      if (pracProfile) {
        // assign_self_practitioner relies on auth.uid(), so it must be called
        // with the caller's JWT (a service-role client has no auth context).
        const userScopedClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { error: linkError } = await userScopedClient.rpc("assign_self_practitioner", {
          _practitioner_id: pracProfile.user_id,
        });
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
