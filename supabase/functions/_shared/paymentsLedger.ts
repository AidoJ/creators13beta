// Payment reporting ledger — shared by stripe-webhook and admin-payments.
// Every writer uses a deterministic dedupe_key so the webhook and the one-off
// import can never double-record the same Stripe object.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

type Row = Record<string, unknown>;

async function memberFor(sb: SupabaseClient, userId: string | null, customerId: string | null, email: string | null) {
  let uid = userId;
  if (!uid && customerId) {
    const { data } = await sb.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    uid = (data as any)?.user_id ?? null;
  }
  if (!uid && email) {
    const { data } = await sb.from("profiles").select("user_id").ilike("email", email).maybeSingle();
    uid = (data as any)?.user_id ?? null;
  }
  if (!uid) return { user_id: null, member_email: email, member_name: null };
  const { data: p } = await sb.from("profiles").select("email, first_name, last_name").eq("user_id", uid).maybeSingle();
  const name = [(p as any)?.first_name, (p as any)?.last_name].filter(Boolean).join(" ") || null;
  return { user_id: uid, member_email: (p as any)?.email ?? email, member_name: name };
}

async function productFor(sb: SupabaseClient, productId: string | null, fallbackName: string | null) {
  if (productId) {
    const { data } = await sb.from("products").select("id, name, billing_shape, term_months").eq("id", productId).maybeSingle();
    if (data) return { product_id: (data as any).id, product_name: (data as any).name, billing_shape: (data as any).billing_shape, term_months: (data as any).term_months };
  }
  if (fallbackName) {
    const { data } = await sb.from("products").select("id, name, billing_shape, term_months").eq("name", fallbackName).limit(1).maybeSingle();
    if (data) return { product_id: (data as any).id, product_name: (data as any).name, billing_shape: (data as any).billing_shape, term_months: (data as any).term_months };
  }
  return { product_id: null, product_name: fallbackName, billing_shape: null, term_months: null };
}

async function referralFor(sb: SupabaseClient, invitationId: string | null) {
  if (!invitationId) return { invitation_id: null, referring_practitioner_id: null };
  const { data } = await sb.from("client_invitations").select("id, practitioner_id").eq("id", invitationId).maybeSingle();
  return { invitation_id: (data as any)?.id ?? null, referring_practitioner_id: (data as any)?.practitioner_id ?? null };
}

async function upsert(sb: SupabaseClient, row: Row) {
  const { error } = await sb.from("payments").upsert(row, { onConflict: "dedupe_key" });
  if (error) console.log("[LEDGER] upsert error", error.message, row.dedupe_key);
}

const id = (x: any) => (typeof x === "string" ? x : x?.id ?? null);
const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

export async function feeForCharge(stripe: any, charge: any): Promise<number | null> {
  try {
    let bt = charge.balance_transaction;
    if (!bt) return null;
    if (typeof bt === "string") bt = await stripe.balanceTransactions.retrieve(bt);
    return typeof bt.fee === "number" ? bt.fee : null;
  } catch { return null; }
}

/** Resolves the metadata we attached at checkout for a charge. */
export async function contextForCharge(stripe: any, charge: any) {
  let meta: any = { ...(charge.metadata || {}) };
  let subscriptionId: string | null = null;
  let invoiceId: string | null = id(charge.invoice);
  let productName: string | null = charge.description || null;
  const piId = id(charge.payment_intent);

  // Subscription invoice payment (basil API: find invoice via invoice payments).
  if (!invoiceId && piId) {
    try {
      const ips = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: piId }, limit: 1 });
      invoiceId = id(ips.data?.[0]?.invoice);
    } catch { /* ignore */ }
  }
  if (invoiceId) {
    try {
      const inv = await stripe.invoices.retrieve(invoiceId);
      subscriptionId = id(inv.parent?.subscription_details?.subscription) ?? id((inv as any).subscription);
      meta = { ...(inv.parent?.subscription_details?.metadata || {}), ...meta };
      productName = inv.lines?.data?.[0]?.description || productName;
    } catch { /* ignore */ }
  }
  if (subscriptionId && !meta.product_id) {
    try { const s = await stripe.subscriptions.retrieve(subscriptionId); meta = { ...(s.metadata || {}), ...meta }; } catch { /* ignore */ }
  }
  // One-off checkout payment: metadata lives on the checkout session.
  if (!meta.product_id && piId) {
    try {
      const ss = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
      const s = ss.data?.[0];
      if (s) meta = { ...(s.metadata || {}), ...meta };
    } catch { /* ignore */ }
  }
  return { meta, subscriptionId, invoiceId, productName };
}

