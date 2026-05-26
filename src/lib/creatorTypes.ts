/**
 * Single source of truth for all 13 Creator Type colours and glyphs.
 * Colours match the official "Creator Families + Team Roles" PDF chart.
 */

export const CREATOR_TYPE_COLORS: Record<string, string> = {
  lava:      "#da7028",
  fire:      "#eda35e",
  whirlwind: "#abd49e",
  snow:      "#c2e5cf",
  lightning: "#8fd4b8",
  sun:       "#f2d178",
  lake:      "#7db2d9",
  ocean:     "#6173b0",
  tree:      "#db7d75",
  mountain:  "#c45463",
  soil:      "#944a47",
  river:     "#99ccd4",
  sky:       "#bdb2e5",
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
