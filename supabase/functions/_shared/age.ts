/**
 * Age in whole years from a date of birth ("YYYY-MM-DD" or Date).
 * The birthday counts from the start of that day (someone born 2010-05-01
 * turns 16 on 2026-05-01). Read as a calendar date, never shifted by timezone.
 * Returns null for a blank or invalid date.
 *
 * Copy of src/lib/age.ts (tested there) — keep both identical.
 */
export function ageFromDob(dob: string | Date | null | undefined, today: Date = new Date()): number | null {
  if (!dob) return null;
  let y: number, m: number, d: number;
  if (typeof dob === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
    if (!match) return null;
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  } else {
    if (isNaN(dob.getTime())) return null;
    y = dob.getFullYear(); m = dob.getMonth() + 1; d = dob.getDate();
  }
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export const isUnder = (dob: string | Date | null | undefined, years: number, today?: Date) => {
  const age = ageFromDob(dob, today);
  return age !== null && age < years;
};