export async function recordCharge(sb: SupabaseClient, stripe: any, charge: any, opts: { eventId?: string; source?: string } = {}) {
  if (charge.status !== "succeeded" && charge.status !== "failed") return;
  const ctx = await contextForCharge(stripe, charge);
  const [member, product, referral] = await Promise.all([
    memberFor(sb, ctx.meta.user_id || null, id(charge.customer), charge.billing_details?.email || charge.receipt_email || null),
    productFor(sb, ctx.meta.product_id || null, ctx.productName),
    referralFor(sb, ctx.meta.invitation_id || null),
  ]);
  const base = {
    livemode: !!charge.livemode, ...member, ...product, ...referral,
    currency: charge.currency, stripe_charge_id: charge.id, stripe_invoice_id: ctx.invoiceId,
    stripe_subscription_id: ctx.subscriptionId, stripe_customer_id: id(charge.customer),
    stripe_event_id: opts.eventId ?? null, source: opts.source ?? "webhook",
  };
  if (charge.status === "failed") {
    await upsert(sb, { ...base, dedupe_key: `failed:${charge.id}`, event_type: "failed", occurred_at: iso(charge.created),
      amount_cents: charge.amount, status: charge.failure_message || "Failed", stripe_object_id: charge.id });
    return;
  }
  const fee = await feeForCharge(stripe, charge);
  await upsert(sb, { ...base, dedupe_key: `payment:${charge.id}`, event_type: "payment", occurred_at: iso(charge.created),
    amount_cents: charge.amount, fee_cents: fee, net_cents: fee == null ? null : charge.amount - fee,
    status: charge.refunded ? "Refunded" : charge.amount_refunded > 0 ? "Partly refunded" : "Paid", stripe_object_id: charge.id });

  const refunds = charge.refunds?.data?.length ? charge.refunds.data
    : charge.amount_refunded > 0 ? (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data : [];
  for (const r of refunds) {
    if (r.status === "failed" || r.status === "canceled") continue;
    await upsert(sb, { ...base, dedupe_key: `refund:${r.id}`, event_type: "refund", occurred_at: iso(r.created),
      amount_cents: -r.amount, fee_cents: 0, net_cents: -r.amount, status: r.status === "succeeded" ? "Refunded" : r.status,
      stripe_object_id: r.id });
  }
}

/** Fill in Stripe fees that weren't available at payment time. */
export async function fillFee(sb: SupabaseClient, stripe: any, charge: any) {
  const fee = await feeForCharge(stripe, charge);
  if (fee == null) return false;
  await sb.from("payments").update({ fee_cents: fee, net_cents: charge.amount - fee })
    .eq("dedupe_key", `payment:${charge.id}`).is("fee_cents", null);
  return true;
}

export async function recordFailedInvoice(sb: SupabaseClient, invoice: any, eventId?: string) {
  const subId = id(invoice.parent?.subscription_details?.subscription) ?? id(invoice.subscription);
  const meta = invoice.parent?.subscription_details?.metadata || {};
  const [member, product] = await Promise.all([
    memberFor(sb, meta.user_id || null, id(invoice.customer), invoice.customer_email || null),
    productFor(sb, meta.product_id || null, invoice.lines?.data?.[0]?.description || null),
  ]);
  await upsert(sb, { dedupe_key: `failed:${invoice.id}:${invoice.attempt_count ?? 1}`, event_type: "failed",
    livemode: !!invoice.livemode, occurred_at: new Date().toISOString(), ...member, ...product,
    amount_cents: invoice.amount_due, currency: invoice.currency, status: `Payment failed (attempt ${invoice.attempt_count ?? 1})`,
    stripe_invoice_id: invoice.id, stripe_subscription_id: subId, stripe_customer_id: id(invoice.customer),
    stripe_object_id: invoice.id, stripe_event_id: eventId ?? null });
}

/** Snapshot of what the subscriber is ACTUALLY paying + cancellation rows. */
export async function syncSubscription(sb: SupabaseClient, sub: any, opts: { eventId?: string; source?: string } = {}) {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const meta = sub.metadata || {};
  let email: string | null = null;
  const [member, product] = await Promise.all([
    memberFor(sb, meta.user_id || null, id(sub.customer), email),
    productFor(sb, meta.product_id || null, typeof price?.product === "object" ? price.product.name : null),
  ]);
  const cancelAt = sub.cancel_at ? iso(sub.cancel_at) : (sub.cancel_at_period_end ? iso(item?.current_period_end ?? sub.current_period_end) : null);
  await sb.from("payment_subscriptions").upsert({
    stripe_subscription_id: sub.id, livemode: !!sub.livemode, ...member, stripe_customer_id: id(sub.customer),
    product_id: product.product_id, product_name: product.product_name, billing_shape: product.billing_shape || meta.billing_shape || null,
    term_months: product.term_months ?? (meta.term_months ? Number(meta.term_months) : null),
    amount_cents: price?.unit_amount != null ? price.unit_amount * (item?.quantity ?? 1) : null,
    currency: price?.currency ?? sub.currency, billing_interval: price?.recurring?.interval ?? null,
    interval_count: price?.recurring?.interval_count ?? 1, status: sub.status,
    cancel_at_period_end: !!sub.cancel_at_period_end, cancel_at: cancelAt, canceled_at: iso(sub.canceled_at),
    started_at: iso(sub.start_date), current_period_end: iso(item?.current_period_end ?? sub.current_period_end),
  }, { onConflict: "stripe_subscription_id" });

  const isCourse = (product.billing_shape || meta.billing_shape) === "fixed_term";
  const base = { livemode: !!sub.livemode, ...member, ...product, stripe_subscription_id: sub.id,
    stripe_customer_id: id(sub.customer), stripe_object_id: sub.id, stripe_event_id: opts.eventId ?? null, source: opts.source ?? "webhook",
    currency: price?.currency ?? null, amount_cents: null };

  if (sub.status === "canceled") {
    let type = "cancellation";
    if (isCourse) {
      const { count } = await sb.from("payments").select("id", { count: "exact", head: true })
        .eq("stripe_subscription_id", sub.id).eq("event_type", "payment");
      const term = product.term_months ?? Number(meta.term_months || 0);
      if (term && (count ?? 0) >= term) type = "course_completed";
    }
    await upsert(sb, { ...base, dedupe_key: `cancel:${sub.id}`, event_type: type,
      // ended_at = when it actually stopped. Stripe sets canceled_at when a course's
      // automatic end date is scheduled at purchase, so it can't be used here.
      occurred_at: iso(sub.ended_at ?? sub.canceled_at) ?? new Date().toISOString(),
      status: type === "course_completed" ? "Course completed" : "Cancelled" });
  } else if (cancelAt && !isCourse) {
    await upsert(sb, { ...base, dedupe_key: `cancel_scheduled:${sub.id}:${cancelAt}`, event_type: "cancellation_scheduled",
      occurred_at: iso(sub.canceled_at) ?? new Date().toISOString(), status: `Scheduled to cancel ${cancelAt.slice(0, 10)}` });
  }
}
