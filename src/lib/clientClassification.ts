/**
 * Standardised client classification logic.
 *
 * A **case study subject** is any user who appears as `subject_user_id`
 * in at least one `case_studies` record.
 *
 * A **paying subscriber** is any user whose subscription tier is
 * robin, falcon, or owl (i.e. not the free wren tier).
 *
 * A user can be both (e.g. a case study subject who later upgrades).
 */

export type ClientClassification = "subscriber" | "case_study" | "both";

const PAID_TIERS = new Set(["robin", "falcon", "owl"]);

/** True when the tier represents a paid subscription. */
export function isPaidTier(tier: string | null | undefined): boolean {
  return !!tier && PAID_TIERS.has(tier.toLowerCase());
}

/** Build a Set of user IDs that are case study subjects. */
export function buildCaseStudySubjectSet(
  caseStudies: { subject_user_id: string | null }[]
): Set<string> {
  const set = new Set<string>();
  for (const cs of caseStudies) {
    if (cs.subject_user_id) set.add(cs.subject_user_id);
  }
  return set;
}

/** Classify a single user. Returns null if the user is neither. */
export function classifyClient(
  userId: string,
  tier: string | null | undefined,
  caseStudySubjects: Set<string>
): ClientClassification | null {
  const paid = isPaidTier(tier);
  const isCsSubject = caseStudySubjects.has(userId);

  if (paid && isCsSubject) return "both";
  if (paid) return "subscriber";
  if (isCsSubject) return "case_study";
  return null;
}
