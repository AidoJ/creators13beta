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

function formatICSDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function generateICS(
  title: string,
  description: string,
  scheduledAt: string,
  durationMinutes: number,
  zoomLink?: string,
  cancelled?: boolean
): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//13Creators//Training//EN",
    "CALSCALE:GREGORIAN",
    cancelled ? "METHOD:CANCEL" : "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${cancelled ? "CANCELLED: " : ""}${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}${zoomLink ? "\\n\\nZoom: " + zoomLink : ""}`,
    zoomLink ? `URL:${zoomLink}` : "",
    `UID:${crypto.randomUUID()}@13creators.com`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return lines;
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

function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
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

    const body = await req.json();
    const { callId, updateType, previousScheduledAt } = body;
    // updateType: "rescheduled" | "cancelled"

    if (!callId || !updateType) throw new Error("Missing callId or updateType");

    // Fetch the call
    const { data: call, error: callErr } = await supabase
      .from("training_calls")
      .select("*")
      .eq("id", callId)
      .single();
    if (callErr || !call) throw new Error("Call not found");

    // Fetch invitees
    const { data: invitees } = await supabase
      .from("training_call_invitees")
      .select("email, name, user_id")
      .eq("call_id", callId);

    if (!invitees || invitees.length === 0) {
      return new Response(JSON.stringify({ message: "No invitees to notify", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine template
    const templateKey = updateType === "cancelled"
      ? "training_call_cancelled"
      : "training_call_rescheduled";

    const { data: template, error: tplErr } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", templateKey)
      .single();

    if (tplErr || !template) throw new Error(`Email template '${templateKey}' not found`);

    // Get profiles for timezones
    const userIds = invitees.filter((i: any) => i.user_id).map((i: any) => i.user_id);
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

    const isCancelled = updateType === "cancelled";
    const icsContent = generateICS(
      call.title,
      call.description || "",
      call.scheduled_at,
      call.duration_minutes,
      call.zoom_link,
      isCancelled
    );
    const icsBase64 = btoa(icsContent);

    const descriptionHtml = call.description
      ? `<p style="color:#666;font-size:14px;margin:0 0 8px 0;">${call.description}</p>`
      : "";
    const recurrenceText = call.recurrence_rule && call.recurrence_rule !== "none"
      ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">🔁 This is a <strong>${call.recurrence_rule}</strong> recurring call.</p>`
      : "";
    const zoomButton = !isCancelled && call.zoom_link
      ? `<div style="text-align:center;margin:24px 0 0 0;"><a href="${call.zoom_link}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Join Zoom Meeting →</a></div>`
      : "";

    let sentCount = 0;
    for (const inv of invitees) {
      const profile = inv.user_id ? profileMap[inv.user_id] : null;
      const firstName = inv.name || profile?.first_name || "there";
      const timezone = profile?.timezone || "Australia/Sydney";
      const localTime = formatDateForTimezone(call.scheduled_at, timezone);
      const previousTime = previousScheduledAt
        ? formatDateForTimezone(previousScheduledAt, timezone)
        : "N/A";

      const calendarButtons = isCancelled ? "" : buildCalendarButtons(call.title, call.scheduled_at, call.duration_minutes, call.description, call.zoom_link);

      const vars: Record<string, string> = {
        firstName,
        title: call.title,
        description: descriptionHtml,
        localTime,
        previousTime,
        durationMinutes: String(call.duration_minutes),
        timezone,
        recurrenceText,
        zoomButton,
        calendarButtons,
        email: inv.email,
      };

      const html = replaceTemplateVars(template.html_body, vars);
      const subject = replaceTemplateVars(template.subject, vars);

      // Rate-limit: Resend allows max 2 req/sec
      if (sentCount > 0) await new Promise((r) => setTimeout(r, 600));
      try {
        const { error } = await resend.emails.send({
          from: "13 Creators <noreply@connect.13creators.com>",
          to: [inv.email],
          subject,
          html,
          attachments: isCancelled
            ? []
            : [{ filename: "training-call-updated.ics", content: icsBase64 }],
        });
        if (!error) sentCount++;
        else console.error(`Error sending to ${inv.email}:`, error);
      } catch (e) {
        console.error(`Exception sending to ${inv.email}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, total: invitees.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-training-update error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
