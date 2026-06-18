/**
 * A.3 — programmatic smoke tests for the multiplayer engine end-to-end.
 *
 * These exercise the ENGINE-LEVEL pieces wired into apply-move:
 *   - Concede ranks-from-bottom (so quitters can't out-rank finishers).
 *   - 4-player single-Hive Disaster wipe (multiple victims, one blocker).
 *   - Pile-exhaustion finalise ranks remaining actives by score.
 *   - 2-player concede regression — identical legacy placement / winnerId.
 *
 * Live multi-client testing (Stage 2) is performed manually through the
 * dev-create-multiplayer-match affordance.
 */
import { describe, expect, it } from "vitest";
import {
  concedePlayer,
  createMatch,
  endTurnEarly,
  finaliseByScore,
  isUsedTopPickable,
  pickFromDraw,
  pickFromUsed,
  playDisaster,
  reshuffleUsedIntoDraw,
  resolveDisaster,
} from "./engine";

import type { DeckCard, MatchState, PlayerState } from "./types";
import type { CreatorTypeName } from "@/lib/gameCards";
import type { Element } from "./elements";

const creator = (type: CreatorTypeName, element: Element): DeckCard => ({
  uid: `creator-${type}`,
  kind: "creator",
  name: `${type} Creator`,
  displayType: type,
  element,
});
const animal = (uid: string, types: CreatorTypeName[]): DeckCard => ({
  uid,
  kind: "animal",
  name: uid,
  types: types as [CreatorTypeName, CreatorTypeName],
});

function emptyEco() {
  return { placed: new Map() } as PlayerState["ecosystem"];
}
function makePlayers(n: number): PlayerState[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    hand: [],
    ecosystem: emptyEco(),
    hiveShield: false,
    score: 0,
    firstPickupDone: true,
    status: "active" as const,
    rank: null,
    finalisedAt: null,
  }));
}
function baseState(players: PlayerState[]): MatchState {
  return {
    players,
    turn: 0,
    draw: [],
    used: [],
    phase: "place",
    drawnThisTurn: 2,
    placedThisTurn: 0,
    turnNumber: 1,
    finished: false,
    winnerId: null,
    pendingDisaster: null,
    placements: [],
    turnOrder: players.map((_, i) => i),
  };
}

describe("A.3 — concede ranks from the bottom (quitter cannot out-rank finishers)", () => {
  it("N=4: p2 concedes → rank 4; p3 concedes → rank 3; remaining ranked by score", () => {
    const players = makePlayers(4);
    // Give two players non-zero score so the middle-band tie-break is meaningful.
    players[0].score = 8; // best score
    players[1].score = 4; // worst score
    const state = baseState(players);

    // p2 concedes first → bottom rank N=4.
    let s = concedePlayer(state, "p2");
    expect(s.players.find((p) => p.id === "p2")?.rank).toBe(4);
    expect(s.finished).toBe(false);

    // p3 concedes next → bottom rank N-1=3.
    s = concedePlayer(s, "p3");
    expect(s.players.find((p) => p.id === "p3")?.rank).toBe(3);
    expect(s.finished).toBe(false);

    // p1 concedes → only p0 active → match finalises. p1 takes the next
    // available BOTTOM slot (rank 2); p0 (still active) takes the remaining
    // top slot (rank 1) via the middle-band score sort.
    s = concedePlayer(s, "p1");
    expect(s.finished).toBe(true);
    const ranks = Object.fromEntries(s.placements!.map((pl) => [pl.playerId, pl.rank]));
    expect(ranks.p2).toBe(4);
    expect(ranks.p3).toBe(3);
    expect(ranks.p1).toBe(2);
    expect(ranks.p0).toBe(1);
    expect(s.winnerId).toBe("p0");
  });

  it("N=2: concede collapses to legacy behaviour — opponent rank 1, conceder rank 2", () => {
    const players = makePlayers(2);
    players[0].score = 5;
    players[1].score = 5;
    const state = baseState(players);
    const s = concedePlayer(state, "p0");
    expect(s.finished).toBe(true);
    expect(s.winnerId).toBe("p1");
    const ranks = Object.fromEntries(s.placements!.map((pl) => [pl.playerId, pl.rank]));
    expect(ranks.p1).toBe(1);
    expect(ranks.p0).toBe(2);
  });
});

