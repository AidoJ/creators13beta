/**
 * Mirror-engine integrity tests.
 *
 * Why this file exists: vitest normally runs against src/lib/game/engine.ts,
 * but the LIVE game runs the mirrored copy at
 * supabase/functions/_shared/game/engine.ts (loaded by the apply-move edge
 * function). A correct source + a wrong mirror would leave the source-side
 * suite fully green while the deployed game runs different logic. The sync
 * script catches a stale mirror by file comparison, but if the sync script
 * itself ever regresses, or someone hand-edits the mirror, that's invisible
 * to source-side tests.
 *
 * This file re-runs the instant-end-on-first-completion cases against the
 * MIRROR import path. If the mirror diverges from source on this rule, this
 * test fails directly — closing the "code that runs in prod ≠ code the tests
 * exercise" gap for the most safety-critical engine path.
 *
 * Keep this suite minimal and pinned to the highest-stakes invariants. It's
 * not meant to mirror the full source-side suite — its job is to fail loudly
 * if the mirror ever runs different game-ending logic than source.
 */
import { describe, expect, it } from "vitest";
// Intentionally reaching out of src/ — see file header.
import {
  createMatch as mirrorCreateMatch,
  finaliseByScore as mirrorFinaliseByScore,
} from "../../../supabase/functions/_shared/game/engine.ts";
import type {
  MatchState as MirrorMatchState,
  PlayerState as MirrorPlayerState,
} from "../../../supabase/functions/_shared/game/types.ts";

function emptyEco() {
  return { placed: new Map() } as MirrorPlayerState["ecosystem"];
}

function makePlayers(n: number): MirrorPlayerState[] {
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

function baseState(players: MirrorPlayerState[]): MirrorMatchState {
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

describe("mirror engine — instant-end on first completion (parity with source)", () => {
  it("N=4: finished=true, winner rank 1, all placements filled", () => {
    const players = makePlayers(4);
    players[0].score = 10;
    players[1].score = 20; // winner
    players[2].score = 15;
    players[3].score = 15;
    const result = mirrorFinaliseByScore(baseState(players));
    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe("p1");
    const ranks = Object.fromEntries(
      result.placements!.map((pl) => [pl.playerId, pl.rank]),
    );
    expect(ranks.p1).toBe(1);
    expect(ranks.p2).toBe(2);
    expect(ranks.p3).toBe(2);
    expect(ranks.p0).toBe(4);
    // The exact failure shape we hit live (finished=false, one placement) must
    // NOT recur in the mirror.
    expect(result.placements!.length).toBe(4);
  });

  it("N=3: finished=true, full 1/2/3 placements", () => {
    const players = makePlayers(3);
    players[0].score = 5;
    players[1].score = 12;
    players[2].score = 8;
    const result = mirrorFinaliseByScore(baseState(players));
    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe("p1");
    expect(result.placements!.length).toBe(3);
  });

  it("N=2: finished=true, ranks 1/2", () => {
    const players = makePlayers(2);
    players[0].score = 10;
    players[1].score = 5;
    const result = mirrorFinaliseByScore(baseState(players));
    expect(result.finished).toBe(true);
    expect(result.placements).toEqual([
      { playerId: "p0", rank: 1 },
      { playerId: "p1", rank: 2 },
    ]);
  });

  it("createMatch defaults match source (N=4 turnOrder + lifecycle fields)", () => {
    const m = mirrorCreateMatch({
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
});
