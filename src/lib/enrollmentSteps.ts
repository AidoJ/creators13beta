// Pure resolver for the "next enrolment step" — consumed by:
//   - the dashboard Continue block,
//   - the Me-page journey block,
//   - the server-side recovery sweep (mirrored in the edge function).
//
// Single source of truth: DO NOT duplicate step ordering elsewhere.
// The order MUST match getRequiredEnrollmentPath() in ./enrollmentGate.

import type { EnrollmentState } from "./enrollmentGate";

export type EnrollmentStepKey =
  | "plan"
  | "practitioner"
  | "details"
  | "consent"
  | "photos"
  | "booking"
  | "paygate";

export interface EnrollmentStep {
  key: EnrollmentStepKey;
  label: string;      // human-friendly, used in UI + email copy
  route: string;      // absolute path (client) — includes ?tier/billing if known
  index: number;      // 1-based position in this user's remaining pipeline
  total: number;      // total steps this user will need to complete
  isPaygate: boolean; // true when abandonment is specifically at /enroll/payment
}

/**
 * Returns the next required step for this user, or `null` if enrolment is
 * complete (or the user is a staff/player who doesn't have one).
 *
 * `reachedCheckoutAt` (from profiles.reached_checkout_at) marks paygate
 * abandonment: the plan/subscription may not yet have written a tier
 * because embedded Stripe checkout hasn't confirmed. When that flag is
 * present and there is still no subscription, we surface a paygate step.
 */
export function getNextEnrollmentStep(
  state: EnrollmentState,
  reachedCheckoutAt: string | null = null,
): EnrollmentStep | null {
  if (state.isStaff) return null;
  if (state.isPlayerOnly) return null;

  const qs = (() => {
    const p = new URLSearchParams();
    if (state.tier) p.set("tier", state.tier);
    if (state.billing) p.set("billing", state.billing);
    const s = p.toString();
    return s ? `?${s}` : "";
  })();

  // Ordered pipeline. `applies` prunes steps that don't apply to this user.
  const pipeline: Array<{
    key: EnrollmentStepKey;
    label: string;
    route: string;
    applies: boolean;
    done: boolean;
    isPaygate?: boolean;
  }> = [
    {
      key: "plan",
      label: "Choose your plan",
      route: "/enroll",
      applies: true,
      done: state.hasSubscription,
    },
    {
      key: "paygate",
      label: "Complete your payment",
      route: `/enroll/payment${qs}`,
      applies: !state.hasSubscription && !!reachedCheckoutAt,
      done: state.hasSubscription,
      isPaygate: true,
    },
    {
      key: "practitioner",
      label: "Link your practitioner",
      route: `/enroll/practitioner${qs}`,
      applies: true,
      done: state.hasPractitioner,
    },
    {
      key: "details",
      label: "Add your personal details",
      route: `/enroll/details${qs}`,
      applies: true,
      done: state.hasDetails,
    },
    {
      key: "consent",
      label: "Confirm consent",
      route: `/enroll/consent${qs}`,
      applies: true,
      done: state.hasConsent,
    },
    {
      key: "photos",
      label: "Upload your photos",
      route: `/enroll/photos${qs}`,
      applies: true,
      done: state.hasPhotos,
    },
    {
      key: "booking",
      label: "Book your session",
      route: `/enroll/booking${qs}`,
      // Booking only required for paying (non-case-study) clients linked to
      // a trainer-role practitioner — mirrors getRequiredEnrollmentPath.
      applies: !state.isCaseStudySubject && state.practitionerIsTrainer,
      done: state.hasBooking,
    },
  ];

  const applicable = pipeline.filter((s) => s.applies);
  const total = applicable.length;
  const nextIndex = applicable.findIndex((s) => !s.done);
  if (nextIndex === -1) return null;

  const next = applicable[nextIndex];
  return {
    key: next.key,
    label: next.label,
    route: next.route,
    index: nextIndex + 1,
    total,
    isPaygate: !!next.isPaygate,
  };
}

/** Steps remaining, inclusive of the current one (for "N steps to go" copy). */
export function stepsRemaining(step: EnrollmentStep): number {
  return Math.max(1, step.total - step.index + 1);
}
