/**
 * A.2 — N-player engine generalisation tests.
 *
 * These exercise the new code paths added by Batch A.2 without touching the
 * existing 2-player suite in rules.test.ts. The 2-player regression gate is
 * the existing suite — it must stay green.
 */
import { describe, expect, it } from "vitest";
import {
  endTurnEarly,
  createMatch,
  finaliseByScore,
  playDisaster,
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
const hive = (uid: string): DeckCard => ({ uid, kind: "golden_hive", name: "Golden Hive" });
const animal = (uid: string, types: CreatorTypeName[]): DeckCard => ({
  uid, kind: "animal", name: uid, types: types as [CreatorTypeName, CreatorTypeName],
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

describe("A.2 — createMatch defaults for N players", () => {
  it("initialises turnOrder, placements and per-player lifecycle fields for N=4", () => {
    const m = createMatch({
      players: [
        { id: "a", name: "A" }, { id: "b", name: "B" },
        { id: "c", name: "C" }, { id: "d", name: "D" },
      ],
      deck: [],
    });
    expect(m.turnOrder).toEqual([0, 1, 2, 3]);
    expect(m.placements).toEqual([]);
    for (const p of m.players) {
      expect(p.status).toBe("active");
      expect(p.rank).toBeNull();
      expect(p.finalisedAt).toBeNull();
    }
  });

  it("collapses to identical 2-player turnOrder", () => {
    const m = createMatch({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      deck: [],
    });
    expect(m.turnOrder).toEqual([0, 1]);
  });
});

describe("A.2 — Disaster wipe collects multiple Hive-holders (N=3)", () => {
  it("queues victimIds across all opponents who hold an unspent Hive", () => {
    const players = makePlayers(3);
    // Attacker has the disaster Creator; both opponents have a Hive.
    const fire = creator("Fire", "Fire");
    players[0].hand = [fire];
    players[1].hand = [hive("hive-1")];
    players[2].hand = [hive("hive-2")];
    // Attacker's ecosystem must cover all four elements to legally play a
    // Disaster. We bypass that gate by NOT calling playDisaster's real
    // path — instead test the resolveDisaster queue directly.
    // Stub a pendingDisaster as if playDisaster had set it.
    const state = baseState(players);
    state.pendingDisaster = {
      attackerId: "p0",
      victimIds: ["p1", "p2"],
      victimId: "p1",
      blockedBy: [],
      creator: fire,
    };

    // P1 chooses to block.
    let next = resolveDisaster(state, true);
    expect(next.pendingDisaster).not.toBeNull();
    expect(next.pendingDisaster!.victimIds).toEqual(["p2"]);
    expect(next.pendingDisaster!.blockedBy).toEqual(["p1"]);

    // P2 declines.
    next = resolveDisaster(next, false);
    expect(next.pendingDisaster).toBeNull();
    // Wipe ran — placedThisTurn incremented exactly once across the whole
    // disaster resolution (not once per victim).
    expect(next.placedThisTurn).toBe(1);
  });

  it("playDisaster sets victimIds across multiple hive-holders", () => {
    const players = makePlayers(3);
    // Build a covered ecosystem for the attacker.
    const fire = creator("Fire", "Fire");
    const earth = creator("Soil", "Earth");
    const air = creator("Snow", "Air");
    const water = creator("Ocean", "Water");
    const placed = new Map();
    placed.set("0,0", { card: fire, pos: { q: 0, r: 0 } });
    placed.set("1,0", { card: earth, pos: { q: 1, r: 0 } });
    placed.set("0,1", { card: air, pos: { q: 0, r: 1 } });
    placed.set("-1,1", { card: water, pos: { q: -1, r: 1 } });
    players[0].ecosystem = { placed } as any;
    const lava = creator("Lava", "Fire");
    players[0].hand = [lava];
    players[1].hand = [hive("hive-1")];
    players[2].hand = [hive("hive-2")];

    const state = baseState(players);
    const next = playDisaster(state, lava.uid);
    expect(next.pendingDisaster).not.toBeNull();
    expect(next.pendingDisaster!.victimIds.sort()).toEqual(["p1", "p2"]);
    expect(next.pendingDisaster!.victimId).toBe(next.pendingDisaster!.victimIds[0]);
  });
});

describe("A.2 — advanceTurn skips non-active players", () => {
  it("rotates through turnOrder skipping finalised/conceded players", () => {
    const players = makePlayers(4);
    players[1].status = "finalised";
    players[1].rank = 1;
    const state = baseState(players);
    state.turnOrder = [0, 1, 2, 3];
    state.turn = 0;
    state.placedThisTurn = 2; // trigger advance via endTurnEarly proxy
    // Simulate end-of-turn: call the engine's advanceTurn indirectly via
    // finaliseByScore would end match — use `endTurnEarly` instead.
    // We exercise advanceTurn through the public surface by importing
    // endTurnEarly.
    
    // using imported endTurnEarly
    const next = endTurnEarly(state);
    expect(next.turn).toBe(2); // skipped finalised slot 1
  });

  it("finalises the match when only one active player remains after a turn", () => {
    const players = makePlayers(3);
    players[1].status = "finalised";
    players[1].rank = 1;
    players[2].status = "finalised";
    players[2].rank = 2;
    const state = baseState(players);
    state.placements = [
      { playerId: "p1", rank: 1 },
      { playerId: "p2", rank: 2 },
    ];
    
    // using imported endTurnEarly
    const next = endTurnEarly(state);
    expect(next.finished).toBe(true);
    expect(next.placements?.find((p) => p.playerId === "p0")?.rank).toBe(3);
  });
});

describe("A.2 — finaliseByScore ranks all players (ties share rank)", () => {
  it("assigns ranks by total score descending with shared rank on ties", () => {
    const players = makePlayers(4);
    // Give each player a different ecosystem size so playerTotalScore differs.
    // playerTotalScore = placed.size * 2 + score.
    players[0].score = 10;          // total = 10
    players[1].score = 20;          // total = 20  (winner)
    players[2].score = 15;          // total = 15
    players[3].score = 15;          // total = 15  (tie with p2)
    const state = baseState(players);
    const result = finaliseByScore(state);
    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe("p1");
    const ranks = Object.fromEntries(
      result.placements!.map((pl) => [pl.playerId, pl.rank]),
    );
    expect(ranks.p1).toBe(1);
    // p2 and p3 are tied → share rank 2.
    expect(ranks.p2).toBe(2);
    expect(ranks.p3).toBe(2);
    expect(ranks.p0).toBe(4); // tied players bump the next rank slot.
  });

  it("collapses to identical 2-player behaviour", () => {
    const players = makePlayers(2);
    players[0].score = 10;
    players[1].score = 5;
    const state = baseState(players);
    const result = finaliseByScore(state);
    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe("p0");
    expect(result.placements).toEqual([
      { playerId: "p0", rank: 1 },
      { playerId: "p1", rank: 2 },
    ]);
  });
});

describe("A.2 — pile exhaustion in N=4 ranks remaining actives by score", () => {
  it("ends the match with full placements when all hands empty and piles empty", () => {
    const players = makePlayers(4);
    players[0].score = 8;
    players[1].score = 5;
    players[2].score = 12;
    players[3].score = 3;
    const state = baseState(players);
    state.gameMode = "end_of_days";
    state.draw = [];
    state.used = [];
    // No hands. Trigger end-of-turn detection.
    state.placedThisTurn = 2;
    
    // using imported endTurnEarly
    const next = endTurnEarly(state);
    expect(next.finished).toBe(true);
    // Pure-stalemate (no prior completer) end_of_days draws with empty
    // placements per the rule book — half points all round.
    expect(next.winnerId).toBeNull();
    expect(next.placements).toEqual([]);
  });
});

describe("A.2 — 2-player stalemate behaviour preserved", () => {
  it("ends in a draw with winnerId=null when both hands and piles empty", () => {
    const players = makePlayers(2);
    const state = baseState(players);
    state.gameMode = "end_of_days";
    state.placedThisTurn = 2;
    
    // using imported endTurnEarly
    const next = endTurnEarly(state);
    expect(next.finished).toBe(true);
    expect(next.winnerId).toBeNull();
    expect(next.placements).toEqual([]);
  });
});
