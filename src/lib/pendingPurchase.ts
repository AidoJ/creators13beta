import type { User } from "@supabase/supabase-js";

/**
 * Remembers which paid product a visitor chose before signing up, so the
 * purchase resumes after the email verification link — even if the link
 * lands on the homepage or is opened on another device (kept in the
 * account's sign-up data as well as this browser).
 */
const KEY = "c13_pending_buy";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export function rememberPendingBuy(productId: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ id: productId, at: Date.now() })); } catch { /* ignore */ }
}

export function clearPendingBuy() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { sessionStorage.setItem(`${KEY}_done`, "1"); } catch { /* ignore */ }
}

export function extractBuyFromReturnTo(returnTo: string | null): string | null {
  if (!returnTo) return null;
  try { return new URL(returnTo, "https://x").searchParams.get("buy"); } catch { return null; }
}

export function getPendingBuy(user: User | null | undefined): string | null {
  try {
    if (sessionStorage.getItem(`${KEY}_done`)) return null;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { id?: string; at?: number };
      if (v.id && v.at && Date.now() - v.at < MAX_AGE_MS) return v.id;
    }
  } catch { /* ignore */ }
  const meta = user?.user_metadata as { pending_buy?: string; pending_buy_at?: number } | undefined;
  if (meta?.pending_buy && meta.pending_buy_at && Date.now() - meta.pending_buy_at < MAX_AGE_MS) {
    return meta.pending_buy;
  }
  return null;
}

/** Same as getPendingBuy, but refreshes the account's sign-up data from the
 *  server when the cached session doesn't carry it. */
export async function resolvePendingBuy(user: User | null | undefined): Promise<string | null> {
  const local = getPendingBuy(user);
  if (local || !user) return local;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    return getPendingBuy(data.user);
  } catch {
    return null;
  }
}
