/**
 * Short, unambiguous human-readable code for a card derived from its two
 * Creator Types. Uses the FIRST and LAST letter of each type name so that
 * visually-close palette colours (e.g. Lava vs Lake, Snow vs Soil vs Sun
 * vs Sky) are trivially distinguishable in summaries, logs, screenshots
 * and admin views.
 *
 *   type_a → Capitalised first + last letter (e.g. Snow → "Sw")
 *   type_b → lowercase  first + last letter (e.g. Soil → "sl")
 *
 *   Alpaca (Snow + Soil)       → "SwSl"
 *   Bear   (Lava + Soil)       → "LaSl"
 *   (hypothetical Lava + Lake) → "LaLe"   ← distinct from Lava+Lava
 *
 * This is a DISPLAY aid only — game logic remains keyed off the full
 * Creator-Type name strings.
 */

function part(type: string | null | undefined, lower: boolean): string {
  if (!type || type.length === 0) return "";
  const first = type[0];
  const last = type[type.length - 1];
  if (lower) return (first + last).toLowerCase();
  return first.toUpperCase() + last.toLowerCase();
}

/** Build the 4-char code from two Creator-Type names. */
export function creatorTypeCode(typeA?: string | null, typeB?: string | null): string {
  return part(typeA, false) + part(typeB, true);
}

/** Single-type half (used for special cards / Sky Creator etc.). */
export function creatorTypeHalf(type: string, lower = false): string {
  return part(type, lower);
}
