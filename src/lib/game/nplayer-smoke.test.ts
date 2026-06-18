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
