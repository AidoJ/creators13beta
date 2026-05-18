import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WelcomeRequest {
  to: string;
  clientName: string;
  loginLink: string;
  photosLink: string;
  practitionerCode?: string;
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
    const { to, clientName, loginLink, photosLink, practitionerCode }: WelcomeRequest = await req.json();

    if (!to || !clientName || !loginLink || !photosLink) {
      throw new Error("Missing required fields: to, clientName, loginLink, photosLink");
    }

    // Fetch template from database
    const { data: template, error: tplError } = await supabase
      .from("email_templates")
      .select("subject, html_body")
      .eq("template_key", "case_study_welcome")
      .single();

    if (tplError || !template) {
      console.error("Template fetch error:", tplError);
      throw new Error("Email template 'case_study_welcome' not found");
    }

    // Replace placeholders
    const html = template.html_body
      .replace(/\{\{clientName\}\}/g, clientName)
      .replace(/\{\{email\}\}/g, to)
      .replace(/\{\{loginLink\}\}/g, loginLink)
      .replace(/\{\{photosLink\}\}/g, photosLink)
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

    console.log(`✓ Case study welcome email sent to ${to} (id: ${data?.id})`);

    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("send-case-study-welcome error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
