import { supabase } from "@/integrations/supabase/client";

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "Invite sent",
  link_clicked: "Clicked invitation link",
  account_created: "Account created",
  photos_pending: "Photos pending",
  accepted: "Ready for profiling",
};

export const INVITATION_STATUS_STYLES: Record<string, string> = {
  pending: "border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300",
  link_clicked: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  account_created: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  photos_pending: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  accepted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export function getInvitationStatusLabel(status: string): string {
  return INVITATION_STATUS_LABELS[status] || status;
}

export function getInvitationStatusClass(status: string): string {
  return (
    INVITATION_STATUS_STYLES[status] ||
    "border-border bg-muted text-muted-foreground"
  );
}

/**
 * Given a list of invitations, look up each invitee by email and promote any
 * `photos_pending` rows to `accepted` if the invitee has uploaded photos.
 * Returns a new array with adjusted statuses (does NOT write to the DB).
 */
export async function resolveInvitationStatuses<
  T extends { email: string; status: string }
>(invitations: T[]): Promise<T[]> {
  if (invitations.length === 0) return invitations;

  const inviteEmails = [
    ...new Set(invitations.map((i) => i.email.toLowerCase())),
  ];

  const { data: inviteeProfiles } = await supabase
    .from("profiles")
    .select("user_id, email")
    .in("email", inviteEmails);

  const emailToUserId: Record<string, string> = {};
  (inviteeProfiles || []).forEach((p) => {
    if (p.email) emailToUserId[p.email.toLowerCase()] = p.user_id;
  });

  const inviteeUserIds = Object.values(emailToUserId);
  const { data: photoRows } = inviteeUserIds.length
    ? await supabase
        .from("profiling_photos")
        .select("user_id")
        .in("user_id", inviteeUserIds)
    : { data: [] };

  const userIdsWithPhotos = new Set((photoRows || []).map((r) => r.user_id));

  const promotable = new Set([
    "pending",
    "link_clicked",
    "account_created",
    "photos_pending",
  ]);

  return invitations.map((inv) => {
    if (promotable.has(inv.status)) {
      const uid = emailToUserId[inv.email.toLowerCase()];
      if (uid && userIdsWithPhotos.has(uid)) {
        return { ...inv, status: "accepted" };
      }
    }
    return inv;
  });
}
