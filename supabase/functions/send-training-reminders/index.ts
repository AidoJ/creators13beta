import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatDateForTimezone(isoDate: string, timezone: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString("en-AU", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return new Date(isoDate).toISOString();
  }
}

function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatICSDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function buildCalendarButtons(
  title: string,
  scheduledAt: string,
  durationMinutes: number,
  description?: string,
  zoomLink?: string
): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const startStr = formatICSDate(start);
  const endStr = formatICSDate(end);
  const details = (description || "") + (zoomLink ? `\n\nZoom: ${zoomLink}` : "");

  const gcalParams = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${startStr}/${endStr}`, details });
  if (zoomLink) gcalParams.set("location", zoomLink);
  const gcalUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;

  const outlookParams = new URLSearchParams({ subject: title, startdt: start.toISOString(), enddt: end.toISOString(), body: details });
  if (zoomLink) outlookParams.set("location", zoomLink);
  const outlookUrl = `https://outlook.live.com/calendar/0/action/compose?${outlookParams.toString()}`;

  return `<div style="text-align:center;margin:20px 0 0 0;">
    <p style="color:#999;font-size:12px;margin:0 0 10px 0;">Add to your calendar:</p>
    <div>
      <a href="${gcalUrl}" target="_blank" style="display:inline-block;background:#4285F4;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin:0 6px 8px 6px;">Google Calendar</a>
      <a href="${outlookUrl}" target="_blank" style="display:inline-block;background:#0078D4;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;margin:0 6px 8px 6px;">Outlook</a>
    </div>
    <p style="color:#999;font-size:11px;margin:8px 0 0 0;">Apple Calendar: Open the attached .ics file</p>
  </div>`;
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

    // Find calls happening between 23 and 25 hours from now (to handle cron drift)
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const { data: calls, error: callsError } = await supabase
      .from("training_calls")
      .select("*")
      .eq("cancelled", false)
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());

    if (callsError) throw callsError;
    if (!calls || calls.length === 0) {
      return new Response(JSON.stringify({ message: "No calls due for reminder", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Track per-recipient reminder sends so failures can be retried safely
    const callIds = calls.map((c: any) => c.id);
    const { data: existingRecipientEvents } = await supabase
      .from("training_call_events")
      .select("call_id, details")
      .in("call_id", callIds)
      .eq("event_type", "reminder_sent_email");

    const alreadyReminded = new Set(
      (existingRecipientEvents || [])
        .map((e: any) => {
          const email = normalizeEmail(e.details || "");
          return EMAIL_REGEX.test(email) ? `${e.call_id}:${email}` : null;
        })
        .filter(Boolean)
    );

    // Fetch reminder template
    const { data: template, error: tplError } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "training_call_reminder")
      .single();

    if (tplError || !template) {
      throw new Error("Reminder email template not found. Please create it in Admin → Emails.");
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalAlreadySent = 0;
    let totalCandidates = 0;

    for (const call of calls) {
      // Get invitees for this call
      const { data: invitees } = await supabase
        .from("training_call_invitees")
        .select("email, name, user_id")
        .eq("call_id", call.id);

      if (!invitees || invitees.length === 0) continue;

      // Dedupe invitees by normalized email to avoid duplicate sends
      const inviteesByEmail = new Map<string, any>();
      for (const invitee of invitees) {
        const normalized = normalizeEmail(invitee.email || "");
        if (!EMAIL_REGEX.test(normalized)) continue;

        const existing = inviteesByEmail.get(normalized);
        if (!existing || (!existing.user_id && invitee.user_id)) {
          inviteesByEmail.set(normalized, { ...invitee, email: normalized });
        }
      }

      const uniqueInvitees = Array.from(inviteesByEmail.values());
      if (uniqueInvitees.length === 0) continue;

      totalCandidates += uniqueInvitees.length;

      // Get profiles for user_ids to get timezones
      const userIds = uniqueInvitees.filter((i: any) => i.user_id).map((i: any) => i.user_id);
      let profileMap: Record<string, { first_name: string; timezone: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, timezone")
          .in("user_id", userIds);
        for (const p of profiles || []) {
          profileMap[p.user_id] = { first_name: p.first_name || "Practitioner", timezone: p.timezone || "Australia/Sydney" };
        }
      }

      const descriptionHtml = call.description
        ? `<p style="color:#666;font-size:14px;margin:0 0 8px 0;">${call.description}</p>`
        : "";
      const recurrenceText = call.recurrence_rule && call.recurrence_rule !== "none"
        ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">🔁 This is a <strong>${call.recurrence_rule}</strong> recurring call.</p>`
        : "";
      const zoomButton = call.zoom_link
        ? `<div style="text-align:center;margin:24px 0 0 0;"><a href="${call.zoom_link}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Join Zoom Meeting →</a></div>`
        : "";

      let callSent = 0;
      const sentEmails: string[] = [];
      const failedEmails: string[] = [];

      for (const inv of uniqueInvitees) {
        const sendKey = `${call.id}:${inv.email}`;
        if (alreadyReminded.has(sendKey)) {
          totalAlreadySent++;
          continue;
        }

        const profile = inv.user_id ? profileMap[inv.user_id] : null;
        const firstName = inv.name || profile?.first_name || "there";
        const timezone = profile?.timezone || "UTC";
        const localTime = formatDateForTimezone(call.scheduled_at, timezone);

        const calendarButtons = buildCalendarButtons(call.title, call.scheduled_at, call.duration_minutes, call.description, call.zoom_link);

        const vars: Record<string, string> = {
          firstName, title: call.title, description: descriptionHtml,
          localTime, durationMinutes: String(call.duration_minutes),
          timezone, recurrenceText, zoomButton, calendarButtons, email: inv.email,
        };

        const html = replaceTemplateVars(template.html_body, vars);
        const subject = replaceTemplateVars(template.subject, vars);

        // Rate-limit: Resend allows max 2 req/sec
        if (callSent > 0) await new Promise((r) => setTimeout(r, 600));
        try {
          const { error } = await resend.emails.send({
            from: "13 Creators <noreply@connect.13creators.com>",
            to: [inv.email],
            subject,
            html,
          });
          if (!error) {
            callSent++;
            totalSent++;
            sentEmails.push(inv.email);
            alreadyReminded.add(sendKey);
          } else {
            console.error(`Reminder error for ${inv.email}:`, error);
            totalFailed++;
            failedEmails.push(inv.email);
          }
        } catch (e) {
          console.error(`Reminder exception for ${inv.email}:`, e);
          totalFailed++;
          failedEmails.push(inv.email);
        }
      }

      if (sentEmails.length > 0) {
        await supabase.from("training_call_events").insert(
          sentEmails.map((email) => ({
            call_id: call.id,
            event_type: "reminder_sent_email",
            details: email,
          }))
        );
      }

      if (sentEmails.length > 0 || failedEmails.length > 0) {
        await supabase.from("training_call_events").insert({
          call_id: call.id,
          event_type: "reminder_sent",
          details: `Reminder sent to ${callSent} of ${uniqueInvitees.length} invitees${failedEmails.length > 0 ? ` | Failed: ${failedEmails.slice(0, 5).join(", ")}` : ""}`,
        });
      }
    }

    if (totalSent === 0 && totalFailed === 0) {
      return new Response(JSON.stringify({ message: "All reminders already sent", sent: 0, alreadySent: totalAlreadySent }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, callsProcessed: calls.length, candidates: totalCandidates, sent: totalSent, failed: totalFailed, alreadySent: totalAlreadySent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-training-reminders error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
