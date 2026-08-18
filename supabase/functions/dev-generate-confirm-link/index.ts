// TEMPORARY test helper — generates an email confirmation link. Delete after use.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { email, redirectTo } = await req.json();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: Deno.env.get("DEV_TEST_PASSWORD") ?? "TestPassw0rd!2026",
    options: { redirectTo },
  });
  return new Response(JSON.stringify({ link: data?.properties?.action_link ?? null, error: error?.message ?? null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
