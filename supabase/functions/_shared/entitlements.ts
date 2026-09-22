// Shared entitlement helpers for edge functions (service-role clients only).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type GrantOpts = {
  userId: string;
  levelKey: string;
  source: "stripe" | "admin" | "code" | "backfill";
  stripeRef?: string | null;
  endsAt?: string | null;
};

/** Grant a level unless the user already holds it actively. Idempotent. */
export async function grantEntitlement(admin: SupabaseClient, o: GrantOpts): Promise<"granted" | "already_active"> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("entitlements")
    .select("id")
    .eq("user_id", o.userId)
    .eq("level_key", o.levelKey)
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();

  if (existing) return "already_active";

  const { error } = await admin.from("entitlements").insert({
    user_id: o.userId,
    level_key: o.levelKey,
    source: o.source,
    stripe_ref: o.stripeRef ?? null,
    ends_at: o.endsAt ?? null,
    status: "active",
  });
  if (error) throw new Error(`Could not grant ${o.levelKey}: ${error.message}`);
  return "granted";
}

/** End every active entitlement tied to a Stripe reference (subscription id). */
export async function expireEntitlementsByRef(admin: SupabaseClient, stripeRef: string) {
  await admin
    .from("entitlements")
    .update({ status: "expired", ends_at: new Date().toISOString() })
    .eq("stripe_ref", stripeRef)
    .eq("status", "active");
}

/**
 * Legacy subscription tier -> access level. Single source of truth is the
 * access_levels.subscription_tier column (also read by the
 * tcta_sync_level_key trigger) — never hardcode a second map here.
 * Returns null when the tier maps to no grantable level; "free" is never
 * granted as a row because everyone implicitly holds it.
 */
export async function levelKeyForTier(admin: SupabaseClient, tier: string): Promise<string | null> {
  const { data, error } = await admin
    .from("access_levels")
    .select("key")
    .eq("subscription_tier", tier)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve tier ${tier}: ${error.message}`);
  const key = data?.key ?? null;
  return key === "free" ? null : key;
}
