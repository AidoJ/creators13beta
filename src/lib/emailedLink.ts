import { supabase } from "@/integrations/supabase/client";

/**
 * Emailed links (training payment, case-study / clinic invitations) may reach
 * a brand-new person. This looks up the email the link was issued to and
 * whether an account already exists, so we open sign-up (new) or sign-in
 * (existing) with that email locked.
 */
export async function lookupEmailedLink(kind: "training" | "invite", ref: string): Promise<{ email: string; has_account: boolean } | null> {
  if (!ref) return null;
  const { data, error } = await (supabase as any).rpc("emailed_link_account", { _kind: kind, _ref: ref });
  if (error || !data) return null;
  return data as { email: string; has_account: boolean };
}

export function lockedAuthUrl(email: string, hasAccount: boolean, returnTo: string): string {
  const p = new URLSearchParams({ mode: hasAccount ? "login" : "signup", email, lock: "1", returnTo });
  return `/auth?${p.toString()}`;
}
