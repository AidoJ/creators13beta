import type { CreatorTypeName } from "@/lib/gameCards";

/** The four classical elements that form the centre of an ecosystem. */
export type Element = "Earth" | "Fire" | "Air" | "Water";

/** Maps each of the 13 Creator Types to one of the 4 elements (Sky is its own wildcard). */
export const TYPE_TO_ELEMENT: Record<CreatorTypeName, Element | "Sky"> = {
  Lava: "Fire",
  Fire: "Fire",
  Sun: "Fire",
  Whirlwind: "Air",
  Lightning: "Air",
  Snow: "Water",
  Lake: "Water",
  Ocean: "Water",
  River: "Water",
  Tree: "Earth",
  Mountain: "Earth",
  Soil: "Earth",
  Sky: "Sky",
};

export const ELEMENT_COLORS: Record<Element | "Sky", string> = {
  Earth: "#7d5a3a",
  Fire: "#e85500",
  Air: "#c2e5cf",
  Water: "#1b3fb5",
  Sky: "#bdb2e5",
};

export const ELEMENTS: Element[] = ["Earth", "Fire", "Air", "Water"];
