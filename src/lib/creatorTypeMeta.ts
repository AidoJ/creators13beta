/**
 * Static lookup for Creator Type metadata used on card backs and elsewhere.
 * Source of truth: `creator_types` table (see supabase). Kept as a static map
 * so card renders don't need an async fetch — the 13 types + Sky are canonical
 * and rarely change.
 */
export const CREATOR_TYPE_FAMILY: Record<string, string> = {
  Lava: "Catalysts",
  Fire: "Catalysts",
  Whirlwind: "Catalysts",
  Snow: "Optimists",
  Lightning: "Optimists",
  Sun: "Optimists",
  Lake: "Humanists",
  Ocean: "Humanists",
  Tree: "Humanists",
  Mountain: "Realists",
  Soil: "Realists",
  River: "Realists",
  Sky: "Sustainers",
};

export const CREATOR_TYPE_TEAM_ROLE: Record<string, string> = {
  Lava: "Director",
  Fire: "Stabilizer",
  Whirlwind: "Integrator",
  Snow: "Director",
  Lightning: "Stabilizer",
  Sun: "Integrator",
  Lake: "Director",
  Ocean: "Stabilizer",
  Tree: "Integrator",
  Mountain: "Director",
  Soil: "Stabilizer",
  River: "Integrator",
  Sky: "The Visionary",
};

export function creatorMetaFor(typeName: string | null | undefined): { family: string; teamRole: string } | null {
  if (!typeName) return null;
  const family = CREATOR_TYPE_FAMILY[typeName];
  const teamRole = CREATOR_TYPE_TEAM_ROLE[typeName];
  if (!family || !teamRole) return null;
  return { family, teamRole };
}
