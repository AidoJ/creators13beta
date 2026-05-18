import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_ORIGIN = "https://creators13.lovable.app";

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return out;
}

function buildInviteLink(token: string, practitionerCode: string | null): string {
  const params = new URLSearchParams({
    tier: "wren",
    billing: "monthly",
    case_study: "true",
    practitioner_code: practitionerCode || "",
    invite: token,
  });
  return `${APP_ORIGIN}/enroll?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase config missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const resend = new Resend(apiKey);

    // Optional backfill mode: ignore the 7-day age filter and reminder_sent_at,
    // and target ALL invitations whose status is anything other than "ready_for_profiling".
    let backfill = false;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        backfill = body?.backfill === true;
      }
    } catch (_) {
      // ignore
    }

    // Default (cron) rule: invitations >=7 days old, status != ready_for_profiling,
    // no reminder previously sent. Photo upload is double-checked below.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("client_invitations")
      .select("id, name, email, practitioner_id, invite_token, status, created_at, reminder_sent_at")
      .neq("status", "ready_for_profiling");

    if (!backfill) {
      query = query.is("reminder_sent_at", null).lte("created_at", sevenDaysAgo);
    }

    const { data: invitations, error: invErr } = await query;

    if (invErr) throw invErr;

    if (!invitations || invitations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders due", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch reminder template
    const { data: template, error: tplErr } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "case_study_invite_reminder")
      .single();
    if (tplErr || !template) throw new Error("Reminder email template not found");

    // Fetch practitioner profiles (for name + practitioner_code)
    const practitionerIds = [...new Set(invitations.map((i) => i.practitioner_id))];
    const { data: practitioners } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, practitioner_code")
      .in("user_id", practitionerIds);
    const practMap: Record<string, { name: string; code: string | null }> = {};
    for (const p of practitioners || []) {
      practMap[p.user_id] = {
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "your practitioner",
        code: p.practitioner_code,
      };
    }

    // Double-check: skip any invitee whose email already has uploaded photos
    // (defensive — status may not have been updated yet).
    const inviteEmails = [...new Set(invitations.map((i) => i.email.toLowerCase()))];
    const { data: inviteeProfiles } = await supabase
      .from("profiles")
      .select("user_id, email")
      .in("email", inviteEmails);
    const emailToUserId: Record<string, string> = {};
    for (const p of inviteeProfiles || []) {
      if (p.email) emailToUserId[p.email.toLowerCase()] = p.user_id;
    }
    const inviteeUserIds = Object.values(emailToUserId);
    const { data: photoRows } = inviteeUserIds.length
      ? await supabase.from("profiling_photos").select("user_id").in("user_id", inviteeUserIds)
      : { data: [] };
    const userIdsWithPhotos = new Set((photoRows || []).map((r) => r.user_id));

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const inv of invitations) {
      const uid = emailToUserId[inv.email.toLowerCase()];
      if (uid && userIdsWithPhotos.has(uid)) {
        skipped++;
        continue;
      }

      const pract = practMap[inv.practitioner_id] || { name: "your practitioner", code: null };
      const inviteLink = buildInviteLink(inv.invite_token, pract.code);

      const vars = {
        clientName: inv.name || "there",
        practitionerName: pract.name,
        inviteLink,
      };

      const html = replaceVars(template.html_body, vars);
      const subject = replaceVars(template.subject, vars);

      // Rate-limit (Resend ~2 req/sec)
      if (sent > 0) await new Promise((r) => setTimeout(r, 600));

      try {
        const { error } = await resend.emails.send({
          from: "13 Creators <noreply@connect.13creators.com>",
          to: [inv.email],
          subject,
          html,
        });
        if (error) {
          console.error(`Reminder error for ${inv.email}:`, error);
          failed++;
        } else {
          await supabase
            .from("client_invitations")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", inv.id);
          sent++;
        }
      } catch (e) {
        console.error(`Reminder exception for ${inv.email}:`, e);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        candidates: invitations.length,
        sent,
        failed,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-invite-reminders error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
