/**
 * Emails an accepted practitioner-training applicant a private payment link
 * for the product an admin/trainer picked. The link only works for the
 * applicant's own account/email (enforced in create-checkout).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const caller = await requireRole(req, ["admin", "trainer"]);
    const admin = caller.admin;
    const body = await req.json().catch(() => ({}));
    const applicationId = String(body.application_id ?? "");
    const productId = String(body.product_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(productId)) {
      return json({ error: "invalid_request", message: "Application and product are required." }, 400);
    }

    const { data: app } = await admin.from("practitioner_applications")
      .select("id, name, email, level").eq("id", applicationId).maybeSingle();
    if (!app) return json({ error: "not_found", message: "Application not found." }, 404);
    const { data: product } = await admin.from("products")
      .select("id, name, price_cents, term_months, active").eq("id", productId).maybeSingle();
    if (!product?.active) return json({ error: "invalid_product", message: "Choose an active product." }, 400);

    const { error: upErr } = await admin.from("practitioner_applications").update({
      status: "accepted",
      payment_product_id: product.id,
      payment_link_sent_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: caller.isService ? null : caller.id,
    }).eq("id", app.id);
    if (upErr) throw new Error(upErr.message);

    const link = `https://creators13beta.lovable.app/pay/training/${app.id}`;
    const price = product.price_cents ? `A$${(product.price_cents / 100).toFixed(2)}` : "";
    const terms = product.term_months ? ` a month for ${product.term_months} months` : "";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const html = `
      <div style="font-family:Questrial,Arial,sans-serif;color:#2E1E33;line-height:1.55;max-width:520px">
        <h2 style="font-family:'Lilita One',Arial,sans-serif;color:#B21E4B;margin:0 0 12px">Welcome to practitioner training</h2>
        <p>Hi ${esc(app.name)},</p>
        <p>Your application has been accepted. You can now pay for <strong>${esc(product.name)}</strong>${price ? ` (${price}${terms})` : ""}.</p>
        <p>Sign in (or create your account) with <strong>${esc(app.email)}</strong> — the link only works for that email.</p>
        <p><a href="${link}" style="display:inline-block;background:#B21E4B;color:#fff;padding:12px 22px;border-radius:99px;text-decoration:none">Pay and enrol</a></p>
        <p style="font-size:12px;color:#8B6F5E">Or copy this link: ${link}</p>
      </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "13 Creators <noreply@connect.13creators.com>",
        to: [app.email],
        subject: `Your practitioner training payment link — ${product.name}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[TRAINING-LINK] resend", await res.text());
      return json({ error: "email_failed", message: "Saved, but the email couldn't be sent.", link }, 502);
    }
    return json({ ok: true, link });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error("[TRAINING-LINK]", (e as Error).message);
    return json({ error: "server_error", message: (e as Error).message }, 500);
  }
});
