import { supabase } from "@/integrations/supabase/client";

/**
 * Emailed links (training payment, case-study / clinic invitations) may reach
 * a brand-new person. This looks up the email the link was issued to and
 * whether an account already exists, so we open sign-up (new) or sign-in
 * (existing) with that email locked. Closed links report why (paid/used/...)
 * without revealing the email.
 */
export type EmailedLinkInfo =
  | { state: "open"; email: string; has_account: boolean }
  | { state: "paid" | "used" | "closed" | "invalid" };

export async function lookupEmailedLink(kind: "training" | "invite", ref: string): Promise<EmailedLinkInfo | null> {
  if (!ref) return { state: "invalid" };
  const { data, error } = await (supabase as any).rpc("emailed_link_account", { _kind: kind, _ref: ref });
  if (error || !data) return null;
  return data as EmailedLinkInfo;
}

export function lockedAuthUrl(email: string, hasAccount: boolean, returnTo: string): string {
  const p = new URLSearchParams({ mode: hasAccount ? "login" : "signup", email, lock: "1", returnTo });
  return `/auth?${p.toString()}`;
}

export const CLOSED_LINK_MESSAGES: Record<"paid" | "used" | "closed" | "invalid", { title: string; body: string }> = {
  paid: { title: "Already paid", body: "This payment has already been made. Sign in to go to your dashboard." },
  used: { title: "Invitation already used", body: "This invitation has already been used. Sign in to go to your dashboard." },
  closed: { title: "Link no longer active", body: "This payment link is no longer active. Please contact us if you think this is a mistake." },
  invalid: { title: "Link not recognised", body: "We couldn't find this link. Please check the email you received or contact us." },
};
