import { supabase } from "@/integrations/supabase/client";

/**
 * The one rule for "is this person a case-study volunteer": they have a case
 * study record, joined with a practitioner code, or were invited by a
 * practitioner (with or without a code). Decided on the server so the member,
 * their practitioner and staff all get the same answer.
 */
export async function isCaseStudySubject(userId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("is_case_study_subject", { _user_id: userId });
  if (error) return false;
  return data === true;
}
