// Consume a recovery resume token.
//
// Contract: POST { token } → returns { route, session?, expired? }
//   - Validates the token by sha256 hash against profiles.
//   - Enforces 30-day expiry.
//   - Logs 'clicked' + 'resumed' events (episode-keyed).
//   - Clears the hash (single-use).
//   - Generates a magic-link session for the user via admin API so they land
//     signed-in on their next step.
//
// Click does NOT bump last_enrollment_activity_at — cap-reset keys on real
// step writes only, so a bare click can't loop the two-email cap.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Minimal server mirror of the step resolver's route mapping.
function routeForStep(key: string, tier: string | null, billing: string | null): string {
  const qs = (() => {
    const p = new URLSearchParams();
    if (tier) p.set("tier", tier);
    if (billing) p.set("billing", billing);
    const s = p.toString();
    return s ? `?${s}` : "";
  })();
  switch (key) {
    case "paygate": return `/enroll/payment${qs}`;
    case "practitioner": return `/enroll/practitioner${qs}`;
    case "details": return `/enroll/details${qs}`;
    case "consent": return `/enroll/consent${qs}`;
    case "photos": return `/enroll/photos${qs}`;
    case "booking": return `/enroll/booking${qs}`;
    default: return "/dashboard";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRole);

    const body = await req.json().catch(() => ({}));
    const token: string = (body?.token || "").trim();
    if (!token || token.length < 20) {
      return new Response(JSON.stringify({ expired: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hash = await sha256hex(token);

    const { data: prof } = await admin
      .from("profiles")
      .select("user_id, email, enrollment_recovery_resume_token_expires_at")
      .eq("enrollment_recovery_resume_token_hash", hash)
      .maybeSingle();

    if (!prof) {
      return new Response(JSON.stringify({ expired: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired = prof.enrollment_recovery_resume_token_expires_at &&
      new Date(prof.enrollment_recovery_resume_token_expires_at).getTime() < Date.now();
    if (expired) {
      return new Response(JSON.stringify({ expired: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the user's open episode + sub for route computation.
    const [{ data: episode }, { data: sub }] = await Promise.all([
      admin.from("enrollment_recovery_episodes").select("*")
        .eq("user_id", prof.user_id).is("closed_at", null).maybeSingle(),
      admin.from("subscriptions").select("tier, billing_period").eq("user_id", prof.user_id).maybeSingle(),
    ]);

    // Log click (always) and resumed if we have an open episode
    if (episode) {
      await admin.from("enrollment_recovery_episodes")
        .update({ clicked_at: episode.clicked_at || new Date().toISOString(),
                  resumed_at: new Date().toISOString() })
        .eq("id", episode.id);
      await admin.from("enrollment_recovery_events").insert([
        { episode_id: episode.id, user_id: prof.user_id, event: "clicked", step_key: episode.step_key },
        { episode_id: episode.id, user_id: prof.user_id, event: "resumed", step_key: episode.step_key },
      ]);
    }

    // Invalidate the token (single-use)
    await admin.from("profiles").update({
      enrollment_recovery_resume_token_hash: null,
      enrollment_recovery_resume_token_expires_at: null,
    }).eq("user_id", prof.user_id);

    // Mint a session so the user lands signed-in.
    let session: { access_token: string; refresh_token: string } | null = null;
    try {
      const { data: linkData } = await (admin.auth.admin as any).generateLink({
        type: "magiclink",
        email: prof.email,
      });
      // Some SDK versions return properties.hashed_token; we exchange via verifyOtp.
      const emailOtp = linkData?.properties?.email_otp || linkData?.email_otp;
      const hashed = linkData?.properties?.hashed_token || linkData?.hashed_token;
      if (hashed && prof.email) {
        const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "");
        const { data: verified } = await anon.auth.verifyOtp({
          token_hash: hashed,
          type: "magiclink",
        });
        if (verified?.session) {
          session = {
            access_token: verified.session.access_token,
            refresh_token: verified.session.refresh_token,
          };
        }
      } else if (emailOtp && prof.email) {
        const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "");
        const { data: verified } = await anon.auth.verifyOtp({
          email: prof.email, token: emailOtp, type: "magiclink",
        });
        if (verified?.session) {
          session = {
            access_token: verified.session.access_token,
            refresh_token: verified.session.refresh_token,
          };
        }
      }
    } catch (e) {
      console.warn("magic-link mint failed; user will need to sign in", e);
    }

    const route = routeForStep(
      episode?.step_key || "",
      (sub as any)?.tier ?? null,
      (sub as any)?.billing_period ?? null,
    );

    return new Response(JSON.stringify({ route, session }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("resume error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
