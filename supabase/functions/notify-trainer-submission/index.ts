import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const { practitioner_id, client_name, case_study_title } = await req.json();
    if (!practitioner_id || !client_name || !case_study_title) {
      throw new Error("practitioner_id, client_name, and case_study_title are required");
    }

    // Get practitioner name
    const { data: practProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", practitioner_id)
      .single();

    const practitionerName = [practProfile?.first_name, practProfile?.last_name]
      .filter(Boolean).join(" ") || practProfile?.email || "A practitioner";

    // Find trainer(s) — users with the 'trainer' role
    const { data: trainerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "trainer");

    if (!trainerRoles || trainerRoles.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No trainers found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load email template
    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "case_study_submitted")
      .single();

    const viewLink = "https://creators13.lovable.app/trainer";
    const results: { user_id: string; status: string; error?: string }[] = [];

    for (const trainer of trainerRoles) {
      try {
        const { data: trainerProfile } = await supabaseAdmin
          .from("profiles")
          .select("email, first_name")
          .eq("user_id", trainer.user_id)
          .single();

        if (!trainerProfile?.email) {
          results.push({ user_id: trainer.user_id, status: "skipped", error: "No email" });
          continue;
        }

        let subject = template?.subject || "{{practitionerName}} has submitted a case study for review";
        let htmlBody = template?.html_body || getDefaultHtml();

        const replacements: Record<string, string> = {
          practitionerName,
          clientName: client_name,
          caseStudyTitle: case_study_title,
          viewLink,
        };
        for (const [key, value] of Object.entries(replacements)) {
          const re = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          subject = subject.replace(re, value);
          htmlBody = htmlBody.replace(re, value);
        }

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "13 Creators <noreply@connect.13creators.com>",
            to: [trainerProfile.email],
            subject,
            html: htmlBody,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          results.push({ user_id: trainer.user_id, status: "error", error: err });
        } else {
          results.push({ user_id: trainer.user_id, status: "sent" });
        }

        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        results.push({ user_id: trainer.user_id, status: "error", error: (e as Error).message });
      }
    }

    console.log("notify-trainer-submission results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-trainer-submission error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getDefaultHtml(): string {
  const logoUrl = "https://iifgrxnkiejfvltzlvkd.supabase.co/storage/v1/object/public/email-assets/13creators-logo.png";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#FDF6F0;font-family:'Questrial',Arial,sans-serif;">
<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(90,58,40,0.08);">
<div style="padding:32px 24px;">
<h1 style="font-size:22px;color:#5A3A28;margin:0 0 16px 0;">Case Study Submitted for Review</h1>
<p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Hi A'Hara,</p>
<p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>{{practitionerName}}</strong> has submitted a case study assessment for review:</p>
<p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 4px 0;">📋 <strong>{{caseStudyTitle}}</strong></p>
<p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 24px 0;">👤 Client: <strong>{{clientName}}</strong></p>
<div style="text-align:center;margin:24px 0;">
<a href="{{viewLink}}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review Case Study →</a>
</div>
</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-top:2px solid #E8DDD4;">
  <tr><td style="padding:28px 24px;text-align:center;background:#FAF7F4;">
    <a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
      <img src="${logoUrl}" alt="13 Creators" width="48" height="48" style="display:inline-block;width:48px;height:auto;border:0;" />
    </a>
    <p style="margin:12px 0 0 0;font-size:13px;color:#5A3A28;font-family:'Questrial',Arial,sans-serif;">Create &amp; Come Alive with Creator Types</p>
    <p style="margin:10px 0 0 0;"><a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#BB1B56;text-decoration:none;font-weight:600;">www.13creators.com</a></p>
    <p style="margin:16px 0 0 0;font-size:11px;color:#8B6F5E;">© ${new Date().getFullYear()} 13 Creators · All rights reserved</p>
  </td></tr>
</table>
</div>
</body></html>`;
}
