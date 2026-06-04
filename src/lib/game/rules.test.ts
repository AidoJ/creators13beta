import { describe, expect, it } from "vitest";
import { placeOnEcosystem, playDisaster, skyLockedSubType, validateEcosystemWin } from "./engine";
import { bestRotationForPlacement, facingTypeLabel } from "./rotation";
import type { DeckCard, MatchState, PlayerState } from "./types";
import type { Element } from "./elements";
import type { CreatorTypeName } from "@/lib/gameCards";

const BASE_HALVES = ["B", "A", "A", "A", "B", "B"] as const;
const NEI = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function rotationFacing(dirToCreator: number, half: "A" | "B"): number {
  return [0, 1, 2, 3, 4, 5].find((rot) => BASE_HALVES[(dirToCreator - rot + 6) % 6] === half) ?? 0;
}

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
  const placed = new Map<string, { card: DeckCard; pos: { q: number; r: number }; rotation?: number }>();
  // Place clusters far apart so no cross-cluster adjacency leaks in.
  clusters.forEach((group, i) => {
    const origin = { q: i * 10, r: i * 10 };
    const [creator, ...animals] = group;
      const targetType = creator.kind === "creator" ? creator.displayType : animals.find((a) => a.types?.[0])?.types?.[0];
    placed.set(`${origin.q},${origin.r}`, { card: creator, pos: origin });
    animals.forEach((a, j) => {
      const off = NEI[j];
      const pos = { q: origin.q + off.q, r: origin.r + off.r };
      const half = targetType && a.types?.[1] === targetType && a.types?.[0] !== targetType ? "B" : "A";
      const rotation = a.kind === "golden_body" ? 0 : rotationFacing((j + 3) % 6, half);
      placed.set(`${pos.q},${pos.r}`, { card: a, pos, rotation });
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

  it("allows Sky Creator to lock onto its 3 adjacent matching animals' type", () => {
    // Per rule book: Sky locks to a sub-type once ≥3 adjacent animals share
    // that type. Here Sky is surrounded by 3 Lightning/Snow animals → locks
    // to Lightning (Air element). Quartet Air/Fire/Earth/Water is satisfied.
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

    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("counts Sky Creator as the matching animal type even when that type is not the currently facing half", () => {
    const placed = new Map<string, { card: DeckCard; pos: { q: number; r: number }; rotation?: number }>();
    const sky = skyCreator();
    const skyPos = { q: 0, r: 0 };
    placed.set("0,0", { card: sky, pos: skyPos });

    [
      animal("soil-side-0", ["Fire", "Soil"]),
      animal("soil-side-1", ["Ocean", "Soil"]),
      animal("soil-side-2", ["Snow", "Soil"]),
    ].forEach((a, j) => {
      const off = NEI[j];
      const pos = { q: skyPos.q + off.q, r: skyPos.r + off.r };
      const dirToSky = NEI.findIndex((d) => pos.q + d.q === skyPos.q && pos.r + d.r === skyPos.r);
      // Deliberately rotate the non-Soil half toward Sky. Sky should still be
      // allowed to substitute as Soil because these are Soil animals.
      placed.set(`${pos.q},${pos.r}`, { card: a, pos, rotation: rotationFacing(dirToSky, "A") });
    });

    [
      [creator("Fire", "Fire"), ...Array.from({ length: 3 }, (_, i) => animal(`fire-sky-${i}`, ["Fire", "Sun"]))],
      [creator("Snow", "Air"), ...Array.from({ length: 3 }, (_, i) => animal(`snow-sky-${i}`, ["Snow", "Lightning"]))],
      [creator("Ocean", "Water"), ...Array.from({ length: 3 }, (_, i) => animal(`ocean-sky-${i}`, ["Ocean", "River"]))],
    ].forEach((group, i) => {
      const origin = { q: (i + 1) * 10, r: 0 };
      const [c, ...animals] = group;
      placed.set(`${origin.q},${origin.r}`, { card: c, pos: origin });
      animals.forEach((a, j) => {
        const off = NEI[j];
        const pos = { q: origin.q + off.q, r: origin.r + off.r };
        placed.set(`${pos.q},${pos.r}`, { card: a, pos, rotation: rotationFacing((j + 3) % 6, "A") });
      });
    });

    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [], hiveShield: false, score: 0,
      ecosystem: { placed },
    };

    expect(skyLockedSubType(p.ecosystem, skyPos)).toBe("Soil");
    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("allows a Disaster when Sky is the missing fourth element via its adjacent animal type", () => {
    const p = buildPlayer([
      [skyCreator(),
        animal("soil-disaster-0", ["Fire", "Soil"]),
        animal("soil-disaster-1", ["Ocean", "Soil"]),
        animal("soil-disaster-2", ["Snow", "Soil"])],
      [creator("Fire", "Fire"), animal("fire-disaster-0", ["Fire", "Sun"])],
      [creator("Snow", "Air"), animal("snow-disaster-0", ["Snow", "Lightning"])],
      [creator("Ocean", "Water"), animal("ocean-disaster-0", ["Ocean", "River"])],
    ], [creator("Lake", "Water")]);
    const skyPc = Array.from(p.ecosystem.placed.values()).find((pc) => pc.card.kind === "sky_creator")!;
    for (const pc of Array.from(p.ecosystem.placed.values())) {
      if (!pc.card.types?.includes("Soil")) continue;
      const dirToSky = NEI.findIndex((d) => pc.pos.q + d.q === skyPc.pos.q && pc.pos.r + d.r === skyPc.pos.r);
      p.ecosystem.placed.set(`${pc.pos.q},${pc.pos.r}`, { ...pc, rotation: rotationFacing(dirToSky, "A") });
    }

    const state: MatchState = {
      players: [p, buildPlayer([])], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };

    expect(() => playDisaster(state, p.hand[0].uid)).not.toThrow();
  });

  it("accepts the screenshot-style hand: Sky subbed as Fire, Snow Air, Mountain Earth, Lake Water with Golden Body", () => {
    const p = buildPlayer([
      [creator("Snow", "Air"),
        animal("duck", ["Snow", "River"]),
        animal("spider", ["Snow", "Tree"]),
        animal("leopard", ["Snow", "Mountain"])],
      [skyCreator(),
        animal("fox", ["Lava", "Fire"]),
        animal("cheetah", ["Fire", "Lightning"]),
        animal("gorilla", ["Fire", "Mountain"]),
        animal("mouse", ["Fire", "Snow"])],
      [creator("Mountain", "Earth"),
        animal("lynx", ["Mountain", "Snow"]),
        animal("gorilla-2", ["Fire", "Mountain"]),
        animal("leopard-2", ["Snow", "Mountain"])],
      [creator("Lake", "Water"),
        animal("panda", ["Fire", "Lake"]),
        animal("swan", ["Snow", "Lake"]),
        goldenBody("golden-body")],
    ]);
    const skyPc = Array.from(p.ecosystem.placed.values()).find((pc) => pc.card.kind === "sky_creator")!;
    const skyAnimals = Array.from(p.ecosystem.placed.values()).filter((pc) => pc.pos.q >= 10 && pc.pos.q <= 11 && pc.pos.r >= 9 && pc.pos.r <= 11 && pc.card.kind === "animal");
    skyAnimals.forEach((pc) => {
      const dirToSky = NEI.findIndex((d) => pc.pos.q + d.q === skyPc.pos.q && pc.pos.r + d.r === skyPc.pos.r);
      const fireIsSecondHalf = pc.card.types?.[1] === "Fire";
      p.ecosystem.placed.set(`${pc.pos.q},${pc.pos.r}`, { ...pc, rotation: rotationFacing(dirToSky, fireIsSecondHalf ? "B" : "A") });
    });

    expect(skyLockedSubType(p.ecosystem, skyPc.pos)).toBe("Fire");
    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("accepts a complete ecosystem even if a matching animal is visually mis-rotated", () => {
    const p = buildPlayer([
      [creator("Snow", "Air"),
        animal("snow-0", ["Snow", "Lightning"]),
        animal("snow-1", ["Snow", "Lightning"]),
        animal("snow-2", ["Snow", "Lightning"])],
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
    const badKey = "1,0";
    const badPc = p.ecosystem.placed.get(badKey)!;
    p.ecosystem.placed.set(badKey, { ...badPc, rotation: 5 });
    expect(validateEcosystemWin(p).valid).toBe(true);
  });

  it("auto-pivots an animal so its exact Creator Type half faces the adjacent Creator", () => {
    const soil = creator("Soil", "Earth");
    const bear = animal("bear", ["Lava", "Soil"]);
    const eco = {
      placed: new Map<string, { card: DeckCard; pos: { q: number; r: number }; rotation?: number }>([
        ["0,0", { card: soil, pos: { q: 0, r: 0 }, rotation: 0 }],
      ]),
    };
    const pos = { q: 1, r: 0 };
    const dirToCreator = NEI.findIndex((d) => pos.q + d.q === 0 && pos.r + d.r === 0);
    const rotation = bestRotationForPlacement(eco, bear, pos, { restrictTo: "creator-only", driverPos: { q: 0, r: 0 } });

    expect(facingTypeLabel(bear, rotation, dirToCreator)).toBe("Soil");
  });

  it("auto-pivots the third animal that makes a Sky Creator lock to a sub-type", () => {
    const sky = skyCreator();
    const soilAnimalA = animal("soil-a", ["Fire", "Soil"]);
    const soilAnimalB = animal("soil-b", ["Ocean", "Soil"]);
    const soilAnimalC = animal("soil-c", ["Snow", "Soil"]);
    const p: PlayerState = {
      id: "p1",
      name: "Goldie",
      hand: [soilAnimalC],
      hiveShield: false,
      score: 0,
      firstPickupDone: true,
      ecosystem: {
        placed: new Map([
          ["0,0", { card: sky, pos: { q: 0, r: 0 } }],
          ["1,0", { card: soilAnimalA, pos: { q: 1, r: 0 }, rotation: 0 }],
          ["1,-1", { card: soilAnimalB, pos: { q: 1, r: -1 }, rotation: 0 }],
        ]),
      },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    const next = placeOnEcosystem(state, soilAnimalC.uid, { q: 0, r: -1 });
    const placed = next.players[0].ecosystem.placed.get("0,-1")!;
    const dirToSky = NEI.findIndex((d) => placed.pos.q + d.q === 0 && placed.pos.r + d.r === 0);

    expect(skyLockedSubType(next.players[0].ecosystem, { q: 0, r: 0 })).toBe("Soil");
    expect(facingTypeLabel(placed.card, placed.rotation ?? 0, dirToSky)).toBe("Soil");
  });

  it("rejects Sky Creator with no adjacent animals (no sub-type can lock)", () => {
    // Sky placed alone; the other 3 creators have their own clusters.
    // Sky cannot contribute any element → quartet incomplete → no win.
    const p = buildPlayer([
      [skyCreator()],
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