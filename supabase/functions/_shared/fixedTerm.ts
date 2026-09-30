// Create / Co-Create: 13 instalments at the plan price, then the SAME
// subscription continues as Connect at the Connect product's price.
// Phase metadata is copied onto the subscription by Stripe when the phase
// starts, so from payment 14 the subscription reports itself as Connect
// (ledger, payment history, access switch all key off that metadata).
import Stripe from "https://esm.sh/stripe@18.5.0";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { expireEntitlementsByRef, grantEntitlement } from "./entitlements.ts";

export const CONTINUATION_LEVEL = "taster"; // Connect

type ConnectInfo = { productId: string; priceCents: number; currency: string; stripeProductId: string };

/** The Connect product row plus a Stripe product to bill it under (created once, found by metadata). */
export async function connectInfo(stripe: Stripe, sb: SupabaseClient): Promise<ConnectInfo> {
  const { data: p, error } = await sb.from("products")
    .select("id, name, price_cents, currency")
    .eq("grants_level_key", CONTINUATION_LEVEL).eq("billing_shape", "recurring").eq("active", true)
    .order("created_at").limit(1).maybeSingle();
  if (error || !p) throw new Error("Connect product not found");
  const found = await stripe.products.search({ query: `metadata['app_product_id']:'${p.id}'`, limit: 1 });
  const sp = found.data[0] ?? await stripe.products.create({ name: p.name, metadata: { app_product_id: p.id } });
  return { productId: p.id, priceCents: p.price_cents, currency: (p.currency || "aud").toLowerCase(), stripeProductId: sp.id };
}

function continuationPhase(c: ConnectInfo, userId: string) {
  return {
    items: [{
      price_data: { currency: c.currency, product: c.stripeProductId, unit_amount: c.priceCents, recurring: { interval: "month" as const } },
      quantity: 1,
    }],
    // One cycle, then the schedule releases and the subscription keeps billing Connect until cancelled.
    iterations: 1,
    metadata: { user_id: userId, level_key: CONTINUATION_LEVEL, product_id: c.productId, billing_shape: "recurring", term_months: "", continued_from_fixed_term: "true" },
  };
}

/** New purchase: turn the subscription into [term instalments] -> [Connect ongoing]. */
export async function attachFixedTermSchedule(stripe: Stripe, sb: SupabaseClient, o: {
  subscriptionId: string; userId: string; levelKey: string; productId: string; instalments: number;
}) {
  const c = await connectInfo(stripe, sb);
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: o.subscriptionId });
  const phase = schedule.phases[0];
  const meta = { user_id: o.userId, level_key: o.levelKey, product_id: o.productId };
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: phase.items.map((i: any) => ({ price: i.price as string, quantity: i.quantity ?? 1 })),
        start_date: phase.start_date,
        iterations: o.instalments, // counts the already-paid checkout period (verified with a test clock)
        metadata: meta,
      },
      continuationPhase(c, o.userId),
    ],
    metadata: meta,
  });
  return schedule.id;
}

/** Existing course subscription: keep its current instalment phase, append the Connect phase. */
export async function extendExistingSchedule(stripe: Stripe, sb: SupabaseClient, subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.metadata?.level_key === CONTINUATION_LEVEL) return "already_connect";
  const schedId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (!schedId) return "no_schedule";
  const sched = await stripe.subscriptionSchedules.retrieve(schedId);
  if (sched.end_behavior === "release" && sched.phases.length >= 2) return "already_extended";
  const userId = sub.metadata?.user_id || sched.metadata?.user_id || "";
  const c = await connectInfo(stripe, sb);
  const last = sched.phases[sched.phases.length - 1];
  await stripe.subscriptionSchedules.update(schedId, {
    end_behavior: "release",
    phases: [
      ...sched.phases.map((p: any) => ({
        items: p.items.map((i: any) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
        start_date: p.start_date,
        end_date: p.end_date,
        metadata: p.metadata ?? {},
      })),
      { ...continuationPhase(c, userId), start_date: last.end_date },
    ].map((p: any, i: number, arr: any[]) => (i === arr.length - 1 ? (({ start_date, ...rest }) => rest)(p) : p)),
  });
  return "extended";
}

/**
 * Called on subscription updates. Once Stripe has moved the subscription onto
 * the Connect phase, swap Create/Co-Create access for Connect.
 */
export async function switchAccessIfContinued(sb: SupabaseClient, sub: any, log: (m: string, d?: unknown) => void) {
  if (sub.metadata?.continued_from_fixed_term !== "true" || sub.metadata?.level_key !== CONTINUATION_LEVEL) return;
  if (!["active", "trialing", "past_due"].includes(sub.status)) return;
  const userId = sub.metadata.user_id;
  if (!userId) return;
  const { data: old } = await sb.from("entitlements").select("id, level_key")
    .eq("stripe_ref", sub.id).eq("status", "active").neq("level_key", CONTINUATION_LEVEL);
  if (!old?.length) return;
  await expireEntitlementsByRef(sb, sub.id);
  const r = await grantEntitlement(sb, { userId, levelKey: CONTINUATION_LEVEL, source: "stripe", stripeRef: sub.id, endsAt: null });
  log("Fixed term finished — moved to Connect", { userId, from: old.map((o) => o.level_key), result: r });
}
