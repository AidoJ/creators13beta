import { describe, it, expect } from "vitest";
import type { GameCard } from "@/lib/gameCards";
import {
  createMatch,
  placeCard,
  discardCard,
  canPlace,
  evaluatePlacement,
  typeAtEdge,
  OPPOSITE_EDGE,
  neighbour,
  type MatchState,
} from "@/lib/game";

function mkCard(slug: string, a: any, b: any, mythical = false): GameCard {
  return {
    id: slug,
    slug,
    name: slug,
    type_a: a,
    type_b: b,
    types: [a, b],
    mythical,
    descriptor: null,
    art_path: null,
    art_url: null,
    sort_order: 0,
  };
}

// Deterministic shuffle replacement.
const seed = (n: number) => {
  let s = n;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

describe("rotation / type-at-edge", () => {
  it("rotation 0: edges 5,0,1 = typeA; edges 2,3,4 = typeB", () => {
    const c = mkCard("fox", "Lava", "Fire");
    expect(typeAtEdge(c, 0, 0)).toBe("Lava");
    expect(typeAtEdge(c, 0, 1)).toBe("Lava");
    expect(typeAtEdge(c, 0, 5)).toBe("Lava");
    expect(typeAtEdge(c, 0, 2)).toBe("Fire");
    expect(typeAtEdge(c, 0, 3)).toBe("Fire");
    expect(typeAtEdge(c, 0, 4)).toBe("Fire");
  });
  it("rotating by 3 swaps the halves", () => {
    const c = mkCard("fox", "Lava", "Fire");
    expect(typeAtEdge(c, 3, 0)).toBe("Fire");
    expect(typeAtEdge(c, 3, 3)).toBe("Lava");
  });
});

describe("placement & matching", () => {
  it("first card is always placeable at origin", () => {
    const board = new Map<string, any>();
    const c = mkCard("fox", "Lava", "Fire");
    expect(canPlace(c, { q: 0, r: 0 }, board)).toBe(true);
  });

  it("auto-rotates to maximise matching edges with a Lava neighbour", () => {
    const lavaTile = mkCard("lava", "Lava", "Lava"); // pure Lava
    const fox = mkCard("fox", "Lava", "Fire");

    const m: MatchState["board"] = new Map();
    m.set("0,0", { card: lavaTile, pos: { q: 0, r: 0 }, rotation: 0, ownerId: "p1" });

    // Place fox at E neighbour of origin → edge from fox back to origin is W (4)
    const pos = neighbour({ q: 0, r: 0 }, 1);
    const { best } = evaluatePlacement(fox, pos, m);
    expect(best.matchingEdges).toBeGreaterThanOrEqual(1);
    // The matched edge on fox must be the W edge (edge 4) — that's what touches the lava tile
    expect(best.matchedEdgeIndices).toContain(4);
    // And the type sitting on fox's W edge at the chosen rotation must be Lava
    expect(typeAtEdge(fox, best.rotation, 4)).toBe("Lava");
  });

  it("rejects a placement that has no matching neighbour edge", () => {
    const skyTile = mkCard("sky-pure", "Sky", "Sky");
    const fox = mkCard("fox", "Lava", "Fire"); // shares no type with Sky
    const m: MatchState["board"] = new Map();
    m.set("0,0", { card: skyTile, pos: { q: 0, r: 0 }, rotation: 0, ownerId: "p1" });
    const pos = neighbour({ q: 0, r: 0 }, 1);
    expect(canPlace(fox, pos, m)).toBe(false);
  });
});

describe("match engine end-to-end", () => {
  const deck = [
    mkCard("a", "Lava", "Fire"),
    mkCard("b", "Lava", "Mountain"),
    mkCard("c", "Fire", "Sun"),
    mkCard("d", "Mountain", "Tree"),
    mkCard("e", "Sun", "Sky"),
    mkCard("f", "Tree", "Soil"),
    mkCard("g", "Lava", "Lake"),
    mkCard("h", "Fire", "Mountain"),
    mkCard("i", "Lava", "River"),
    mkCard("j", "Fire", "Lake"),
    mkCard("k", "Lava", "Ocean"),
    mkCard("l", "Fire", "Whirlwind"),
  ];

  it("creates a match with dealt hands", () => {
    const s = createMatch({
      players: [
        { id: "p1", name: "P1" },
        { id: "p2", name: "P2" },
      ],
      deck,
      rand: seed(42),
    });
    expect(s.players).toHaveLength(2);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.deck).toHaveLength(2);
    expect(s.turn).toBe(0);
  });

  it("places a card, awards points, advances turn, draws a replacement", () => {
    let s = createMatch({
      players: [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }],
      deck,
      rand: seed(42),
    });
    const firstCard = s.players[0].hand[0];
    const r1 = placeCard(s, firstCard.slug, { q: 0, r: 0 });
    s = r1.state;
    expect(s.board.size).toBe(1);
    expect(s.players[0].hand).toHaveLength(5); // drew a replacement
    expect(s.turn).toBe(1);
    expect(s.turnNumber).toBe(1);
  });

  it("discard moves the card to discard pile and advances turn", () => {
    let s = createMatch({
      players: [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }],
      deck,
      rand: seed(7),
    });
    const slug = s.players[0].hand[0].slug;
    s = discardCard(s, slug);
    expect(s.discard).toHaveLength(1);
    expect(s.turn).toBe(1);
  });
});
