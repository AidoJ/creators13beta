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

export const CREATOR_TYPE_GLYPHS: Record<string, string> = {
  Lava, Fire, Whirlwind, Snow, Lightning, Sun, Lake, Ocean, Tree, Mountain, Soil, River, Sky,
};

/** Representative glyph for each of the 4 elements (used by element Creator cards). */
export const ELEMENT_GLYPHS: Record<string, string> = {
  Fire,        // Fire element → Fire glyph
  Air: Whirlwind,
  Water: Ocean,
  Earth: Tree,
  Sky,
};

export function glyphForType(name?: string): string | undefined {
  if (!name) return undefined;
  return CREATOR_TYPE_GLYPHS[name];
}
