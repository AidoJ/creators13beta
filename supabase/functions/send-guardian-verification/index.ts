/**
 * Sends (or re-sends) the parent/guardian email-confirmation link for an
 * under-18 enrolment. Called by the young person's own browser after they save
 * their personal details. Step one of two — the verbal confirmation with
 * A'Hara is recorded separately by her on the trainer screen.
 */
import { requireUser, adminClient, rateLimit } from "../_shared/auth.ts";
import { guardianVerificationEmail } from "../_shared/guardian-email.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ORIGIN = "https://creators13.lovable.app";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = adminClient();
    const caller = await requireUser(req, admin);
    if (!rateLimit(`guardian-verify:${caller.id}`, 5, 10 * 60 * 1000)) {
      return json({ error: "Rate limit exceeded" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const origin = typeof body?.app_origin === "string" && body.app_origin.startsWith("http")
      ? body.app_origin.replace(/\/$/, "")
      : DEFAULT_ORIGIN;

    const { data: profile } = await admin
      .from("profiles")
      .select(
        "user_id, first_name, last_name, date_of_birth, guardian_first_name, guardian_last_name, guardian_email, guardian_consent_status, guardian_verification_token",
      )
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!profile?.date_of_birth || !profile.guardian_email) {
      return json({ skipped: true, reason: "no_guardian" });
    }

    const dob = new Date(profile.date_of_birth as string);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age >= 18) return json({ skipped: true, reason: "not_a_minor" });
    if (profile.guardian_consent_status === "verified") {
      return json({ skipped: true, reason: "already_verified" });
    }

    const token = (profile.guardian_verification_token as string | null) ??
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        guardian_verification_token: token,
        guardian_verification_sent_at: new Date().toISOString(),
      })
      .eq("user_id", caller.id);
    if (upErr) throw upErr;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const { subject, html } = guardianVerificationEmail({
      guardianName: [profile.guardian_first_name, profile.guardian_last_name]
        .filter(Boolean).join(" ") || null,
      childName: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null,
      link: `${origin}/guardian-verify?token=${token}`,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "13 Creators <noreply@connect.13creators.com>",
        to: [profile.guardian_email],
        subject,
        html,
      }),
    });

    return json({ sent: res.ok });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return json({ error: String(err?.message ?? e) }, err?.status ?? 500);
  }
});
