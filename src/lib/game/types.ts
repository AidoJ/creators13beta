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
  /** For 'creator' cards — the specific Creator Type displayed (e.g. "Snow"). */
  displayType?: CreatorTypeName;
  /** True if this is a mythical / golden / sky variant (for badge styling). */
  special?: boolean;
  /** Marks a Golden Hive that has already been used to block a disaster —
   *  it sits on the used pile but can never be picked up again. */
  spent?: boolean;
  /** True if this card was picked up from the used pile on the CURRENT turn.
   *  Such a card cannot be re-weaponised as a Disaster the same turn — it must
   *  be placed on the board this turn or held until next turn. Cleared in
   *  advanceTurn. Prevents infinite Creator→Disaster recycling. */
  pickedUpThisTurn?: boolean;
}

export interface PlacedCard {
  card: DeckCard;
  pos: Axial;
  /** 0..5 — number of 60° clockwise rotations applied to the hex background.
   *  Only affects two-colour split cards (animals / sky_creatures). The
   *  artwork itself always stays upright. */
  rotation?: number;
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
  /** True once the player has done their opening 5-card pick-up. Before then
   *  the only legal pick-up action is `drawInitialFive`. */
  firstPickupDone?: boolean;
}

export type TurnPhase = "draw" | "place";

/** Game mode controlling the end-condition. */
export type GameMode =
  | "end_of_days"   // classic: first to assemble full ecosystem
  | "first_to_50"   // first player to reach a target total score wins
  | "beat_clock";   // overall match timer + per-turn timer; high score wins on time-up

export interface GameConfig {
  /** For first_to_50: points threshold. Default 50. */
  targetScore?: number;
  /** For beat_clock: epoch ms when the match auto-ends. */
  matchEndsAt?: number;
  /** For beat_clock: seconds allowed per turn before auto-end-turn. */
  turnSeconds?: number;
}

/** A disaster that is waiting for a victim's Golden Hive decision before it
 *  resolves. While this is set the match is paused for everyone — only the
 *  victim can act. */
export interface PendingDisaster {
  attackerId: string;
  victimId: string;
  creator: DeckCard;
}

export interface MatchState {
  players: PlayerState[];
  turn: number;
  draw: DeckCard[];
  used: DeckCard[];
  phase: TurnPhase;
  drawnThisTurn: number;
  placedThisTurn: number;
  turnNumber: number;
  finished: boolean;
  winnerId: string | null;
  lastEvent?: string;
  pendingDisaster?: PendingDisaster | null;
  /** Game mode + config. Older saves omit these → treated as end_of_days. */
  gameMode?: GameMode;
  gameConfig?: GameConfig;
}

/** Total score used for First-to-50 / Beat-the-Clock leaderboards.
 *  Mirrors the running pts shown in ScorePanel (ecosystem.placed.size * 2)
 *  plus engine-tracked bonus points (disaster wipes, etc.). */
export function playerTotalScore(player: PlayerState): number {
  return player.ecosystem.placed.size * 2 + (player.score ?? 0);
}

export const HAND_SIZE = 5;
/** Maximum cards a player may hold. Pick-up is blocked once hit; disasters
 *  may temporarily exceed this (no cards are lost), and the holder must
 *  play / discard down before drawing again. */
export const HAND_LIMIT = 10;
export const ECOSYSTEM_TARGET = 16; // 4 creators + 12 animals
export const CREATORS_NEEDED = 4;
export const ANIMALS_PER_CREATOR = 3;
