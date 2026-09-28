import Stripe from "https://esm.sh/stripe@18.5.0";
import { requireUser, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type HistoryItem = {
  id: string;
  kind: "payment" | "refund" | "cancellation" | "cancellation_scheduled";
  date: number; // unix seconds
  description: string;
  amount: number | null; // minor units
  currency: string | null;
  status: string;
  receipt_number: string | null;
  card: string | null;
  period_end: number | null;
};

// The test Stripe account is shared with a massage business. Its charges always
// carry booking/gift-card metadata or booking wording; Creators 13 charges never do.
const OTHER_META = ["service_name", "therapist_fee", "booking_id", "booking_time", "gift_card_code", "orderId", "occurrence_number"];
const OTHER_DESC = /massage|booking authori[sz]ation|occurrence authori[sz]ation|gift card|sound healing/i;
function isOtherBusiness(ch: any): boolean {
  const md = ch.metadata ?? {};
  return OTHER_META.some((k) => k in md) || OTHER_DESC.test(ch.description ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (user.isService || !user.email) return json({ error: "No email on account" }, 400);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 10 });
    const items: HistoryItem[] = [];
    const productNames = new Map<string, string>();

    for (const c of customers.data) {
      const charges = await stripe.charges.list({ customer: c.id, limit: 100, expand: ["data.invoice"] as any });
      for (const ch of charges.data) {
        if (ch.status !== "succeeded" || !ch.captured) continue;
        if (isOtherBusiness(ch)) continue;
        const inv: any = (ch as any).invoice;
        const line = inv && typeof inv === "object" ? inv.lines?.data?.[0]?.description : null;
        const desc = line || ch.description || (ch.metadata as any)?.product_name || "Creators 13 purchase";
        items.push({
          id: ch.id,
          kind: "payment",
          date: ch.created,
          description: desc,
          amount: ch.amount,
          currency: ch.currency,
          status: ch.refunded ? "Refunded" : ch.amount_refunded > 0 ? "Partly refunded" : "Paid",
          receipt_number: ch.receipt_number ?? (inv && typeof inv === "object" ? inv.number : null) ?? ch.id.slice(-10).toUpperCase(),
          card: ch.payment_method_details?.card
            ? `${ch.payment_method_details.card.brand?.toUpperCase()} •••• ${ch.payment_method_details.card.last4}`
            : null,
          period_end: null,
        });
        for (const r of ch.refunds?.data ?? []) {
          items.push({
            id: r.id, kind: "refund", date: r.created, description: `Refund — ${desc}`,
            amount: r.amount, currency: r.currency, status: r.status === "succeeded" ? "Refunded" : r.status ?? "",
            receipt_number: r.id.slice(-10).toUpperCase(), card: null, period_end: null,
          });
        }
      }

      // Stripe allows at most 4 expansion levels, so look product names up separately.
      const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 100 });
      for (const s of subs.data) {
        const prodRef: any = s.items.data[0]?.price?.product;
        let name = "Subscription";
        if (typeof prodRef === "string") {
          if (!productNames.has(prodRef)) {
            try { productNames.set(prodRef, (await stripe.products.retrieve(prodRef)).name); } catch { productNames.set(prodRef, "Subscription"); }
          }
          name = productNames.get(prodRef)!;
        } else if (prodRef?.name) name = prodRef.name;
        const periodEnd = (s.items.data[0] as any)?.current_period_end ?? (s as any).current_period_end ?? null;
        if (s.status === "canceled" && s.canceled_at) {
          items.push({
            id: `${s.id}-cancel`, kind: "cancellation", date: s.canceled_at, description: `${name} cancelled`,
            amount: null, currency: null, status: "Cancelled", receipt_number: null, card: null,
            period_end: s.ended_at ?? null,
          });
        } else if (s.cancel_at_period_end || s.cancel_at) {
          items.push({
            id: `${s.id}-sched`, kind: "cancellation_scheduled", date: s.canceled_at ?? s.created,
            description: `${name} set to cancel`, amount: null, currency: null, status: "Ends soon",
            receipt_number: null, card: null, period_end: s.cancel_at ?? periodEnd,
          });
        }
      }
    }

    items.sort((a, b) => b.date - a.date);
    return json({ items, email: user.email, name: customers.data[0]?.name ?? null });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error("payment-history", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
