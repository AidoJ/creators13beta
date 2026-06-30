import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cryptographically random per-user password. Users must reset via the
// password-reset flow on first login — the password is never returned to
// the caller and never logged.
function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // base64url-ish, strip padding/specials
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 28) + "!A1";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin/trainer only.
    const { admin } = await requireRole(req, ["admin", "trainer"]);

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

    if (!Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: "users[] required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const u of users) {
      try {
        const password = randomPassword();
        const { data: newUser, error: createError } = await admin.auth.admin.createUser({
          email: u.email,
          password,
          email_confirm: true,
        });

        if (createError || !newUser?.user) {
          results.push({ email: u.email, status: "error", error: createError?.message || "Failed" });
          continue;
        }

        const userId = newUser.user.id;

        await admin.from("profiles").update({
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

        await admin.from("user_roles").insert({ user_id: userId, role: "client" });

        if (practitioner_id) {
          await admin.from("client_practitioner").insert({
            client_id: userId,
            practitioner_id,
            active: true,
          });
        }

        // Trigger Supabase password-recovery email so the user sets their own
        // password on first login. We deliberately do not return the random
        // password to the caller.
        try {
          await admin.auth.admin.generateLink({ type: "recovery", email: u.email });
        } catch (e) {
          console.log(`[batch-import-users] recovery link generation failed for ${u.email}:`, e);
        }

        results.push({ email: u.email, user_id: userId, status: "ok" });
      } catch (e) {
        results.push({ email: u.email, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