describe("A.3 — N=4 single-Hive Disaster end-to-end (smoke)", () => {
  it("wipes non-Hive victims; Hive blocker spared; placedThisTurn=1; stalemate backstop finalises when nobody can move", () => {
    const players = makePlayers(4);
    const fire = creator("Fire", "Fire");
    const earth = creator("Soil", "Earth");
    const air = creator("Snow", "Air");
    const water = creator("Ocean", "Water");
    const attackerEco = new Map();
    attackerEco.set("0,0", { card: fire, pos: { q: 0, r: 0 } });
    attackerEco.set("1,0", { card: earth, pos: { q: 1, r: 0 } });
    attackerEco.set("0,1", { card: air, pos: { q: 0, r: 1 } });
    attackerEco.set("-1,1", { card: water, pos: { q: -1, r: 1 } });
    players[0].ecosystem = { placed: attackerEco } as any;
    const lava = creator("Lava", "Fire");
    players[0].hand = [lava];
    for (let i = 1; i <= 3; i++) {
      const a = animal(`a${i}`, ["Lava", "Fire"]);
      const eco = new Map();
      eco.set("0,0", { card: a, pos: { q: 0, r: 0 } });
      players[i].ecosystem = { placed: eco } as any;
    }
    players[2].hand = [
      { uid: "the-only-hive", kind: "golden_hive", name: "Golden Hive" } as DeckCard,
    ];

    const state = baseState(players);
    const queued = playDisaster(state, lava.uid);
    expect(queued.pendingDisaster?.victimIds).toEqual(["p2"]);
    // p2 blocks; non-Hive victims wiped, p2 board untouched.
    const resolved = resolveDisaster(queued, true);
    expect(resolved.pendingDisaster).toBeNull();
    expect(resolved.players[1].ecosystem.placed.size).toBe(0);
    expect(resolved.players[3].ecosystem.placed.size).toBe(0);
    expect(resolved.players[2].ecosystem.placed.size).toBe(1);
    expect(resolved.placedThisTurn).toBe(1);
    // Post-wipe state: draw=[], used-top = spent Hive (unpickable),
    // every hand empty. That's a genuine stalemate — the new backstop
    // routes it through the standard finalise path. Pure-stalemate
    // end_of_days with no prior completer is a draw (winnerId=null).
    expect(resolved.finished).toBe(true);
    expect(resolved.winnerId).toBeNull();
  });
});

describe("stalemate backstop — Hive-only hand is correctly detected as stuck", () => {
  it("N=2: both players hold only a Hive, no draw, used-top spent → backstop finalises", () => {
    const players = makePlayers(2);
    const hive = (uid: string): DeckCard =>
      ({ uid, kind: "golden_hive", name: "Golden Hive" } as DeckCard);
    players[0].hand = [hive("h0")];
    players[1].hand = [hive("h1")];
    const state = baseState(players);
    const spentTop: DeckCard = {
      uid: "spent-top",
      kind: "sky_creature",
      name: "Spent Sky",
      spent: true,
    } as DeckCard;
    state.used = [spentTop];
    state.draw = [];
    state.placedThisTurn = 2;
    const next = endTurnEarly(state);
    expect(next.finished).toBe(true);
    expect(next.winnerId).toBeNull();
  });

  it("a player with a real card in hand does NOT trigger stalemate (discard is legal)", () => {
    const players = makePlayers(2);
    const hive: DeckCard = { uid: "h0", kind: "golden_hive", name: "Golden Hive" } as DeckCard;
    const realCard = animal("a-real", ["Lava", "Fire"]);
    players[0].hand = [hive];
    players[1].hand = [realCard];
    const state = baseState(players);
    state.used = [{ uid: "spent", kind: "sky_creature", name: "Spent", spent: true } as DeckCard];
    state.draw = [];
    state.placedThisTurn = 2;
    const next = endTurnEarly(state);
    expect(next.finished).toBe(false);
  });
});




describe("A.3 — pile/hand exhaustion finalises N>2 by score", () => {
  it("N=3 pure-stalemate end_of_days → empty-placements draw (existing rule preserved)", () => {
    const players = makePlayers(3);
    players[0].score = 4;
    players[1].score = 9;
    players[2].score = 7;
    const state = baseState(players);
    const s1 = endTurnEarly({ ...state, placedThisTurn: 2 });
    expect(s1.finished).toBe(true);
    // Per the existing engine rule, end_of_days with no mid-match completer
    // is a stalemate-draw (winnerId=null, placements=[]). The score-based
    // middle-band ranking only kicks in once at least one player has
    // partially finalised mid-match.
    expect(s1.winnerId).toBeNull();
    expect(s1.placements).toEqual([]);
  });

  it("N=4 finaliseByScore with a quitter preserved at bottom rank", () => {
    const players = makePlayers(4);
    players[0].score = 10;
    players[1].score = 6;
    players[2].score = 6;
    players[3].score = 1;
    let s = baseState(players);
    s = concedePlayer(s, "p3"); // p3 → rank 4
    const result = finaliseByScore(s);
    expect(result.finished).toBe(true);
    const ranks = Object.fromEntries(result.placements!.map((pl) => [pl.playerId, pl.rank]));
    expect(ranks.p3).toBe(4);
    expect(ranks.p0).toBe(1);
    // p1 and p2 tied → share rank 2.
    expect(ranks.p1).toBe(2);
    expect(ranks.p2).toBe(2);
  });
});

