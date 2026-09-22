/**
 * Daily sweep: reminds A'Hara (every trainer-role account) about minor
 * enrolments where the guardian has confirmed their email but the verbal
 * confirmation has not been recorded. First reminder 3 days after the email
 * confirmation, repeating every 3 days. There is deliberately NO auto-expiry —
 * an unworked queue must surface as a backlog, never as consent lapsing.
 */
import { adminClient } from "../_shared/auth.ts";
import { guardianReminderEmail } from "../_shared/guardian-email.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_DAYS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = adminClient();

    // Only the service-role key may run the sweep.
    const auth = req.headers.get("Authorization") ?? "";
    if (auth.replace("Bearer ", "").trim() !== (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - INTERVAL_DAYS * DAY).toISOString();

    const { data: pending } = await admin
      .from("profiles")
      .select(
        "user_id, first_name, last_name, guardian_first_name, guardian_last_name, guardian_phone, guardian_email_confirmed_at, guardian_reminder_last_sent_at, guardian_reminder_count",
      )
      .eq("guardian_consent_status", "email_confirmed")
      .lte("guardian_email_confirmed_at", cutoff);

    const due = (pending ?? []).filter((p) =>
      !p.guardian_reminder_last_sent_at ||
      new Date(p.guardian_reminder_last_sent_at as string).getTime() <= Date.now() - INTERVAL_DAYS * DAY
    );

    if (due.length === 0) return json({ reminded: 0 });

    // Recipients: every trainer-role account (A'Hara today).
    const { data: trainers } = await admin.from("user_roles").select("user_id").eq("role", "trainer");
    const ids = (trainers ?? []).map((r) => r.user_id);
    const { data: trainerProfiles } = ids.length
      ? await admin.from("profiles").select("email").in("user_id", ids)
      : { data: [] as { email: string | null }[] };
    const recipients = (trainerProfiles ?? []).map((t) => t.email).filter(Boolean) as string[];

    if (recipients.length === 0) return json({ reminded: 0, reason: "no_trainer_email" });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    let sent = 0;
    for (const p of due) {
      const daysWaiting = Math.floor(
        (Date.now() - new Date(p.guardian_email_confirmed_at as string).getTime()) / DAY,
      );
      const { subject, html } = guardianReminderEmail({
        childName: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
        guardianName: [p.guardian_first_name, p.guardian_last_name].filter(Boolean).join(" ") || null,
        guardianPhone: p.guardian_phone as string | null,
        daysWaiting,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "13 Creators <noreply@connect.13creators.com>",
          to: recipients,
          subject,
          html,
        }),
      });

      if (res.ok) {
        sent++;
        await admin
          .from("profiles")
          .update({
            guardian_reminder_last_sent_at: new Date().toISOString(),
            guardian_reminder_count: ((p.guardian_reminder_count as number) ?? 0) + 1,
          })
          .eq("user_id", p.user_id);
      }
    }

    return json({ reminded: sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
