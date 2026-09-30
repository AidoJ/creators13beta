import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Legacy subscription keys stored in the database. These are internal
 * identifiers only — never show them to people. Display names come from
 * the access levels (access_levels.subscription_tier → display_name).
 */
export type TierKey = Database["public"]["Enums"]["subscription_tier"];

/** Used only until the access levels have loaded. Matches access_levels. */
const FALLBACK: Record<TierKey, string> = {
  wren: "Free",
  robin: "Create",
  cockatoo: "Co-Create",
  owl: "Practitioner Membership",
};

let cache: Record<TierKey, string> | null = null;
let pending: Promise<Record<TierKey, string>> | null = null;

export function planNameSync(tier: string | null | undefined): string {
  if (!tier) return FALLBACK.wren;
  const names = cache ?? FALLBACK;
  return names[tier as TierKey] ?? FALLBACK.wren;
}

export async function loadPlanNames(): Promise<Record<TierKey, string>> {
  if (cache) return cache;
  pending ??= (async () => {
    const { data } = await supabase.from("access_levels").select("subscription_tier, display_name").not("subscription_tier", "is", null);
    const names = { ...FALLBACK };
    for (const row of data ?? []) {
      if (row.subscription_tier) names[row.subscription_tier as TierKey] = row.display_name;
    }
    cache = names;
    return names;
  })();
  return pending;
}

/** Current display name for a stored plan key ("Free", "Create", "Co-Create"…). */
export function usePlanName(tier: string | null | undefined): string {
  const [name, setName] = useState(() => planNameSync(tier));
  useEffect(() => {
    let alive = true;
    setName(planNameSync(tier));
    loadPlanNames().then(() => { if (alive) setName(planNameSync(tier)); });
    return () => { alive = false; };
  }, [tier]);
  return name;
}
