/**
 * Single source of truth for all 13 Creator Type colours and glyphs.
 * Colours match the official "Creator Families + Team Roles" PDF chart.
 */

export const CREATOR_TYPE_COLORS: Record<string, string> = {
  lava:      "#E85500",
  fire:      "#F07000",
  whirlwind: "#2D7A00",
  sun:       "#F5A300",
  lightning: "#7CC800",
  snow:      "#00B887",
  sky:       "#5BB8D4",
  mountain:  "#F02000",
  tree:      "#b00000",
  soil:      "#8B1717",
  river:     "#00AAEE",
  ocean:     "#1B3FB5",
  lake:      "#00A8CC",
};

/** Ordered list of all creator type names in canonical display order. */
export const CREATOR_TYPE_NAMES = [
  "Lava", "Fire", "Whirlwind",
  "Snow", "Lightning", "Sun",
  "Lake", "Ocean",
  "Tree", "Mountain", "Soil",
  "River", "Sky",
] as const;

/** Sort an array of creator type names into canonical display order. */
export function sortCreatorTypes(types: string[]): string[] {
  const orderMap = new Map(CREATOR_TYPE_NAMES.map((n, i) => [n.toLowerCase(), i]));
  return [...types].sort((a, b) => {
    const ia = orderMap.get(a.toLowerCase()) ?? 999;
    const ib = orderMap.get(b.toLowerCase()) ?? 999;
    return ia - ib;
  });
}

/** Returns the hex colour for a creator type name (case-insensitive). Falls back to a neutral. */
export function getCreatorTypeColor(name: string): string {
  return CREATOR_TYPE_COLORS[name.toLowerCase()] ?? "#888888";
}

/** Capitalise a creator type name to match the canonical Title Case in the DB (e.g. "lava" → "Lava"). */
export function capitaliseTypeName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}
