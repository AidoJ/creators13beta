/**
 * Short, unambiguous human-readable code for a card derived from its two
 * Creator Types. Uses the FIRST and LAST letter of each type name so that
 * visually-close palette colours (e.g. Lava vs Lake, Snow vs Soil vs Sun
 * vs Sky) are trivially distinguishable in summaries, logs, screenshots
 * and admin views.
 *
 * Both halves are Title-cased: first letter UPPER, last letter lower.
 *
 *   Snow → "Sw",  Soil → "Sl",  Lava → "La",  Lake → "Le",
 *   Sun  → "Sn",  Sky  → "Sy",  Lightning → "Lg"
 *
 *   Alpaca (Snow + Soil)       → "SwSl"
 *   Bear   (Lava + Soil)       → "LaSl"
 *   (hypothetical Lava + Lake) → "LaLe"
 *
 * This is a DISPLAY aid only — game logic remains keyed off the full
 * Creator-Type name strings.
 */

function half(type: string | null | undefined): string {
  if (!type || type.length === 0) return "";
  return type[0].toUpperCase() + type[type.length - 1].toLowerCase();
}

/** Build the 4-char code from two Creator-Type names. */
export function creatorTypeCode(typeA?: string | null, typeB?: string | null): string {
  return half(typeA) + half(typeB);
}

/** Single-type 2-letter half (used for special cards / Sky Creator etc.). */
export function creatorTypeHalf(type: string): string {
  return half(type);
}

/** Short badge code for any DeckCard kind, used on board + hand tiles.
 *  - animal / sky_creature → 4-char dual-type code (e.g. "LgSn")
 *  - creator               → 2-char displayType code (e.g. "Sn")
 *  - sky_creator           → "Sy"
 *  - golden_body           → "GB"
 *  - golden_hive           → "GH"
 */
export function cardCodeLabel(card: {
  kind: string;
  types?: readonly (string | null | undefined)[];
  displayType?: string | null;
  element?: string | null;
}): string {
  switch (card.kind) {
    case "animal":
    case "sky_creature":
      return creatorTypeCode(card.types?.[0], card.types?.[1]);
    case "creator":
      return half(card.displayType ?? card.element ?? "");
    case "sky_creator":
      return "Sy";
    case "golden_body":
      return "GB";
    case "golden_hive":
      return "GH";
    default:
      return "";
  }
}