describe("A.3 — 2-player regression: finaliseByScore identical to legacy", () => {
  it("winner gets rank 1, loser rank 2, winnerId matches", () => {
    const players = makePlayers(2);
    players[0].score = 12;
    players[1].score = 3;
    const result = finaliseByScore(baseState(players));
    expect(result.winnerId).toBe("p0");
    expect(result.placements).toEqual([
      { playerId: "p0", rank: 1 },
      { playerId: "p1", rank: 2 },
    ]);
  });
});

/* ============================================================================
 * Reshuffle + spent-card terminal rule (client-confirmed build).
 *
 * Verifies:
 *  - Reshuffle excludes spent cards (permanently removed from play).
 *  - `disasterSpent` creators DO reshuffle (only `spent` is filtered).
 *  - Reshuffle convergence: each successive reshuffle is strictly smaller.
 *  - `pickFromDraw` auto-reshuffles when draw is empty.
 *  - Lockstep agreement between `isUsedTopPickable` / `pickFromUsed` and the
 *    backstop's `playerHasAnyLegalMove` — same rule, can't drift.
 *  - Terminal condition (draw empty + used all-spent + no playable hands)
 *    is correctly caught by the backstop and finalises by score.
 *  - Hive-only-hand regression still fires (existing behaviour preserved).
 * ========================================================================== */

const sky = (uid: string, spent = false): DeckCard =>
  ({ uid, kind: "sky_creature", name: `Sky-${uid}`, types: ["Sky", "Lava"], spent } as DeckCard);
const hive = (uid: string, spent = false): DeckCard =>
  ({ uid, kind: "golden_hive", name: "Golden Hive", spent } as DeckCard);
const plainAnimal = (uid: string): DeckCard =>
  ({ uid, kind: "animal", name: uid, types: ["Lava", "Fire"] } as DeckCard);

describe("reshuffle — excludes spent cards, includes disasterSpent creators", () => {
  it("filters spent cards out; live cards repopulate draw; used pile clears", () => {
    const players = makePlayers(2);
    const state = baseState(players);
    state.draw = [];
    state.used = [
      plainAnimal("live-1"),
      sky("spent-sky", true),
      hive("spent-hive", true),
      plainAnimal("live-2"),
      // A creator played as Disaster — disasterSpent=true, spent=false.
      { uid: "ds-creator", kind: "creator", name: "Lava Creator", element: "Fire", disasterSpent: true } as DeckCard,
    ];
    const reshuffled = reshuffleUsedIntoDraw(state, () => 0); // deterministic
    expect(reshuffled).toBe(3);
    expect(state.used).toEqual([]);
    expect(state.draw.map((c) => c.uid).sort()).toEqual(["ds-creator", "live-1", "live-2"]);
    expect(state.draw.find((c) => c.uid === "spent-sky")).toBeUndefined();
    expect(state.draw.find((c) => c.uid === "spent-hive")).toBeUndefined();
  });

  it("returns 0 and leaves state untouched when used pile is all-spent", () => {
    const players = makePlayers(2);
    const state = baseState(players);
    state.draw = [];
    state.used = [sky("s1", true), hive("h1", true)];
    const before = state.used.length;
    const reshuffled = reshuffleUsedIntoDraw(state);
    expect(reshuffled).toBe(0);
    expect(state.draw).toEqual([]);
    expect(state.used.length).toBe(before);
  });

  it("convergence: each reshuffle is strictly smaller as cards become spent/placed", () => {
    const players = makePlayers(2);
    const state = baseState(players);
    state.draw = [];
    state.used = [plainAnimal("a"), plainAnimal("b"), plainAnimal("c"), sky("s", true)];
    const r1 = reshuffleUsedIntoDraw(state); // 3 live → draw
    expect(r1).toBe(3);
    // Simulate two cards being placed (removed from circulation) and one
    // becoming spent in the used pile.
    state.draw = state.draw.slice(0, 1); // 2 placed, 1 left in draw
    state.used = [sky("s2", true)]; // only a freshly-spent Sky left
    const r2 = reshuffleUsedIntoDraw(state); // 0 live (only spent)
    expect(r2).toBe(0);
    expect(r2).toBeLessThan(r1);
  });
});

