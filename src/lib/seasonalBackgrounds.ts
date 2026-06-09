/**
 * Seasonal backgrounds for the Community Dashboard.
 *
 * Spec: "the background image changes each season." A season = the current
 * Creator-of-the-Month cycle (13 seasons, one per Creator Type). We map each
 * Creator Type → a background asset URL. Until per-type imagery is supplied,
 * every season falls back to the fern placeholder. Replace individual entries
 * as new seasonal assets are uploaded — no other code changes required.
 */
import fernBg from "@/assets/fern-bg.webp.asset.json";
import whirlwindBg from "@/assets/whirlwind-bg.webp.asset.json";

const FALLBACK = fernBg.url;

// Keyed by lowercase Creator Type. Swap in per-type CDN URLs as they're added.
const SEASONAL_BG: Record<string, string> = {
  lava: FALLBACK,
  fire: FALLBACK,
  whirlwind: whirlwindBg.url,
  snow: FALLBACK,
  lightning: FALLBACK,
  sun: FALLBACK,
  lake: FALLBACK,
  ocean: FALLBACK,
  tree: FALLBACK,
  mountain: FALLBACK,
  soil: FALLBACK,
  river: FALLBACK,
  sky: FALLBACK,
};

export function backgroundForSeason(creatorType?: string | null): string {
  if (!creatorType) return FALLBACK;
  return SEASONAL_BG[creatorType.toLowerCase()] ?? FALLBACK;
}
