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

/** Build a player whose ecosystem places each creator at a hub and its 3
 *  associated animals on neighbouring hexes (so the win validator's
 *  adjacency rule is satisfied). `clusters` is an array of
 *  `[creator, ...animals]` groups laid out at distinct origins. */
function buildPlayer(clusters: DeckCard[][], hand: DeckCard[] = []): PlayerState {
  // Six axial neighbour offsets around (0,0).
  const NEI = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const placed = new Map<string, { card: DeckCard; pos: { q: number; r: number } }>();
  // Place clusters far apart so no cross-cluster adjacency leaks in.
  clusters.forEach((group, i) => {
    const origin = { q: i * 10, r: i * 10 };
    const [creator, ...animals] = group;
    placed.set(`${origin.q},${origin.r}`, { card: creator, pos: origin });
    animals.forEach((a, j) => {
      const off = NEI[j];
      const pos = { q: origin.q + off.q, r: origin.r + off.r };
      placed.set(`${pos.q},${pos.r}`, { card: a, pos });
    });
  });
  return {
    id: "p1",
    name: "Goldie",
    hand,
    hiveShield: false,
    score: 0,
    ecosystem: { placed },
  };
}

describe("classic ecosystem win validation", () => {
  it("rejects a full-looking board with 4 creators but missing one element", () => {
    const p = buildPlayer([
      [creator("Fire", "Fire"), ...Array.from({ length: 3 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"]))],
      [creator("Soil", "Earth"), ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"]))],
      [creator("Ocean", "Water"), ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"]))],
      [creator("Lake", "Water"), ...Array.from({ length: 3 }, (_, i) => animal(`lake-${i}`, ["Lake", "River"]))],
    ]);

    const result = validateEcosystemWin(p);
    expect(result.valid).toBe(false);
    expect(result.hasElementCoverage).toBe(false);
  });

  it("rejects a player who still has any creator card in hand", () => {
    const p = buildPlayer([
      [creator("Snow", "Air"),
        animal("snow-0", ["Snow", "Lightning"]),
        animal("snow-1", ["Snow", "Lightning"]),
        animal("snow-2", ["Snow", "Lightning"])],
      [creator("Fire", "Fire"),
        animal("fire-0", ["Fire", "Sun"]),
        animal("fire-1", ["Fire", "Sun"]),
        goldenBody("golden-body")],
      [creator("Soil", "Earth"),
        animal("soil-0", ["Soil", "Tree"]),
        animal("soil-1", ["Soil", "Tree"]),
        animal("soil-2", ["Soil", "Tree"])],
      [creator("Ocean", "Water"),
        animal("ocean-0", ["Ocean", "River"]),
        animal("ocean-1", ["Ocean", "River"]),
        animal("ocean-2", ["Ocean", "River"])],
    ], [creator("Lightning", "Air")]);

    expect(validateEcosystemWin(p).valid).toBe(false);
  });

  it("accepts four elements with three matching animals per chosen creator", () => {
    const p = buildPlayer([
      [creator("Snow", "Air"),
        animal("snow-0", ["Snow", "Lightning"]),
        animal("snow-1", ["Snow", "Lightning"]),
        animal("snow-2", ["Snow", "Lightning"])],
      [creator("Fire", "Fire"),
        animal("fire-0", ["Fire", "Sun"]),
        animal("fire-1", ["Fire", "Sun"]),
        goldenBody("golden-body")],
      [creator("Soil", "Earth"),
        animal("soil-0", ["Soil", "Tree"]),
        animal("soil-1", ["Soil", "Tree"]),
        animal("soil-2", ["Soil", "Tree"])],
      [creator("Ocean", "Water"),
        animal("ocean-0", ["Ocean", "River"]),
        animal("ocean-1", ["Ocean", "River"]),
        animal("ocean-2", ["Ocean", "River"])],
    ]);

    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("does not let Sky Creator satisfy three arbitrary non-Sky animals", () => {
    const p = buildPlayer([
      [skyCreator(),
        animal("lightning-0", ["Lightning", "Snow"]),
        animal("lightning-1", ["Lightning", "Snow"]),
        animal("lightning-2", ["Lightning", "Snow"])],
      [creator("Fire", "Fire"),
        animal("fire-0", ["Fire", "Sun"]),
        animal("fire-1", ["Fire", "Sun"]),
        animal("fire-2", ["Fire", "Sun"])],
      [creator("Soil", "Earth"),
        animal("soil-0", ["Soil", "Tree"]),
        animal("soil-1", ["Soil", "Tree"]),
        animal("soil-2", ["Soil", "Tree"])],
      [creator("Ocean", "Water"),
        animal("ocean-0", ["Ocean", "River"]),
        animal("ocean-1", ["Ocean", "River"]),
        animal("ocean-2", ["Ocean", "River"])],
    ]);

    expect(validateEcosystemWin(p).valid).toBe(false);
  });

  it("rejects animals that match by type but are NOT adjacent to their creator", () => {
    // All 4 creators + animals scattered far away from any creator hex.
    const NEI = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }];
    const placed = new Map<string, { card: DeckCard; pos: { q: number; r: number } }>();
    const c1 = creator("Snow", "Air");
    const c2 = creator("Fire", "Fire");
    const c3 = creator("Soil", "Earth");
    const c4 = creator("Ocean", "Water");
    [c1, c2, c3, c4].forEach((c, i) => {
      const pos = { q: i * 10, r: 0 };
      placed.set(`${pos.q},${pos.r}`, { card: c, pos });
    });
    // Animals far from any creator (q=100,r=100 region).
    const animals = [
      ...Array.from({ length: 3 }, (_, i) => animal(`snow-${i}`, ["Snow", "Lightning"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`fire-${i}`, ["Fire", "Sun"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`soil-${i}`, ["Soil", "Tree"])),
      ...Array.from({ length: 3 }, (_, i) => animal(`ocean-${i}`, ["Ocean", "River"])),
    ];
    animals.forEach((a, i) => {
      const pos = { q: 100 + i, r: 100 };
      placed.set(`${pos.q},${pos.r}`, { card: a, pos });
    });
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [], hiveShield: false, score: 0,
      ecosystem: { placed },
    };
    expect(validateEcosystemWin(p).valid).toBe(false);
  });
});