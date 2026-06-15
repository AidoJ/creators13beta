/**
 * Seasonal backgrounds for the Community Dashboard.
 *
 * Spec: the background image changes each season (Creator-of-the-Month cycle).
 * Each of the 13 Creator Types belongs to a Creator Family. There are 4 family
 * backgrounds (Catalysts, Optimists, Humanists, Realists) plus a dedicated Sky
 * background that only shows during the 13th month (Sky's month).
 */
import catalysts from "@/assets/bg-Catalysts_Background.png.asset.json";
import optimists from "@/assets/bg-Optimists_Background.png.asset.json";
import humanists from "@/assets/bg-Humanists_Background.png.asset.json";
import realists  from "@/assets/bg-Realists_Background.png.asset.json";
import sky       from "@/assets/bg-Sky_Background.png.asset.json";

// Map every Creator Type → the background to display in its month.
// Sky is the only type whose month uses its own dedicated background.
const TYPE_TO_BG: Record<string, string> = {
  // Catalysts
  lava: catalysts.url, fire: catalysts.url, whirlwind: catalysts.url,
  // Optimists
  snow: optimists.url, lightning: optimists.url, sun: optimists.url,
  // Humanists
  lake: humanists.url, ocean: humanists.url, tree: humanists.url,
  // Realists
  mountain: realists.url, soil: realists.url, river: realists.url,
  // Sustainers (13th month)
  sky: sky.url,
};

const FALLBACK = catalysts.url;

export function backgroundForSeason(creatorType?: string | null): string {
  if (!creatorType) return FALLBACK;
  return TYPE_TO_BG[creatorType.toLowerCase()] ?? FALLBACK;
}
