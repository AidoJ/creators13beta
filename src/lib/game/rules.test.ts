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
const skyCreature = (uid: string, types: CreatorTypeName[] = ["Sky", "Sky"]): DeckCard => ({
  uid, kind: "sky_creature", name: uid, types: types as [CreatorTypeName, CreatorTypeName],
});

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

  it("Sky Creator with 3 adjacent Sky Creatures (cluster) fills the missing element as a wildcard", () => {
    // New rule: only Sky Creatures may sit adjacent to a Sky Creator, and a
    // full cluster (3 Sky Creatures) lets the Sky Creator stand in for
    // whichever of Earth/Fire/Air/Water is otherwise missing.
    const p = buildPlayer([
      [skyCreator(),
        skyCreature("myth-0"),
        skyCreature("myth-1"),
        skyCreature("myth-2")],
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

  it("Sky Creator never locks to a regular animal sub-type (skyLockedSubType is always null)", () => {
    const p = buildPlayer([
      [skyCreator(),
        skyCreature("myth-0"),
        skyCreature("myth-1"),
        skyCreature("myth-2")],
    ]);
    const skyPc = Array.from(p.ecosystem.placed.values()).find((pc) => pc.card.kind === "sky_creator")!;
    expect(skyLockedSubType(p.ecosystem, skyPc.pos)).toBeNull();
  });

  it("allows a Disaster when Sky cluster fills the missing fourth element", () => {
    const p = buildPlayer([
      [skyCreator(),
        skyCreature("myth-0"),
        skyCreature("myth-1"),
        skyCreature("myth-2")],
      [creator("Fire", "Fire"), animal("fire-disaster-0", ["Fire", "Sun"])],
      [creator("Snow", "Air"), animal("snow-disaster-0", ["Snow", "Lightning"])],
      [creator("Ocean", "Water"), animal("ocean-disaster-0", ["Ocean", "River"])],
    ], [creator("Lake", "Water")]);

    const state: MatchState = {
      players: [p, buildPlayer([])], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };

    expect(() => playDisaster(state, p.hand[0].uid)).not.toThrow();
  });

  it("rejects placing a regular animal adjacent to a Sky Creator", () => {
    const sky = skyCreator();
    const bear = animal("bear", ["Soil", "Tree"]);
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [bear], hiveShield: false, score: 0, firstPickupDone: true,
      ecosystem: { placed: new Map([["0,0", { card: sky, pos: { q: 0, r: 0 } }]]) },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    expect(() => placeOnEcosystem(state, bear.uid, { q: 1, r: 0 })).toThrowError(/Only Sky Creature/);
  });

  it("allows animal neighbours when they share a Creator Type anywhere on the card", () => {
    const otter = animal("otter", ["Fire", "River"]);
    const duck = animal("duck", ["Snow", "River"]);
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [duck], hiveShield: false, score: 0, firstPickupDone: true,
      ecosystem: { placed: new Map([["0,0", { card: otter, pos: { q: 0, r: 0 }, rotation: 0 }]]) },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    const next = placeOnEcosystem(state, duck.uid, { q: 1, r: 0 });
    expect(next.players[0].ecosystem.placed.has("1,0")).toBe(true);
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

  it("allows placing a Sky Creature next to a Sky Creator (cells reserved for Sky Creatures)", () => {
    const sky = skyCreator();
    const myth = skyCreature("griffin");
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [myth], hiveShield: false, score: 0, firstPickupDone: true,
      ecosystem: { placed: new Map([["0,0", { card: sky, pos: { q: 0, r: 0 } }]]) },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    const next = placeOnEcosystem(state, myth.uid, { q: 1, r: 0 });
    expect(next.players[0].ecosystem.placed.has("1,0")).toBe(true);
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

  it("strict adjacency: rejects an animal next to a Creator whose type the animal does not share", () => {
    // Soil Creator at origin. Swordfish (Ocean/River) tries to land next to it
    // → no shared type with Soil → illegal.
    const soil = creator("Soil", "Earth");
    const swordfish = animal("swordfish", ["Ocean", "River"]);
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [swordfish], hiveShield: false, score: 0, firstPickupDone: true,
      ecosystem: { placed: new Map([["0,0", { card: soil, pos: { q: 0, r: 0 } }]]) },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    expect(() => placeOnEcosystem(state, swordfish.uid, { q: 1, r: 0 })).toThrowError(/share a Creator Type/);
  });

  it("client scenario: Soil Creator → Alpaca legal on one side, Swordfish illegal on another side of the same Creator", () => {
    const soil = creator("Soil", "Earth");
    const alpaca = animal("alpaca", ["Soil", "Tree"]);
    const swordfish = animal("swordfish", ["Ocean", "River"]);
    const p: PlayerState = {
      id: "p1", name: "Goldie", hand: [alpaca, swordfish], hiveShield: false, score: 0, firstPickupDone: true,
      ecosystem: { placed: new Map([["0,0", { card: soil, pos: { q: 0, r: 0 } }]]) },
    };
    const state: MatchState = {
      players: [p], turn: 0, draw: [], used: [], phase: "place", drawnThisTurn: 2, placedThisTurn: 0,
      turnNumber: 1, finished: false, winnerId: null,
    };
    // Alpaca touches Soil Creator's east side → shares Soil → legal.
    const afterAlpaca = placeOnEcosystem(state, alpaca.uid, { q: 1, r: 0 });
    expect(afterAlpaca.players[0].ecosystem.placed.has("1,0")).toBe(true);
    // Swordfish on the opposite side of the same Soil Creator → no shared
    // type with Soil → still rejected (Creator is NOT a wildcard).
    expect(() => placeOnEcosystem(afterAlpaca, swordfish.uid, { q: -1, r: 0 })).toThrowError(/share a Creator Type/);
  });
});