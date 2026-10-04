import type { User } from "@supabase/supabase-js";

/**
 * Remembers which paid product a visitor chose before signing up, so the
 * purchase resumes after the email verification link — even if the link
 * lands on the homepage or is opened on another device (kept in the
 * account's sign-up data as well as this browser).
 *
 * Rules:
 *  - Restricted products (training, Clinic Profile) are never remembered —
 *    they're only bought through their own emailed link.
 *  - An explicit link (payment link, invitation, ?buy=) always overrides
 *    and clears any saved choice.
 *  - Checkout resumes automatically only within 30 minutes of the choice;
 *    after that the dashboard shows "You chose X — continue to payment".
 */
const KEY = "c13_pending_buy";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const AUTO_RESUME_MS = 30 * 60 * 1000;

export function rememberPendingBuy(productId: string, opts?: { restricted?: boolean }) {
  if (opts?.restricted) return;
  try { localStorage.setItem(KEY, JSON.stringify({ id: productId, at: Date.now() })); } catch { /* ignore */ }
  try { sessionStorage.removeItem(`${KEY}_done`); } catch { /* ignore */ }
}

export function clearPendingBuy() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { sessionStorage.setItem(`${KEY}_done`, "1"); } catch { /* ignore */ }
}

/** Clears the choice in this browser and in the account's sign-up data. */
export async function forgetPendingBuyEverywhere(user?: User | null) {
  clearPendingBuy();
  const meta = user?.user_metadata as { pending_buy?: string } | undefined;
  if (user && meta?.pending_buy === undefined) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.updateUser({ data: { pending_buy: null, pending_buy_at: null } });
  } catch { /* ignore */ }
}

/** Checkout was opened for this product in this browser session: stop the
 *  automatic re-launch (so leaving Stripe doesn't loop) but keep the choice. */
export function markCheckoutHandedOff(productId: string) {
  try { sessionStorage.setItem(`${KEY}_handoff`, productId); } catch { /* ignore */ }
}

export function wasCheckoutHandedOff(productId: string): boolean {
  try { return sessionStorage.getItem(`${KEY}_handoff`) === productId; } catch { return false; }
}

export function extractBuyFromReturnTo(returnTo: string | null): string | null {
  if (!returnTo) return null;
  try { return new URL(returnTo, "https://x").searchParams.get("buy"); } catch { return null; }
}

/** A returnTo that points at a specific emailed page (payment link, invite). */
export function isExplicitLinkReturn(returnTo: string | null): boolean {
  if (!returnTo) return false;
  try {
    const u = new URL(returnTo, "https://x");
    if (u.searchParams.has("buy")) return true;
    return u.pathname !== "/" && u.pathname !== "/dashboard";
  } catch { return false; }
}

function read(user: User | null | undefined, maxAge: number): string | null {
  try {
    if (sessionStorage.getItem(`${KEY}_done`)) return null;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { id?: string; at?: number };
      if (v.id && v.at && Date.now() - v.at < maxAge) return v.id;
    }
  } catch { /* ignore */ }
  const meta = user?.user_metadata as { pending_buy?: string; pending_buy_at?: number } | undefined;
  if (meta?.pending_buy && meta.pending_buy_at && Date.now() - meta.pending_buy_at < maxAge) {
    return meta.pending_buy;
  }
  return null;
}

/** Any saved choice within 7 days (drives the "continue to payment" banner). */
export function getPendingBuy(user: User | null | undefined): string | null {
  return read(user, MAX_AGE_MS);
}

/** Saved choice recent enough (30 min) to reopen checkout automatically. */
export function getAutoResumeBuy(user: User | null | undefined): string | null {
  return read(user, AUTO_RESUME_MS);
}

async function withFreshUser(user: User | null | undefined, fn: (u: User | null | undefined) => string | null) {
  const local = fn(user);
  if (local || !user) return local;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    return fn(data.user);
  } catch {
    return null;
  }
}

export function resolvePendingBuy(user: User | null | undefined): Promise<string | null> {
  return withFreshUser(user, getPendingBuy);
}

export function resolveAutoResumeBuy(user: User | null | undefined): Promise<string | null> {
  return withFreshUser(user, getAutoResumeBuy);
}
