import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Check for service role or trainer auth
    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("apikey") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isServiceRole = apiKey === serviceKey;

    if (!isServiceRole && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const { data: hasAccess } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", caller.id)
        .in("role", ["trainer", "admin"])
        .limit(1)
        .maybeSingle();
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }
    } else if (!isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { email, password, first_name, last_name, roles } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password required" }), { status: 400, headers: corsHeaders });
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !newUser?.user) {
      return new Response(JSON.stringify({ error: createError?.message || "Failed to create user" }), { status: 400, headers: corsHeaders });
    }

    const userId = newUser.user.id;

    if (first_name || last_name) {
      await supabaseAdmin
        .from("profiles")
        .update({ first_name, last_name })
        .eq("user_id", userId);
    }

    if (roles && Array.isArray(roles)) {
      const roleInserts = roles.map((role: string) => ({ user_id: userId, role }));
      await supabaseAdmin.from("user_roles").insert(roleInserts);
    }

    return new Response(JSON.stringify({ user_id: userId, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: corsHeaders });
  }
});
