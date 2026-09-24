// Shared status lookup: what paid access each person actually holds right now.
// Reads the new access records (entitlements), labelled from the product that
// grants each level. Use this for every "what plan / status is this person on"
// display — subscriptions.tier is legacy and is NOT written by storefront,
// course or admin grants.

import { supabase } from "@/integrations/supabase/client";

export type BillingShape = "recurring" | "fixed_term" | "one_off" | null;

export interface AccessItem {
  user_id: string;
  level_key: string;
  display_name: string;
  sort_order: number;
  source: string;
  billing_shape: BillingShape;
  product_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  stripe_ref: string | null;
}

/** Fetch active paid access for many users. Result is grouped by user, highest level first. */
export async function loadAccessSummary(userIds: string[]): Promise<Record<string, AccessItem[]>> {
  const out: Record<string, AccessItem[]> = {};
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  // Chunk to keep the request URL/body reasonable for big admin lists.
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await (supabase as any).rpc("get_access_summary", {
      _user_ids: ids.slice(i, i + chunkSize),
    });
    if (error) {
      console.error("get_access_summary failed", error);
      continue;
    }
    for (const row of (data || []) as AccessItem[]) {
      (out[row.user_id] ||= []).push(row);
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.sort_order - a.sort_order);
  return out;
}

export async function loadMyAccess(userId: string): Promise<AccessItem[]> {
  const map = await loadAccessSummary([userId]);
  return map[userId] || [];
}

export function billingLabel(shape: BillingShape): string {
  if (shape === "recurring") return "Monthly membership";
  if (shape === "fixed_term") return "Membership";
  if (shape === "one_off") return "One-off";
  return "Granted";
}

/** Short comma-joined label for list columns, e.g. "Body Profile, Connect". */
export function accessLabel(items: AccessItem[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  return items.map((i) => i.display_name).join(", ");
}

/** Highest-ranked item (for single-badge displays). */
export function primaryAccess(items: AccessItem[] | undefined): AccessItem | null {
  return items && items.length ? items[0] : null;
}
