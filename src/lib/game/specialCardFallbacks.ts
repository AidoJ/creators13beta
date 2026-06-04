import { CREATOR_TYPE_GLYPHS } from "@/lib/game/glyphs";
import goldenBodyArt from "@/assets/golden-body-card.webp";
import goldenHiveArt from "@/assets/golden-hive-card.webp";

export function getSpecialCardFallbackArt(slug: string): string | null {
  if (slug.startsWith("creator-")) {
    const typeName = slug
      .replace(/^creator-/, "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    return CREATOR_TYPE_GLYPHS[typeName] ?? null;
  }

  if (slug === "sky-creator") return CREATOR_TYPE_GLYPHS.Sky ?? null;
  if (slug === "golden-body") return goldenBodyArt;
  if (slug === "golden-hive") return goldenHiveArt;

  return null;
}

export function getSpecialCardFallbackDescriptor(card: {
  kind?: string | null;
  displayType?: string | null;
  element?: string | null;
}): string {
  switch (card.kind) {
    case "creator":
      return `${card.displayType ?? card.element ?? "Creator"} Creator Card (${card.element ?? "Unknown"} element). Place 4 Creator Cards in your ecosystem to anchor your Animals. Extra Creators can be played as a Disaster — they wipe matching Animals from rival ecosystems.`;
    case "sky_creator":
      return "Sky Creator (wildcard). Counts as any element when matching Animals. After your 4 Creators are placed, can also be played as a Disaster.";
    case "golden_body":
      return "A body made of gold is the alchemy of all forms, granting the skin of any species to be worn.";
    case "golden_hive":
      return "At the heart of the ecosystem lies the pot of gold, where Immunity is granted for the good of the whole.";
    default:
      return "";
  }
}
