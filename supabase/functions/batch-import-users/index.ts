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

    const { users, practitioner_id } = await req.json() as {
      users: {
        email: string;
        first_name: string;
        last_name: string;
        phone?: string;
        shoe_size?: string;
        height_cm?: number;
        date_of_birth?: string;
        gender?: string;
        case_study_consent_at?: string;
      }[];
      practitioner_id: string;
    };

    const results: any[] = [];

    for (const u of users) {
      try {
        // Create auth user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: "Test100!",
          email_confirm: true,
        });

        if (createError || !newUser?.user) {
          results.push({ email: u.email, status: "error", error: createError?.message || "Failed" });
          continue;
        }

        const userId = newUser.user.id;

        // Update profile
        await supabaseAdmin.from("profiles").update({
          first_name: u.first_name,
          last_name: u.last_name,
          phone: u.phone || null,
          shoe_size: u.shoe_size || null,
          height_cm: u.height_cm || null,
          date_of_birth: u.date_of_birth || null,
          gender: u.gender || null,
          case_study_consent_at: u.case_study_consent_at || new Date().toISOString(),
          enrollment_step: "complete",
        }).eq("user_id", userId);

        // Add client role
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "client" });

        // Assign to practitioner
        await supabaseAdmin.from("client_practitioner").insert({
          client_id: userId,
          practitioner_id,
          active: true,
        });

        results.push({ email: u.email, user_id: userId, status: "ok" });
        console.log(`✓ Created ${u.first_name} ${u.last_name} (${u.email})`);
      } catch (e) {
        results.push({ email: u.email, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
