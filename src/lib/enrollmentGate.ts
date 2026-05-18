// Centralised enrollment gate. Single source of truth for "what step is this user
// allowed to be on right now?". Used by Dashboard + every enrollment page so that
// users can never skip a step by URL-hopping, stale links, or bookmarks.

import { supabase } from "@/integrations/supabase/client";

export interface EnrollmentState {
  isStaff: boolean; // practitioner/trainee/trainer/admin → bypass client gate
  isCaseStudySubject: boolean;
  hasSubscription: boolean;
  hasPractitioner: boolean;
  practitionerIsTrainer: boolean;
  hasDetails: boolean;
  hasConsent: boolean;
  hasPhotos: boolean;
  hasBooking: boolean;
  tier: string | null;
  billing: string | null;
}

export async function loadEnrollmentState(userId: string): Promise<EnrollmentState> {
  const [rolesRes, profileRes, subRes, photosRes, bookingRes, cpRes, csRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("profiles")
      .select("first_name, date_of_birth, gender, height_cm, case_study_consent_at, email")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("subscriptions").select("tier, billing_period, referral_code").eq("user_id", userId).maybeSingle(),
    supabase
      .from("profiling_photos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("bookings").select("id").eq("client_id", userId).limit(1).maybeSingle(),
    supabase
      .from("client_practitioner")
      .select("practitioner_id")
      .eq("client_id", userId)
      .eq("active", true),
    supabase.from("case_studies").select("id").eq("subject_user_id", userId).limit(1),
  ]);

  const roles = (rolesRes.data || []).map((r: any) => r.role);
  const isStaff = roles.some((r: string) =>
    ["practitioner", "trainee", "trainer", "admin"].includes(r)
  );

  let practitionerIsTrainer = false;
  const practIds = (cpRes.data || []).map((r: any) => r.practitioner_id);
  if (practIds.length > 0) {
    const { data: trainerRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", practIds)
      .eq("role", "trainer");
    practitionerIsTrainer = !!(trainerRoles && trainerRoles.length > 0);
  }

  const { data: invitingPractitioners } = await (supabase as any)
    .rpc("get_inviting_practitioners_for_current_user");
  const hasInvitation = !!(invitingPractitioners && invitingPractitioners.length > 0);

  const isCaseStudySubject = !!(
    subRes.data?.referral_code ||
    hasInvitation ||
    (csRes.data && csRes.data.length > 0)
  );

  return {
    isStaff,
    isCaseStudySubject,
    hasSubscription: !!subRes.data?.tier,
    hasPractitioner: practIds.length > 0,
    practitionerIsTrainer,
    hasDetails: !!(
      profileRes.data?.first_name &&
      profileRes.data?.date_of_birth &&
      profileRes.data?.gender &&
      profileRes.data?.height_cm
    ),
    hasConsent: !!profileRes.data?.case_study_consent_at,
    hasPhotos: (photosRes.count || 0) > 0,
    hasBooking: !!bookingRes.data,
    tier: subRes.data?.tier ?? null,
    billing: subRes.data?.billing_period ?? null,
  };
}

/**
 * Returns the URL path the user is REQUIRED to be on right now.
 * Returns null if the user has completed enrollment (dashboard is OK).
 * Returns null for staff (they bypass the client enrollment gate entirely).
 */
export function getRequiredEnrollmentPath(state: EnrollmentState): string | null {
  if (state.isStaff) return null;

  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (state.tier) p.set("tier", state.tier);
    if (state.billing) p.set("billing", state.billing);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  if (!state.hasSubscription) return "/enroll";
  if (!state.hasPractitioner) return `/enroll/practitioner${qs()}`;
  if (!state.hasDetails) return `/enroll/details${qs()}`;
  // Consent is REQUIRED for everyone before photos — fail-closed.
  if (!state.hasConsent) return `/enroll/consent${qs()}`;
  if (!state.hasPhotos) return `/enroll/photos${qs()}`;
  // Booking only required for paying/direct clients linked to a trainer-role practitioner.
  // Invited case-study subjects should land on their dashboard after photos.
  if (!state.isCaseStudySubject && state.practitionerIsTrainer && !state.hasBooking) return `/enroll/booking${qs()}`;

  return null; // complete
}
