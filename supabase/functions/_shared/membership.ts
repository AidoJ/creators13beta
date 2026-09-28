// Membership order: Connect (taster) < Create (creator) < Co-Create (co_creator).
// Keep in sync with MEMBERSHIP_RANK in src/pages/FrontPage.tsx.
import Stripe from "https://esm.sh/stripe@18.5.0";

export const MEMBERSHIP_RANK: Record<string, number> = { taster: 1, creator: 2, co_creator: 3 };

export const rankOf = (levelKey: string | null | undefined) => (levelKey ? MEMBERSHIP_RANK[levelKey] ?? 0 : 0);

/**
 * Cancel every lower membership subscription the customer still has and refund
 * the unused part of its current period, pro rata by time:
 *   refund = amount paid on the latest invoice × (period_end − now) / (period_end − period_start)
 * rounded DOWN to the cent, capped at what is still refundable on that payment.
 */
export async function replaceLowerMemberships(
  stripe: Stripe,
  opts: { customerId: string; newSubscriptionId: string | null; newLevelKey: string; log: (m: string, d?: unknown) => void },
) {
  const newRank = rankOf(opts.newLevelKey);
  if (!newRank) return [];
  const results: unknown[] = [];
  const subs = await stripe.subscriptions.list({ customer: opts.customerId, status: "all", limit: 100 });
  for (const s of subs.data) {
    if (s.id === opts.newSubscriptionId) continue;
    if (!["active", "trialing", "past_due"].includes(s.status)) continue;
    const lvl = (s.metadata as any)?.level_key;
    const r = rankOf(lvl);
    if (!r || r >= newRank) continue;

    const item: any = s.items.data[0];
    const start = item?.current_period_start ?? (s as any).current_period_start;
    const end = item?.current_period_end ?? (s as any).current_period_end;
    const now = Math.floor(Date.now() / 1000);
    let refunded = 0;
    try {
      const invId = typeof s.latest_invoice === "string" ? s.latest_invoice : s.latest_invoice?.id;
      if (invId && start && end && end > now) {
        const inv = await stripe.invoices.retrieve(invId);
        const paid = inv.amount_paid ?? 0;
        const pays = await (stripe as any).invoicePayments.list({ invoice: invId, limit: 5 });
        const piRef = pays.data.find((p: any) => p.status === "paid")?.payment?.payment_intent;
        const piId = typeof piRef === "string" ? piRef : piRef?.id;
        if (paid > 0 && piId) {
          const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
          const ch: any = pi.latest_charge;
          const refundable = ch ? ch.amount - ch.amount_refunded : paid;
          const amount = Math.min(refundable, Math.floor((paid * (end - now)) / (end - start)));
          if (amount > 0) {
            await stripe.refunds.create({
              payment_intent: piId,
              amount,
              metadata: { reason: "upgrade_prorata", replaced_level: lvl, new_level: opts.newLevelKey },
            });
            refunded = amount;
          }
        }
      }
    } catch (e) {
      opts.log("ERROR pro-rata refund", { subId: s.id, message: String(e) });
    }
    try {
      if ((s as any).schedule) {
        const schedId = typeof (s as any).schedule === "string" ? (s as any).schedule : (s as any).schedule.id;
        await stripe.subscriptionSchedules.release(schedId).catch(() => {});
      }
      await stripe.subscriptions.cancel(s.id, { prorate: false, invoice_now: false } as any);
    } catch (e) {
      opts.log("ERROR cancelling lower membership", { subId: s.id, message: String(e) });
    }
    opts.log("Lower membership replaced", { subId: s.id, level: lvl, refunded });
    results.push({ subId: s.id, level: lvl, refunded });
  }
  return results;
}
