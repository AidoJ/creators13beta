import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TrainingInviteRequest {
  callId?: string;
  title: string;
  description?: string;
  scheduledAt: string;
  durationMinutes: number;
  zoomLink?: string;
  recurrenceRule?: string;
  practitionerUserIds?: string[];
  externalEmails?: string[];
}

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
  zoomLink?: string
): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//13Creators//Training//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}${zoomLink ? "\\n\\nZoom: " + zoomLink : ""}`,
    zoomLink ? `URL:${zoomLink}` : "",
    `UID:${crypto.randomUUID()}@13creators.com`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

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

  // Google Calendar
  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${startStr}/${endStr}`,
    details,
  });
  if (zoomLink) gcalParams.set("location", zoomLink);
  const gcalUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;

  // Outlook Web
  const outlookParams = new URLSearchParams({
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: details,
  });
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

function replaceTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
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

    const body: TrainingInviteRequest = await req.json();
    const {
      callId,
      title,
      description,
      scheduledAt,
      durationMinutes,
      zoomLink,
      recurrenceRule,
      practitionerUserIds,
      externalEmails,
    } = body;

    if (!title || !scheduledAt) {
      throw new Error("Missing required fields: title, scheduledAt");
    }

    // Fetch email template from database
    const { data: template, error: tplError } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "training_call_invite")
      .single();

    if (tplError || !template) {
      console.error("Template fetch error:", tplError);
      throw new Error("Training call email template not found. Please create it in Admin → Emails.");
    }

    const icsContent = generateICS(title, description || "", scheduledAt, durationMinutes, zoomLink);
    const icsBytes = new TextEncoder().encode(icsContent);
    let icsBase64 = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < icsBytes.length; i += CHUNK) {
      icsBase64 += String.fromCharCode(...icsBytes.subarray(i, i + CHUNK));
    }
    icsBase64 = btoa(icsBase64);

    // Build reusable template fragments
    const descriptionHtml = description
      ? `<p style="color:#666;font-size:14px;margin:0 0 8px 0;">${description}</p>`
      : "";

    const recurrenceText =
      recurrenceRule && recurrenceRule !== "none"
        ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">🔁 This is a <strong>${recurrenceRule}</strong> recurring call.</p>`
        : "";

    const zoomButton = zoomLink
      ? `<div style="text-align:center;margin:24px 0 0 0;"><a href="${zoomLink}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Join Zoom Meeting →</a></div>`
      : "";

    let sentCount = 0;
    const errors: string[] = [];
    const successfulInviteeRecords: Array<{ call_id: string; user_id: string | null; email: string; name: string | null }> = [];

    type Recipient = {
      email: string;
      firstName: string;
      timezone: string;
      userId: string | null;
    };

    const recipientsByEmail = new Map<string, Recipient>();

    function addRecipient(recipient: Recipient) {
      const normalized = normalizeEmail(recipient.email);
      if (!EMAIL_REGEX.test(normalized)) return;
      if (!recipientsByEmail.has(normalized)) {
        recipientsByEmail.set(normalized, { ...recipient, email: normalized });
      }
    }

    // --- Build recipient list from practitioners ---
    if (practitionerUserIds && practitionerUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, first_name, timezone")
        .in("user_id", practitionerUserIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      for (const practitionerUserId of practitionerUserIds) {
        const profile = profileMap.get(practitionerUserId);
        if (!profile) {
          errors.push(`missing_profile:${practitionerUserId}`);
          continue;
        }

        let email = profile.email ? normalizeEmail(profile.email) : "";

        // Fallback to auth email if profile.email is missing
        if (!email) {
          try {
            const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(practitionerUserId);
            if (!authErr && authData?.user?.email) {
              email = normalizeEmail(authData.user.email);
            }
          } catch (authLookupErr) {
            console.error("Auth email lookup failed:", authLookupErr);
          }
        }

        if (!email || !EMAIL_REGEX.test(email)) {
          errors.push(`missing_email:${profile.first_name || practitionerUserId}`);
          continue;
        }

        addRecipient({
          email,
          firstName: profile.first_name || "Practitioner",
          timezone: profile.timezone || "Australia/Sydney",
          userId: profile.user_id,
        });
      }
    }

    // --- Build recipient list from external guest emails ---
    if (externalEmails && externalEmails.length > 0) {
      for (const guestEmail of externalEmails) {
        const normalized = normalizeEmail(guestEmail || "");
        if (!EMAIL_REGEX.test(normalized)) {
          errors.push(`invalid_email:${guestEmail}`);
          continue;
        }
        addRecipient({
          email: normalized,
          firstName: "there",
          timezone: "UTC",
          userId: null,
        });
      }
    }

    const recipients = Array.from(recipientsByEmail.values());

    if (recipients.length === 0) {
      throw new Error("No valid recipients found for this call.");
    }

    // --- Send emails (with rate-limit delay: Resend allows max 2 req/sec) ---
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < recipients.length; i++) {
      if (i > 0) await delay(600);
      const recipient = recipients[i];
      const localTime = formatDateForTimezone(scheduledAt, recipient.timezone);

      const calendarButtons = buildCalendarButtons(title, scheduledAt, durationMinutes, description, zoomLink);

      const vars: Record<string, string> = {
        firstName: recipient.firstName,
        title,
        description: descriptionHtml,
        localTime,
        durationMinutes: String(durationMinutes),
        timezone: recipient.timezone,
        recurrenceText,
        zoomButton,
        calendarButtons,
        email: recipient.email,
      };

      const html = replaceTemplateVars(template.html_body, vars);
      const subject = replaceTemplateVars(template.subject, vars);

      try {
        const { error } = await resend.emails.send({
          from: "13 Creators <noreply@connect.13creators.com>",
          to: [recipient.email],
          subject,
          html,
          attachments: [
            { filename: "training-call.ics", content: icsBase64 },
          ],
        });
        if (error) {
          console.error(`Error sending to ${recipient.email}:`, error);
          errors.push(`${recipient.email}${error.message ? ` (${error.message})` : ""}`);
        } else {
          sentCount++;
          if (callId) {
            successfulInviteeRecords.push({
              call_id: callId,
              user_id: recipient.userId,
              email: recipient.email,
              name: recipient.firstName !== "there" ? recipient.firstName : null,
            });
          }
        }
      } catch (e) {
        console.error(`Exception sending to ${recipient.email}:`, e);
        errors.push(`${recipient.email} (exception)`);
      }
    }

    // --- Record successful invitees in DB (without duplicating existing rows) ---
    if (callId && successfulInviteeRecords.length > 0) {
      const { data: existingInvitees } = await supabase
        .from("training_call_invitees")
        .select("email")
        .eq("call_id", callId);

      const existingEmails = new Set((existingInvitees || []).map((i: any) => normalizeEmail(i.email || "")));
      const recordsToInsert = successfulInviteeRecords.filter((record) => !existingEmails.has(normalizeEmail(record.email)));

      if (recordsToInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from("training_call_invitees")
          .insert(recordsToInsert);
        if (insertErr) console.error("Error recording invitees:", insertErr);
      }
    }

    // Record timeline event
    if (callId) {
      const details = errors.length > 0
        ? `Invites sent to ${sentCount} of ${recipients.length} recipients | Failed: ${errors.slice(0, 5).join(", ")}`
        : `Invites sent to ${sentCount} recipient${sentCount !== 1 ? "s" : ""}`;

      await supabase.from("training_call_events").insert({
        call_id: callId,
        event_type: "invites_sent",
        details,
      });
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, totalRecipients: recipients.length, failed: errors.length, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-training-invite error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
