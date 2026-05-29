// Full hex-tile glyphs (used for type chips, creator card art, etc.)
import Lava from "@/assets/glyphs/Glyph_LAVA.png";
import Fire from "@/assets/glyphs/Glyph_FIRE.png";
import Whirlwind from "@/assets/glyphs/Glyph_WHIRLWIND.png";
import Snow from "@/assets/glyphs/Glyph_SNOW.png";
import Lightning from "@/assets/glyphs/Glyph_LIGHTNING.png";
import Sun from "@/assets/glyphs/Glyph_SUN.png";
import Lake from "@/assets/glyphs/Glyph_LAKE.png";
import Ocean from "@/assets/glyphs/Glyph_OCEAN.png";
import Tree from "@/assets/glyphs/Glyph_TREE.png";
import Mountain from "@/assets/glyphs/Glyph_MOUNTAIN.png";
import Soil from "@/assets/glyphs/Glyph_SOIL.png";
import River from "@/assets/glyphs/Glyph_RIVER.png";
import Sky from "@/assets/glyphs/Glyph_SKY.png";

// Background-stripped, pure white silhouette versions
// (icon only — no hex tile, no border). Use these as overlays.
import LavaS from "@/assets/glyphs/silhouette/Glyph_LAVA.png";
import FireS from "@/assets/glyphs/silhouette/Glyph_FIRE.png";
import WhirlwindS from "@/assets/glyphs/silhouette/Glyph_WHIRLWIND.png";
import SnowS from "@/assets/glyphs/silhouette/Glyph_SNOW.png";
import LightningS from "@/assets/glyphs/silhouette/Glyph_LIGHTNING.png";
import SunS from "@/assets/glyphs/silhouette/Glyph_SUN.png";
import LakeS from "@/assets/glyphs/silhouette/Glyph_LAKE.png";
import OceanS from "@/assets/glyphs/silhouette/Glyph_OCEAN.png";
import TreeS from "@/assets/glyphs/silhouette/Glyph_TREE.png";
import MountainS from "@/assets/glyphs/silhouette/Glyph_MOUNTAIN.png";
import SoilS from "@/assets/glyphs/silhouette/Glyph_SOIL.png";
import RiverS from "@/assets/glyphs/silhouette/Glyph_RIVER.png";
import SkyS from "@/assets/glyphs/silhouette/Glyph_SKY.png";

export const CREATOR_TYPE_GLYPHS: Record<string, string> = {
  Lava, Fire, Whirlwind, Snow, Lightning, Sun, Lake, Ocean, Tree, Mountain, Soil, River, Sky,
};

/** Icon-only white silhouettes (transparent background) for overlays. */
export const CREATOR_TYPE_GLYPH_MARKS: Record<string, string> = {
  Lava: LavaS, Fire: FireS, Whirlwind: WhirlwindS, Snow: SnowS,
  Lightning: LightningS, Sun: SunS, Lake: LakeS, Ocean: OceanS,
  Tree: TreeS, Mountain: MountainS, Soil: SoilS, River: RiverS, Sky: SkyS,
};

/** Representative glyph for each of the 4 elements (used by element Creator cards).
 *  Mapped to the canonical Creator Type that matches each element's palette:
 *  Earth → Soil, Fire → Fire, Air → Whirlwind, Water → Ocean. */
export const ELEMENT_GLYPHS: Record<string, string> = {
  Fire,
  Air: Whirlwind,
  Water: Ocean,
  Earth: Soil,
  Sky,
};

export function glyphForType(name?: string): string | undefined {
  if (!name) return undefined;
  return CREATOR_TYPE_GLYPHS[name];
}

export function glyphMarkForType(name?: string): string | undefined {
  if (!name) return undefined;
  return CREATOR_TYPE_GLYPH_MARKS[name];
}