describe("pickFromDraw — auto-reshuffles when draw is empty", () => {
  it("reshuffles used into draw on empty-draw pickup and deals the top card", () => {
    const players = makePlayers(2);
    players[0].firstPickupDone = true;
    const state = baseState(players);
    state.phase = "draw";
    state.drawnThisTurn = 0;
    state.placedThisTurn = 0;
    state.draw = [];
    state.used = [plainAnimal("a"), plainAnimal("b"), sky("dead", true)];
    const next = pickFromDraw(state);
    // One card landed in hand, the other reshuffled card is in draw,
    // spent Sky is permanently gone, used is empty.
    expect(next.players[0].hand.length).toBe(1);
    expect(next.draw.length).toBe(1);
    expect(next.used).toEqual([]);
    expect(next.draw.find((c) => c.uid === "dead")).toBeUndefined();
    expect(next.lastEvent).toMatch(/reshuffled/);
  });

  it("throws clean error when draw is empty AND used has nothing live", () => {
    const players = makePlayers(2);
    players[0].firstPickupDone = true;
    const state = baseState(players);
    state.phase = "draw";
    state.draw = [];
    state.used = [sky("s", true), hive("h", true)];
    expect(() => pickFromDraw(state)).toThrow(/No cards left to draw/);
  });
});

describe("lockstep — isUsedTopPickable / pickFromUsed / playerHasAnyLegalMove agree", () => {
  function dealTurnState(top: DeckCard | null) {
    const players = makePlayers(2);
    players[0].firstPickupDone = true;
    players[0].hand = []; // empty so pickup is the only candidate move
    players[1].firstPickupDone = true;
    players[1].hand = [];
    const state = baseState(players);
    state.phase = "draw";
    state.drawnThisTurn = 0;
    state.placedThisTurn = 0;
    state.draw = [];
    state.used = top ? [top] : [];
    return state;
  }

  it("spent Sky on top: predicate true, pickFromUsed succeeds, no false stalemate", () => {
    const spentSky = sky("spent-sky-top", true);
    expect(isUsedTopPickable(spentSky)).toBe(true);
    const state = dealTurnState(spentSky);
    // pickFromUsed must succeed and preserve spent=true.
    const picked = pickFromUsed(state);
    const inHand = picked.players[0].hand.find((c) => c.uid === "spent-sky-top");
    expect(inHand).toBeDefined();
    expect(inHand?.spent).toBe(true);
    // Backstop sanity: ending p1's turn with this state must NOT finalise
    // (p0 has a legal pickup waiting on their turn).
    const advanced = endTurnEarly({ ...dealTurnState(spentSky), turn: 1, placedThisTurn: 2 });
    expect(advanced.finished).toBe(false);
  });

  it("spent Hive on top: predicate false, pickFromUsed throws, no legal pickup", () => {
    const spentHive = hive("spent-hive-top", true);
    expect(isUsedTopPickable(spentHive)).toBe(false);
    const state = dealTurnState(spentHive);
    expect(() => pickFromUsed(state)).toThrow(/spent/);
  });

  it("live (non-spent) Hive on top: pickable by both rules", () => {
    const liveHive = hive("live-hive", false);
    expect(isUsedTopPickable(liveHive)).toBe(true);
    const state = dealTurnState(liveHive);
    const picked = pickFromUsed(state);
    expect(picked.players[0].hand.some((c) => c.uid === "live-hive")).toBe(true);
  });
});

describe("terminal — draw empty + used all-spent + no playable hands → finalise by score", () => {
  it("N=3: every active player stuck, backstop fires through ranked finalise path", () => {
    const players = makePlayers(3);
    players[0].score = 7;
    players[1].score = 4;
    players[2].score = 9;
    // Hands: one Hive-only (stuck), two empty (stuck).
    players[0].hand = [hive("h-only")];
    players[1].hand = [];
    players[2].hand = [];
    const state = baseState(players);
    state.draw = [];
    state.used = [sky("dead-sky", true), hive("dead-hive", true)];
    state.placedThisTurn = 2; // make endTurnEarly trigger advanceTurn
    // Pre-existing completer so the ranking path kicks in (pure stalemate
    // with no completer is the existing draw rule, covered elsewhere).
    state.placements = [{ playerId: "p2", rank: 1 }];
    players[2].status = "finalised";
    players[2].rank = 1;
    const next = endTurnEarly(state);
    expect(next.finished).toBe(true);
    // p2 already rank 1; p0 (score 7) beats p1 (score 4) for middle band.
    const ranks = Object.fromEntries((next.placements ?? []).map((pl) => [pl.playerId, pl.rank]));
    expect(ranks.p2).toBe(1);
    expect(ranks.p0).toBe(2);
    expect(ranks.p1).toBe(3);
  });

  it("backstop does NOT fire while live cards remain reshuffleable", () => {
    const players = makePlayers(2);
    players[0].hand = [];
    players[1].hand = [];
    const state = baseState(players);
    state.draw = [];
    // Used has a live card → reshuffle would refill draw → not stuck.
    state.used = [plainAnimal("live"), sky("dead", true)];
    state.placedThisTurn = 2;
    const next = endTurnEarly(state);
    expect(next.finished).toBe(false);
  });
});
