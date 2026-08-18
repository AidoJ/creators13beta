// Enrolment abandonment recovery sweep.
//
// Scheduled via pg_cron every ~15 minutes. For each eligible user:
//   - identifies their next required step (mirrors src/lib/enrollmentSteps.ts),
//   - checks the abandonment window (24h default; 3h for paygate),
//   - respects: suppression list (authoritative), reminders opt_out,
//               per-episode cap (max 2), and forward-progress reset.
// Sends ONE email per pass and logs sent/skipped/completed events.
//
// Auth: service-role bearer (cron) OR admin JWT.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ORIGIN = "https://creators13.lovable.app";
const FROM_ADDRESS = "Creators 13 <notify@creators13.com>";

interface StepInfo {
  key: string;
  label: string;
  route: string;
  isPaygate: boolean;
  index: number;
  total: number;
}

// Mirrors src/lib/enrollmentSteps.ts. Keep in sync.
function nextStep(row: any): StepInfo | null {
  const isStaff = row.is_staff === true;
  const isPlayerOnly = row.signup_path === "player";
  if (isStaff || isPlayerOnly) return null;

  const hasSub = !!row.tier;
  const hasPract = row.has_practitioner === true;
  const hasDetails =
    !!row.first_name && !!row.date_of_birth && !!row.gender && !!row.height_cm;
  const hasConsent = !!row.case_study_consent_at;
  const hasPhotos = (row.photo_count || 0) > 0;
  const hasBooking = row.has_booking === true;
  const reachedCheckout = !!row.reached_checkout_at;

  const qs = (() => {
    const p = new URLSearchParams();
    if (row.tier) p.set("tier", row.tier);
    if (row.billing_period) p.set("billing", row.billing_period);
    const s = p.toString();
    return s ? `?${s}` : "";
  })();

  const steps: Array<Omit<StepInfo, "index" | "total"> & { applies: boolean; done: boolean }> = [
    { key: "plan", label: "Choose your plan", route: "/enroll", applies: true, done: hasSub, isPaygate: false },
    { key: "paygate", label: "Complete your payment", route: `/enroll/payment${qs}`, applies: !hasSub && reachedCheckout, done: hasSub, isPaygate: true },
    { key: "practitioner", label: "Link your practitioner", route: `/enroll/practitioner${qs}`, applies: true, done: hasPract, isPaygate: false },
    { key: "details", label: "Add your personal details", route: `/enroll/details${qs}`, applies: true, done: hasDetails, isPaygate: false },
    { key: "consent", label: "Confirm consent", route: `/enroll/consent${qs}`, applies: true, done: hasConsent, isPaygate: false },
    { key: "photos", label: "Upload your photos", route: `/enroll/photos${qs}`, applies: true, done: hasPhotos, isPaygate: false },
    { key: "booking", label: "Book your session", route: `/enroll/booking${qs}`, applies: !row.is_case_study && row.practitioner_is_trainer === true, done: hasBooking, isPaygate: false },
  ];
  const applicable = steps.filter((s) => s.applies);
  const idx = applicable.findIndex((s) => !s.done);
  if (idx === -1) return null;
  return {
    key: applicable[idx].key,
    label: applicable[idx].label,
    route: applicable[idx].route,
    isPaygate: !!applicable[idx].isPaygate,
    index: idx + 1,
    total: applicable.length,
  };
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function renderEmail(opts: {
  firstName: string | null;
  stepLabel: string;
  isFollowUp: boolean;
  resumeUrl: string;
  unsubUrl: string;
  discountLine: string | null;
  paygate: boolean;
}): { subject: string; html: string } {
  const hi = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const headline = opts.isFollowUp
    ? "Still interested? Your progress is saved."
    : opts.paygate
      ? "Your payment isn't finished — but you're one tap away."
      : "You're nearly there — your progress is saved.";
  const cta = opts.paygate ? "Complete payment" : "Continue enrolment";
  const subject = opts.isFollowUp
    ? "Still interested in finishing enrolment?"
    : `Next step: ${opts.stepLabel}`;
  const discountBlock = opts.discountLine
    ? `<p style="margin:16px 0;padding:12px 16px;background:#fff3d6;border-radius:8px;color:#5a4300;font-size:14px;"><strong>${opts.discountLine}</strong></p>`
    : "";
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#1a1a1a;">
  <h1 style="font-size:22px; margin:0 0 12px 0;">${headline}</h1>
  <p style="margin:0 0 8px 0;">${hi}</p>
  <p style="margin:0 0 16px 0;">Next step: <strong>${opts.stepLabel}</strong>.</p>
  ${discountBlock}
  <p style="margin:24px 0;">
    <a href="${opts.resumeUrl}" style="display:inline-block; background:#0f172a; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;">${cta}</a>
  </p>
  <p style="font-size:12px; color:#6b7280; margin-top:32px;">
    This link takes you straight to your next step and is valid for 30 days.
  </p>
  <p style="font-size:12px; color:#9ca3af; margin-top:24px;">
    <a href="${opts.unsubUrl}" style="color:#9ca3af;">Stop enrolment reminders</a>
    &nbsp;·&nbsp;
    You'll still receive account and payment emails.
  </p>
</div>`.trim();
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    // Auth: service role bearer OR admin JWT.
    const ah = req.headers.get("Authorization") || "";
    const token = ah.startsWith("Bearer ") ? ah.slice(7).trim() : "";
    let authorized = !!serviceRole && token === serviceRole;
    const admin = createClient(supabaseUrl, serviceRole);
    if (!authorized && token) {
      const { data: u } = await admin.auth.getUser(token);
      if (u.user) {
        const { data: role } = await admin
          .from("user_roles").select("role")
          .eq("user_id", u.user.id).in("role", ["admin", "trainer"]).maybeSingle();
        authorized = !!role;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single-flight guard: prevent overlapping runs from re-reading the same
    // "not yet sent" snapshot and double-sending recovery emails.
    const LEASE_SECONDS = 600;
    try {
      const { data: gotLease, error: leaseErr } = await admin.rpc("acquire_sweep_lease", {
        _key: "enrollment-recovery-sweep",
        _ttl_seconds: LEASE_SECONDS,
      });
      if (leaseErr) {
        console.warn("[enrollment-recovery-sweep] lease acquisition errored; skipping run", leaseErr);
        return new Response(JSON.stringify({ ok: true, skipped: "lease_error" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!gotLease) {
        return new Response(JSON.stringify({ ok: true, skipped: "another_run_in_progress" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.warn("[enrollment-recovery-sweep] lease acquisition threw; skipping run", e);
      return new Response(JSON.stringify({ ok: true, skipped: "lease_throw" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendKey);

    // Thresholds
    const { data: settings } = await admin
      .from("game_settings").select(
        "enrollment_recovery_hours, enrollment_paygate_recovery_hours, enrollment_recovery_followup_days, enrollment_recovery_followup_enabled",
      ).limit(1).maybeSingle();
    const HOURS = (settings as any)?.enrollment_recovery_hours ?? 24;
    const PAYGATE_HOURS = (settings as any)?.enrollment_paygate_recovery_hours ?? 3;
    const FOLLOWUP_DAYS = (settings as any)?.enrollment_recovery_followup_days ?? 4;
    const FOLLOWUP_ON = (settings as any)?.enrollment_recovery_followup_enabled ?? true;

    // Candidates: has an incomplete enrolment path AND idle beyond threshold.
    // We fetch broadly, then filter in code (small user counts here).
    const idleCutoffMs = Date.now() - HOURS * 3600 * 1000;
    const paygateCutoffMs = Date.now() - PAYGATE_HOURS * 3600 * 1000;

    // Pull profiles with any signup + not opted-out.
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("user_id, email, first_name, date_of_birth, gender, height_cm, case_study_consent_at, last_enrollment_activity_at, reached_checkout_at, enrollment_reminders_opt_out, enrollment_reminders_opt_out_token, enrollment_recovery_resume_token_hash, enrollment_recovery_resume_token_expires_at, created_at")
      .eq("enrollment_reminders_opt_out", false)
      .limit(1000);
    if (profErr) throw profErr;
    if (!profiles?.length) return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userIds = profiles.map((p: any) => p.user_id);
    const emails = profiles.map((p: any) => (p.email || "").toLowerCase()).filter(Boolean);

    // Batched joins
    const [subsRes, rolesRes, photosRes, bookingsRes, cpRes, csRes, epRes, supRes] = await Promise.all([
      admin.from("subscriptions").select("user_id, tier, billing_period, signup_path, status").in("user_id", userIds),
      admin.from("user_roles").select("user_id, role").in("user_id", userIds),
      admin.from("profiling_photos").select("user_id").in("user_id", userIds),
      admin.from("bookings").select("client_id").in("client_id", userIds),
      admin.from("client_practitioner").select("client_id, practitioner_id, active").in("client_id", userIds).eq("active", true),
      admin.from("case_studies").select("subject_user_id").in("subject_user_id", userIds),
      admin.from("enrollment_recovery_episodes").select("*").in("user_id", userIds),
      admin.from("suppressed_emails").select("email").in("email", emails.length ? emails : ["__none__"]),
    ]);

    const subs = new Map<string, any>();
    (subsRes.data || []).forEach((r: any) => subs.set(r.user_id, r));
    const roleSet = new Set<string>(
      (rolesRes.data || []).filter((r: any) => ["practitioner", "trainee", "trainer", "admin"].includes(r.role)).map((r: any) => r.user_id),
    );
    const photoCount = new Map<string, number>();
    (photosRes.data || []).forEach((r: any) => photoCount.set(r.user_id, (photoCount.get(r.user_id) || 0) + 1));
    const bookingSet = new Set<string>((bookingsRes.data || []).map((r: any) => r.client_id));
    const cpMap = new Map<string, string>();
    (cpRes.data || []).forEach((r: any) => cpMap.set(r.client_id, r.practitioner_id));
    const csSet = new Set<string>((csRes.data || []).map((r: any) => r.subject_user_id));
    const suppressed = new Set<string>(((supRes.data || []) as any[]).map((r: any) => (r.email || "").toLowerCase()));

    // practitioner_is_trainer lookup
    const practIds = Array.from(new Set(Array.from(cpMap.values())));
    let trainerSet = new Set<string>();
    if (practIds.length) {
      const { data: tr } = await admin.from("user_roles").select("user_id").in("user_id", practIds).eq("role", "trainer");
      trainerSet = new Set<string>((tr || []).map((r: any) => r.user_id));
    }

    // Open episodes per user
    const openEpisodeByUser = new Map<string, any>();
    const allEpisodesByUser = new Map<string, any[]>();
    (epRes.data || []).forEach((e: any) => {
      if (!allEpisodesByUser.has(e.user_id)) allEpisodesByUser.set(e.user_id, []);
      allEpisodesByUser.get(e.user_id)!.push(e);
      if (!e.closed_at) openEpisodeByUser.set(e.user_id, e);
    });

    let sent = 0, skipped = 0, closed = 0;
    const now = Date.now();

    for (const p of profiles as any[]) {
      // Fast filters
      if (!p.email || suppressed.has((p.email || "").toLowerCase())) continue;
      if (roleSet.has(p.user_id)) continue;

      const sub = subs.get(p.user_id);
      const row = {
        is_staff: false,
        signup_path: sub?.signup_path ?? null,
        tier: sub?.tier ?? null,
        billing_period: sub?.billing_period ?? null,
        first_name: p.first_name,
        date_of_birth: p.date_of_birth,
        gender: p.gender,
        height_cm: p.height_cm,
        case_study_consent_at: p.case_study_consent_at,
        photo_count: photoCount.get(p.user_id) || 0,
        has_booking: bookingSet.has(p.user_id),
        has_practitioner: cpMap.has(p.user_id),
        is_case_study: csSet.has(p.user_id) || !!sub?.referral_code,
        practitioner_is_trainer: cpMap.has(p.user_id) && trainerSet.has(cpMap.get(p.user_id)!),
        reached_checkout_at: p.reached_checkout_at,
      };

      const step = nextStep(row);

      // Enrolment complete → close any open episode as 'completed'
      if (!step) {
        const open = openEpisodeByUser.get(p.user_id);
        if (open) {
          await admin.from("enrollment_recovery_episodes")
            .update({ closed_at: new Date().toISOString(), closed_reason: "completed", completed_at: new Date().toISOString() })
            .eq("id", open.id);
          await admin.from("enrollment_recovery_events").insert({
            episode_id: open.id, user_id: p.user_id, event: "completed", step_key: open.step_key,
          });
          closed++;
        }
        continue;
      }

      // Only "resumable" abandonments are eligible (plan-choose isn't a saved state)
      if (step.key === "plan") continue;

      // Idle check
      const lastActivity = p.last_enrollment_activity_at
        ? new Date(p.last_enrollment_activity_at).getTime()
        : new Date(p.created_at).getTime();
      const cutoff = step.isPaygate ? paygateCutoffMs : idleCutoffMs;
      if (lastActivity > cutoff) { skipped++; continue; }

      // Episode selection / cap check
      let episode = openEpisodeByUser.get(p.user_id);
      if (!episode) {
        // Open a new episode
        const { data: created, error: epErr } = await admin
          .from("enrollment_recovery_episodes")
          .insert({ user_id: p.user_id, step_key: step.key, paygate: step.isPaygate })
          .select("*").single();
        if (epErr) { skipped++; continue; }
        episode = created;
      } else {
        // Update step_key if the user is now abandoned at a further step
        if (episode.step_key !== step.key) {
          await admin.from("enrollment_recovery_episodes")
            .update({ step_key: step.key, paygate: step.isPaygate })
            .eq("id", episode.id);
          episode.step_key = step.key; episode.paygate = step.isPaygate;
        }
      }

      // Two-email cap
      if ((episode.emails_sent || 0) >= 2) { skipped++; continue; }

      // If we already sent one, gate the follow-up on the +4d config
      const isFollowUp = (episode.emails_sent || 0) >= 1;
      if (isFollowUp) {
        if (!FOLLOWUP_ON) { skipped++; continue; }
        if (!episode.last_email_sent_at) { skipped++; continue; }
        const sinceLast = now - new Date(episode.last_email_sent_at).getTime();
        if (sinceLast < FOLLOWUP_DAYS * 24 * 3600 * 1000) { skipped++; continue; }
      }

      // Discount lookup (paygate only)
      let discountLine: string | null = null;
      let discountCode: string | null = null;
      if (step.isPaygate) {
        const { data: codes } = await admin
          .from("profile_discount_codes")
          .select("code, percent_off, expires_at, redeemed_at")
          .eq("user_id", p.user_id)
          .is("redeemed_at", null)
          .order("percent_off", { ascending: false });
        const live = (codes || []).find((c: any) => !c.expires_at || new Date(c.expires_at).getTime() > now);
        if (live) {
          discountCode = live.code;
          discountLine = `Your ${live.percent_off}% discount is still waiting — code ${live.code}.`;
        }
      }

      // Resume token — fresh single-use, 30-day expiry.
      const rawToken = randToken();
      const hash = await sha256hex(rawToken);
      const expiresAt = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
      await admin.from("profiles").update({
        enrollment_recovery_resume_token_hash: hash,
        enrollment_recovery_resume_token_expires_at: expiresAt,
      }).eq("user_id", p.user_id);

      // Unsubscribe token
      const { data: unsubToken } = await admin.rpc("ensure_enrollment_reminders_opt_out_token", { _user_id: p.user_id });

      const resumeUrl = `${APP_ORIGIN}/enroll/resume?token=${rawToken}`;
      const unsubUrl = `${APP_ORIGIN}/unsubscribe/enrollment?token=${unsubToken}`;

      const { subject, html } = renderEmail({
        firstName: p.first_name || null,
        stepLabel: step.label,
        isFollowUp,
        resumeUrl,
        unsubUrl,
        discountLine,
        paygate: step.isPaygate,
      });

      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: [p.email],
          subject,
          html,
        });
        await admin.from("enrollment_recovery_episodes").update({
          emails_sent: (episode.emails_sent || 0) + 1,
          first_email_sent_at: episode.first_email_sent_at || new Date().toISOString(),
          last_email_sent_at: new Date().toISOString(),
          discount_code: discountCode ?? episode.discount_code ?? null,
        }).eq("id", episode.id);
        await admin.from("enrollment_recovery_events").insert({
          episode_id: episode.id, user_id: p.user_id, event: "sent",
          step_key: step.key,
          metadata: { paygate: step.isPaygate, follow_up: isFollowUp, discount_code: discountCode },
        });
        sent++;
      } catch (e) {
        console.error("send failed for", p.user_id, e);
        skipped++;
      }
    }

    return new Response(JSON.stringify({ sent, skipped, closed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sweep error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
