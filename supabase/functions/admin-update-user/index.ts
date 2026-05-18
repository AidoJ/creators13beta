import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    // Verify caller is a trainer
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData.user) throw new Error("Not authenticated");

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .in("role", ["trainer", "admin"])
      .limit(1)
      .maybeSingle();
    if (!roleCheck) throw new Error("Unauthorized: trainer or admin role required");

    const { target_user_id, new_password, updates } = await req.json();
    if (!target_user_id) throw new Error("target_user_id is required");

    const result: Record<string, any> = {};

    // Build auth update payload (password and/or email)
    const authUpdate: Record<string, any> = {};
    if (new_password) authUpdate.password = new_password;
    if (updates?.email) authUpdate.email = updates.email;

    // Apply auth-level changes (password, email) and auto-confirm
    if (Object.keys(authUpdate).length > 0) {
      authUpdate.email_confirm = true;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, authUpdate);
      if (error) throw new Error(`Auth update failed: ${error.message}`);
      if (new_password) result.password_updated = true;
      if (updates?.email) result.email_updated = true;
    }

    // Profile updates
    if (updates && typeof updates === "object") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("user_id", target_user_id);
      if (error) throw new Error(`Profile update failed: ${error.message}`);
      result.profile_updated = true;
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
