import { describe, expect, it } from "vitest";
import { validateEcosystemWin } from "./engine";
import type { DeckCard, PlayerState } from "./types";
import type { Element } from "./elements";
import type { CreatorTypeName } from "@/lib/gameCards";

const creator = (type: CreatorTypeName, element: Element): DeckCard => ({
  uid: `creator-${type}`,
  kind: "creator",
  name: `${type} Creator`,
  displayType: type,
  element,
});

const animal = (name: string, types: CreatorTypeName[]): DeckCard => ({
  uid: name,
  kind: "animal",
  name,
  types: types as [CreatorTypeName, CreatorTypeName],
});

const goldenBody = (uid: string): DeckCard => ({ uid, kind: "golden_body", name: "Golden Body" });
const skyCreator = (): DeckCard => ({ uid: "sky-creator", kind: "sky_creator", name: "Sky Creator" });

function player(cards: DeckCard[], hand: DeckCard[] = []): PlayerState {
  return {
    id: "p1",
    name: "Goldie",
    hand,
    hiveShield: false,
    score: 0,
    ecosystem: {
      placed: new Map(cards.map((card, i) => [`${i},0`, { card, pos: { q: i, r: 0 } }])),
    },
  };
}

describe("classic ecosystem win validation", () => {
  it("rejects a full-looking board with 4 creators but missing one element", () => {
    const p = player([
      creator("Fire", "Fire"),
      creator("Soil", "Earth"),
      creator("Ocean", "Water"),
      creator("Lake", "Water"),
      ...Array.from({ length: 3 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`lake-${i}`, ["Lake", "River"])),
    ]);

    const result = validateEcosystemWin(p);
    expect(result.valid).toBe(false);
    expect(result.hasElementCoverage).toBe(false);
  });

  it("rejects a player who still has any creator card in hand", () => {
    const p = player([
      creator("Snow", "Air"),
      creator("Fire", "Fire"),
      creator("Soil", "Earth"),
      creator("Ocean", "Water"),
      ...Array.from({ length: 3 }, (_, i) => animal(`snow-${i}`, ["Snow", "Lightning"])),
      ...Array.from({ length: 2 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"])),
      goldenBody("golden-body"),
      ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"])),
    ], [creator("Lightning", "Air")]);

    expect(validateEcosystemWin(p).valid).toBe(false);
  });

  it("accepts four elements with three matching animals per chosen creator", () => {
    const p = player([
      creator("Snow", "Air"),
      creator("Fire", "Fire"),
      creator("Soil", "Earth"),
      creator("Ocean", "Water"),
      ...Array.from({ length: 3 }, (_, i) => animal(`snow-${i}`, ["Snow", "Lightning"])),
      ...Array.from({ length: 2 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"])),
      goldenBody("golden-body"),
      ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"])),
    ]);

    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("does not let Sky Creator satisfy three arbitrary non-Sky animals", () => {
    const p = player([
      skyCreator(),
      creator("Fire", "Fire"),
      creator("Soil", "Earth"),
      creator("Ocean", "Water"),
      ...Array.from({ length: 3 }, (_, i) => animal(`lightning-${i}`, ["Lightning", "Snow"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"])),
    ]);

    expect(validateEcosystemWin(p).valid).toBe(false);
  });
});