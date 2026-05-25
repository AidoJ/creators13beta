/**
 * Core types for the 13 Creators honeycomb match engine.
 *
 * Coordinate system: AXIAL (q, r) for a pointy-top hex grid.
 *   - q = column axis (east)
 *   - r = row axis  (south-east)
 *   - implicit s = -q - r
 *
 * Each placed card occupies one axial cell and stores its rotation in
 * 60° increments (0..5). Rotation rotates the entire hex visual + the
 * type-half assignment, so the card's two halves face different edges
 * depending on rotation.
 */

import type { CreatorTypeName, GameCard } from "@/lib/gameCards";

export type Axial = { q: number; r: number };

/** 0..5 — 60° increments. 0 = canonical card orientation (typeA on top-left half, typeB on bottom-right half). */
export type Rotation = 0 | 1 | 2 | 3 | 4 | 5;

export interface PlacedCard {
  card: GameCard;
  pos: Axial;
  rotation: Rotation;
  /** Owner / player id who placed this card. */
  ownerId: string;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: GameCard[];
  score: number;
}

export interface MatchState {
  players: PlayerState[];
  /** Index into players[] of the player whose turn it is. */
  turn: number;
  /** Cards still in the draw pile. */
  deck: GameCard[];
  /** Used / discarded cards (unplayable matches, etc.). */
  discard: GameCard[];
  /** Placed cards keyed by "q,r". */
  board: Map<string, PlacedCard>;
  /** Increments every successful placement. */
  turnNumber: number;
  /** True once an end-of-match condition has fired. */
  finished: boolean;
  winnerId: string | null;
}

export const HAND_SIZE = 5;
