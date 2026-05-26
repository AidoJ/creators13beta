/**
 * Core types for the 13 Creators "B Creators" ecosystem-building card game.
 *
 * Each player builds their OWN honeycomb ecosystem of 16 cards:
 *   - 4 Creator Cards (one of each element: Earth / Fire / Air / Water,
 *     with Sky Creator able to substitute for any element)
 *   - 12 Animal Cards (3 matching each Creator, by shared Creator Type;
 *     Golden Body substitutes for any animal)
 *
 * Coordinates are axial (q,r) on a pointy-top hex grid.
 */

import type { CreatorTypeName, GameCard } from "@/lib/gameCards";
import type { Element } from "./elements";

export type Axial = { q: number; r: number };

export type CardKind =
  | "animal"        // standard animal, 1 or 2 Creator Types
  | "creator"       // Earth / Fire / Air / Water creator card
  | "sky_creator"   // wildcard creator — counts as any element
  | "sky_creature"  // mythical animal — also playable as a STEALER
  | "golden_body"   // wildcard animal
  | "golden_hive";  // blocks one disaster

/** A single physical copy of a card in the deck / hand / ecosystem. */
export interface DeckCard {
  /** Unique-per-copy id (e.g. "fox#1"). */
  uid: string;
  kind: CardKind;
  name: string;
  /** For animals / sky_creatures — the Creator Types they belong to (1-2). */
  types?: CreatorTypeName[];
  /** For animals / sky_creatures — the underlying art / descriptor. */
  source?: GameCard;
  /** For 'creator' cards — the element they represent. */
  element?: Element;
  /** True if this is a mythical / golden / sky variant (for badge styling). */
  special?: boolean;
}

export interface PlacedCard {
  card: DeckCard;
  pos: Axial;
}

export interface Ecosystem {
  /** Placed cards keyed by "q,r". */
  placed: Map<string, PlacedCard>;
}

export interface PlayerState {
  id: string;
  name: string;
  hand: DeckCard[];
  ecosystem: Ecosystem;
  /** Active hive shield (true after picking up / playing a hive proactively). */
  hiveShield: boolean;
  /** Cumulative gameplay score for end-of-match display. */
  score: number;
}

export type TurnPhase = "draw" | "place";

export interface MatchState {
  players: PlayerState[];
  turn: number;
  draw: DeckCard[];
  used: DeckCard[];
  phase: TurnPhase;
  /** How many cards picked up so far this turn (0..2). */
  drawnThisTurn: number;
  /** How many cards placed/discarded so far this turn (0..2). */
  placedThisTurn: number;
  turnNumber: number;
  finished: boolean;
  winnerId: string | null;
  /** Most recent rule-relevant event, for the UI to surface. */
  lastEvent?: string;
}

export const HAND_SIZE = 5;
export const ECOSYSTEM_TARGET = 16; // 4 creators + 12 animals
export const CREATORS_NEEDED = 4;
export const ANIMALS_PER_CREATOR = 3;
