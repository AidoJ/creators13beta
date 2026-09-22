/**
 * Tells the referring practitioner that their Clinic Profile client has
 * finished signing up. Called by the client's own browser right after their
 * Clinic invitation is redeemed.
 */
import { requireUser, rateLimit } from "../_shared/auth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    if (!rateLimit(`email:${caller.id}`, 20, 5 * 60 * 1000)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    // Only the client themselves can trigger this, and only for their own
    // redeemed Clinic invitation.
    const { data: invite } = await admin
      .from("client_invitations")
      .select("id, name, email, practitioner_id, redeemed_at")
      .eq("kind", "clinic_profile")
      .ilike("email", caller.email ?? "")
      .not("redeemed_at", "is", null)
      .order("redeemed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!invite) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const { data: prac } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("user_id", invite.practitioner_id)
      .maybeSingle();
    if (!prac?.email) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const html = `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2b2b2b">
        <h2 style="font-size:20px;margin:0 0 12px">Your Clinic Profile client has signed up</h2>
        <p style="margin:0 0 12px">Hi ${prac.first_name || "there"},</p>
        <p style="margin:0 0 12px">
          <strong>${invite.name || invite.email}</strong> has completed their signup
          for the Clinic Profile you referred. They're now in the profiling queue.
        </p>
        <p style="margin:0 0 12px">
          You'll be able to see their Creator Types on their client record once
          the profiling is complete.
        </p>
        <p style="margin:24px 0 0;font-size:13px;color:#777">13 Creator Types</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "13 Creators <noreply@connect.13creators.com>",
        to: [prac.email],
        subject: `${invite.name || "Your Clinic client"} has signed up`,
        html,
      }),
    });

    return new Response(JSON.stringify({ sent: res.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
