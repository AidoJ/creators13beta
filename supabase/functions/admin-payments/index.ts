// Admin-only Payments tools: one-off Stripe import, fee fill-in, webhook event
// check. Import is idempotent (dedupe keys) and resumable (phase + cursor).
// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { requireRole, authErrorResponse } from "../_shared/auth.ts";
import { extendExistingSchedule } from "../_shared/fixedTerm.ts";
import { recordCharge, fillFee, recordFailedInvoice, syncSubscription } from "../_shared/paymentsLedger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LEDGER_EVENTS = [
  "checkout.session.completed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
  "charge.succeeded", "charge.refunded", "charge.updated",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "subscription_schedule.completed", "subscription_schedule.canceled", "subscription_schedule.aborted",
];
const PHASES = ["charges", "subscriptions", "failed_invoices"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireRole(req, ["admin"]);
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return json({ error: "Stripe is not configured" }, 500);
    const stripe: any = new Stripe(key, { apiVersion: "2025-08-27.basil" });
    const livemode = key.startsWith("sk_live") || key.startsWith("rk_live");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "mode") return json({ livemode });

    if (action === "import") {
      const started = Date.now();
      let phase: string = PHASES.includes(body.phase) ? body.phase : "charges";
      let cursor: string | undefined = body.cursor || undefined;
      let processed = 0;
      while (Date.now() - started < 45_000) {
        let page: any;
        if (phase === "charges") {
          page = await stripe.charges.list({ limit: 15, starting_after: cursor, expand: ["data.refunds", "data.balance_transaction"] });
          for (const ch of page.data) { if (ch.status === "succeeded") { await recordCharge(sb, stripe, ch, { source: "import" }); processed++; } }
        } else if (phase === "subscriptions") {
          page = await stripe.subscriptions.list({ limit: 50, status: "all", starting_after: cursor });
          for (const s of page.data) { await syncSubscription(sb, s, { source: "import" }); processed++; }
        } else {
          page = await stripe.invoices.list({ limit: 15, starting_after: cursor });
          for (const inv of page.data) {
            if ((inv.status === "open" || inv.status === "uncollectible") && (inv.attempt_count ?? 0) > 0) {
              await recordFailedInvoice(sb, inv); processed++;
            }
          }
        }
        if (page.has_more && page.data.length) { cursor = page.data[page.data.length - 1].id; continue; }
        const next = PHASES.indexOf(phase as any) + 1;
        if (next >= PHASES.length) return json({ done: true, livemode, processed });
        phase = PHASES[next]; cursor = undefined;
      }
      return json({ done: false, phase, cursor, processed, livemode });
    }

    if (action === "fill_fees") {
      const { data } = await sb.from("payments").select("stripe_charge_id")
        .eq("event_type", "payment").is("fee_cents", null).not("stripe_charge_id", "is", null).limit(100);
      let filled = 0;
      for (const r of data ?? []) {
        const ch = await stripe.charges.retrieve((r as any).stripe_charge_id, { expand: ["balance_transaction"] });
        if (await fillFee(sb, stripe, ch)) filled++;
      }
      return json({ checked: data?.length ?? 0, filled });
    }

    if (action === "ensure_webhook") {
      const eps = await stripe.webhookEndpoints.list({ limit: 100 });
      const ep = eps.data.find((e: any) => String(e.url).includes("/functions/v1/stripe-webhook"));
      if (!ep) return json({ error: "No Stripe webhook endpoint pointing at the app was found" }, 404);
      const current: string[] = ep.enabled_events;
      if (current.includes("*")) return json({ ok: true, added: [], all: true });
      const missing = LEDGER_EVENTS.filter((e) => !current.includes(e));
      if (missing.length) await stripe.webhookEndpoints.update(ep.id, { enabled_events: [...current, ...missing] });
      return json({ ok: true, added: missing });
    }

    // Test-mode-only helpers used to exercise refunds and cancellations.
    if (action === "test_refund" || action === "test_cancel") {
      if (livemode) return json({ error: "Only available in test mode" }, 403);
      if (action === "test_refund") {
        const r = await stripe.refunds.create({ charge: body.charge_id, ...(body.amount ? { amount: body.amount } : {}) });
        return json({ refund: r.id, status: r.status });
      }
      const s = body.at_period_end
        ? await stripe.subscriptions.update(body.subscription_id, { cancel_at_period_end: true })
        : await stripe.subscriptions.cancel(body.subscription_id);
      return json({ subscription: s.id, status: s.status, cancel_at_period_end: s.cancel_at_period_end });
    }

    // One-off: existing Create / Co-Create subscriptions get the Connect
    // continuation phase appended. Idempotent; untouched before payment 13.
    if (action === "extend_fixed_term") {
      const { data: rows } = await sb.from("payment_subscriptions").select("stripe_subscription_id")
        .eq("billing_shape", "fixed_term").eq("livemode", livemode).in("status", ["active", "trialing", "past_due"]);
      const results: Record<string, string> = {};
      for (const r of rows ?? []) {
        try { results[r.stripe_subscription_id] = await extendExistingSchedule(stripe, sb, r.stripe_subscription_id); }
        catch (e) { results[r.stripe_subscription_id] = `error: ${String(e)}`; }
      }
      return json({ results });
    }

    if (action === "inspect_schedule") {
      const sub = await stripe.subscriptions.retrieve(body.subscription_id);
      const sid = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
      if (!sid) return json({ schedule: null });
      const sc = await stripe.subscriptionSchedules.retrieve(sid);
      return json({ end_behavior: sc.end_behavior, phases: sc.phases.map((p: any) => ({
        start: new Date(p.start_date * 1000).toISOString().slice(0, 10), end: new Date(p.end_date * 1000).toISOString().slice(0, 10),
        amount: p.items?.[0]?.price, level: p.metadata?.level_key })) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const r = authErrorResponse(e, corsHeaders);
    if (r.status !== 500 || !(e instanceof Error) || e.name === "AuthError") return r;
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
