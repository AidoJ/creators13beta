/**
 * Practitioner training application — public form on the front page.
 *
 * Training levels are gated behind a human review, so this never touches
 * checkout. It records the application and emails the trainers.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`prac-app:${ip}`, 5, 10 * 60 * 1000)) {
      return json({ error: "rate_limited", message: "Too many applications. Please try again later." }, 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request", message: "A valid application is required." }, 400);
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const message = String(body.message ?? "").trim();
    const level = Number(body.level);

    const errors: string[] = [];
    if (name.length < 2 || name.length > 120) errors.push("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.push("email");
    if (![1, 2, 3].includes(level)) errors.push("level");
    if (message.length > 2000) errors.push("message");
    if (phone.length > 40) errors.push("phone");
    if (errors.length) {
      return json({ error: "invalid_request", fields: errors, message: "Please check the highlighted fields." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Attach the account if the applicant happens to be signed in.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data.user?.id ?? null;
    }

    const { data: row, error: insErr } = await admin
      .from("practitioner_applications")
      .insert({ user_id: userId, name, email, phone: phone || null, level, message: message || null })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Notify the trainers. A failure here must not lose the application.
    const results: string[] = [];
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "trainer");
        for (const r of roles ?? []) {
          const { data: prof } = await admin
            .from("profiles").select("email, first_name").eq("user_id", r.user_id).maybeSingle();
          if (!prof?.email) continue;
          const html = `
            <div style="font-family:Questrial,Arial,sans-serif;color:#2E1E33;line-height:1.55">
              <h2 style="font-family:'Lilita One',Arial,sans-serif;color:#B21E4B;margin:0 0 12px">
                New Practitioner Level ${level} application
              </h2>
              <p><strong>${esc(name)}</strong> has applied to train at Level ${level}.</p>
              <p>
                Email: ${esc(email)}<br>
                ${phone ? `Phone: ${esc(phone)}<br>` : ""}
              </p>
              ${message ? `<p style="background:#F7EFF8;padding:12px;border-radius:10px">${esc(message)}</p>` : ""}
              <p><a href="https://creators13.lovable.app/admin?tab=applications"
                    style="background:#B21E4B;color:#fff;padding:10px 18px;border-radius:99px;text-decoration:none">
                Review applications</a></p>
            </div>`;
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "13 Creators <noreply@connect.13creators.com>",
              to: [prof.email],
              subject: `New Practitioner Level ${level} application — ${name}`,
              html,
            }),
          });
          results.push(res.ok ? "sent" : "error");
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    } catch (e) {
      console.error("[PRAC-APPLICATION] notify failed", (e as Error).message);
    }

    return json({ ok: true, id: row.id, notified: results });
  } catch (e) {
    console.error("[PRAC-APPLICATION]", (e as Error).message);
    return json({ error: "server_error", message: "Could not send your application. Please try again." }, 500);
  }
});
