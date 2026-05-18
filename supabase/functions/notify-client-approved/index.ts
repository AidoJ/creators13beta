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

    const { client_user_id, primary_type, secondary_type } = await req.json();
    if (!client_user_id || !primary_type) {
      throw new Error("client_user_id and primary_type are required");
    }

    // Get client profile
    const { data: clientProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", client_user_id)
      .single();

    if (!clientProfile?.email) {
      return new Response(JSON.stringify({ skipped: true, reason: "No client email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientName = [clientProfile.first_name, clientProfile.last_name]
      .filter(Boolean).join(" ") || clientProfile.email.split("@")[0];

    // Load email template
    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "case_study_approved")
      .single();

    const loginLink = "https://creators13.lovable.app/auth";

    let subject = template?.subject || "Your Creator Types are ready, {{clientName}}!";
    let htmlBody = template?.html_body || getDefaultHtml();

    const creatorTypes = [primary_type, secondary_type].filter(Boolean).join(" & ");

    const replacements: Record<string, string> = {
      clientName,
      primaryType: primary_type,
      secondaryType: secondary_type || "",
      creatorTypes,
      loginLink,
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
        to: [clientProfile.email],
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✓ Case study approved email sent to ${clientProfile.email}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-client-approved error:", e);
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
<h1 style="font-size:22px;color:#5A3A28;margin:0 0 16px 0;">Your Creator Types Are Ready! 🎉</h1>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px 0;">Hi {{clientName}},</p>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 8px 0;">Great news — your profiling assessment has been completed and your Creator Types have been identified:</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#FAF7F4;border-radius:12px;border:1px solid #E8DDD4;">
<p style="font-size:24px;font-weight:700;color:#BB1B56;margin:0;">{{creatorTypes}}</p>
</div>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px 0;">Log in to your dashboard to explore your full Creator Type profiles, including your natural powers, creative strengths, and more.</p>
<div style="text-align:center;margin:24px 0;">
<a href="{{loginLink}}" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View My Creator Types →</a>
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
