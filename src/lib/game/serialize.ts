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

/**
 * Strip any HTML/script payloads out of the opponent-supplied `lastEvent`
 * string and cap its length. `lastEvent` is client-authored narration —
 * the engine generates safe strings, but the multiplayer row trusts whatever
 * the other player writes, so we sanitise on deserialise to keep XSS-like
 * payloads out of any future renderer.
 */
function sanitiseLastEvent(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw);
  if (!s) return undefined;
  // Remove tags and control chars, then cap.
  const cleaned = s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  return cleaned.slice(0, 240);
}

export function deserializeMatch(raw: SerializedMatchState): MatchState {
  return {
    ...raw,
    lastEvent: sanitiseLastEvent(raw.lastEvent),
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

