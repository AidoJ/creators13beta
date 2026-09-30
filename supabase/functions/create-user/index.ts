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

    let callerIsAdmin = isServiceRole;

    if (!isServiceRole && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const { data: callerRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);
      const roleList = (callerRoles || []).map((r: { role: string }) => r.role);
      callerIsAdmin = roleList.includes("admin");
      const hasAccess = callerIsAdmin || roleList.includes("trainer");
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

    // Role rules (checked BEFORE creating the auth user so a rejection leaves no orphan):
    //  - ordinary roles (client, community_participant, gamer) for any trainer/admin;
    //  - trainee/practitioner NEVER here — only via set_practitioner_certification,
    //    so role, status, level and access land together;
    //  - trainer/admin only when the caller is an admin.
    const ORDINARY = ["client", "community_participant", "gamer"];
    const STAFF = ["trainer", "admin"];
    const requested: string[] = Array.isArray(roles) && roles.length ? roles.map(String) : ["client"];
    const json = { ...corsHeaders, "Content-Type": "application/json" };
    if (requested.some((r) => r === "trainee" || r === "practitioner")) {
      return new Response(JSON.stringify({ error: "Trainee and practitioner roles are set through certification, not account creation." }), { status: 400, headers: json });
    }
    if (requested.some((r) => STAFF.includes(r)) && !callerIsAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can create admin or trainer accounts." }), { status: 403, headers: json });
    }
    const unknown = requested.filter((r) => !ORDINARY.includes(r) && !STAFF.includes(r));
    if (unknown.length) {
      return new Response(JSON.stringify({ error: `Unknown role: ${unknown.join(", ")}` }), { status: 400, headers: json });
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

    const { error: roleErr } = await supabaseAdmin.from("user_roles")
      .upsert(requested.map((role) => ({ user_id: userId, role })), { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleErr) {
      return new Response(JSON.stringify({ error: `Account created but roles failed: ${roleErr.message}`, user_id: userId }), { status: 500, headers: json });
    }

    return new Response(JSON.stringify({ user_id: userId, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: corsHeaders });
  }
});
