/**
 * JSON serialization for MatchState.
 *
 * MatchState uses ES Maps (Ecosystem.placed) which JSON cannot round-trip.
 * Here we flatten them to arrays for storage / wire transfer and rebuild
 * them on load.
 */

import type { Ecosystem, MatchState, PlayerState, PlacedCard } from "./types";

interface SerializedEco {
  placed: [string, PlacedCard][];
}
interface SerializedPlayer extends Omit<PlayerState, "ecosystem"> {
  ecosystem: SerializedEco;
}
export interface SerializedMatchState extends Omit<MatchState, "players"> {
  players: SerializedPlayer[];
}

export function serializeMatch(state: MatchState): SerializedMatchState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      ecosystem: { placed: Array.from(p.ecosystem.placed.entries()) },
    })),
  };
}

export function deserializeMatch(raw: SerializedMatchState): MatchState {
  return {
    ...raw,
    players: raw.players.map((p) => ({
      ...p,
      // Older matches saved before opening-5 mechanic had hands pre-dealt;
      // treat them as having completed their opening pick-up.
      firstPickupDone: p.firstPickupDone ?? true,
      ecosystem: {
        placed: new Map<string, PlacedCard>(p.ecosystem.placed),
      } as Ecosystem,
    })),
    pendingDisaster: raw.pendingDisaster ?? null,
  };
}
