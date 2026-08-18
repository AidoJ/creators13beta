import { requireUser, rateLimit, AuthError } from "../_shared/auth.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InviteEmailRequest {
  to: string;
  clientName: string;
  inviteLink: string;
  practitionerCode?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth + rate limit (security remediation Tier 2 #5).
    const __caller = await requireUser(req);
    if (!rateLimit(`email:${__caller.id}`, 20, 5 * 60 * 1000)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase config missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const resend = new Resend(apiKey);
    const { invitation_id, clientName, inviteLink, practitionerCode }: InviteEmailRequest = await req.json();

    if (!invitation_id || !clientName || !inviteLink) {
      throw new Error("Missing required fields: invitation_id, clientName, inviteLink");
    }

    // Ownership: the invitation must belong to the calling practitioner.
    const { data: invitation } = await supabase
      .from("client_invitations")
      .select("id, email")
      .eq("id", invitation_id)
      .eq("practitioner_id", __caller.id)
      .maybeSingle();
    if (!invitation?.email) {
      throw new AuthError("Forbidden: not your invitation", 403);
    }
    const to = invitation.email;

    // Fetch template from database
    const { data: template, error: tplError } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "case_study_invite")
      .single();

    if (tplError || !template) {
      console.error("Template fetch error:", tplError);
      throw new Error("Email template not found");
    }

    // Replace placeholders
    const html = template.html_body
      .replace(/\{\{clientName\}\}/g, clientName)
      .replace(/\{\{inviteLink\}\}/g, inviteLink)
      .replace(/\{\{practitionerCode\}\}/g, practitionerCode || "");

    const subject = template.subject
      .replace(/\{\{clientName\}\}/g, clientName);

    const { data, error } = await resend.emails.send({
      from: "13 Creators <noreply@connect.13creators.com>",
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    console.error("send-invite-email error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
