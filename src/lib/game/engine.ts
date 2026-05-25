/**
 * Turn engine. Pure functions — never mutate the passed-in state; always
 * return a new MatchState. The React layer drives this with useReducer.
 */

import type { GameCard } from "@/lib/gameCards";
import { keyOf } from "./board";
import { canPlace, evaluatePlacement, hasAnyLegalMove } from "./match";
import { HAND_SIZE, type Axial, type MatchState, type PlayerState, type Rotation } from "./types";

/** Fisher-Yates shuffle. Pure — returns a new array. */
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface CreateMatchOptions {
  players: Array<Pick<PlayerState, "id" | "name">>;
  deck: GameCard[];
  rand?: () => number;
}

export function createMatch(opts: CreateMatchOptions): MatchState {
  const rand = opts.rand ?? Math.random;
  let deck = shuffle(opts.deck, rand);

  const players: PlayerState[] = opts.players.map((p) => {
    const hand = deck.slice(0, HAND_SIZE);
    deck = deck.slice(HAND_SIZE);
    return { id: p.id, name: p.name, hand, score: 0 };
  });

  return {
    players,
    turn: 0,
    deck,
    discard: [],
    board: new Map(),
    turnNumber: 0,
    finished: false,
    winnerId: null,
  };
}

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    deck: s.deck.slice(),
    discard: s.discard.slice(),
    board: new Map(s.board),
  };
}

export interface PlaceMoveResult {
  state: MatchState;
  matchingEdges: number;
  pointsAwarded: number;
}

/**
 * Place `cardSlug` from current player's hand at `pos`. Rotation is chosen
 * automatically to maximise matching edges unless `rotation` is supplied.
 * Throws if the move is illegal.
 */
export function placeCard(
  state: MatchState,
  cardSlug: string,
  pos: Axial,
  rotation?: Rotation,
): PlaceMoveResult {
  if (state.finished) throw new Error("Match is finished");

  const next = cloneState(state);
  const player = next.players[next.turn];
  const handIdx = player.hand.findIndex((c) => c.slug === cardSlug);
  if (handIdx === -1) throw new Error("Card not in current player's hand");
  const card = player.hand[handIdx];

  if (!canPlace(card, pos, next.board)) {
    throw new Error("Illegal placement: no matching edge with neighbours");
  }

  const { best } = evaluatePlacement(card, pos, next.board);
  const rot: Rotation = rotation ?? best.rotation;

  next.board.set(keyOf(pos), {
    card,
    pos,
    rotation: rot,
    ownerId: player.id,
  });

  // Remove from hand, draw one if available.
  player.hand.splice(handIdx, 1);
  if (next.deck.length > 0) {
    player.hand.push(next.deck.shift()!);
  }

  // Score: 1 point per matching edge.
  const pointsAwarded = best.matchingEdges;
  player.score += pointsAwarded;

  next.turnNumber += 1;
  advanceTurn(next);

  return { state: next, matchingEdges: best.matchingEdges, pointsAwarded };
}

/**
 * Player chooses to discard a card they can't (or won't) place. Card goes
 * to the discard pile; they draw a replacement if the deck has cards.
 */
export function discardCard(state: MatchState, cardSlug: string): MatchState {
  if (state.finished) throw new Error("Match is finished");
  const next = cloneState(state);
  const player = next.players[next.turn];
  const handIdx = player.hand.findIndex((c) => c.slug === cardSlug);
  if (handIdx === -1) throw new Error("Card not in current player's hand");
  const [card] = player.hand.splice(handIdx, 1);
  next.discard.push(card);
  if (next.deck.length > 0) {
    player.hand.push(next.deck.shift()!);
  }
  advanceTurn(next);
  return next;
}

function advanceTurn(state: MatchState): void {
  // Skip to next player.
  state.turn = (state.turn + 1) % state.players.length;
  checkEndCondition(state);
}

/**
 * End conditions:
 *   1. Deck is empty AND current player has no legal moves with their hand.
 *   2. All players have empty hands.
 * Winner = highest score (ties → first player by index).
 */
function checkEndCondition(state: MatchState): void {
  const allHandsEmpty = state.players.every((p) => p.hand.length === 0);
  if (allHandsEmpty) {
    finalise(state);
    return;
  }
  if (state.deck.length === 0) {
    const cur = state.players[state.turn];
    const anyMove = cur.hand.some((c) => hasAnyLegalMove(c, state.board));
    if (!anyMove) finalise(state);
  }
}

function finalise(state: MatchState): void {
  state.finished = true;
  const top = state.players.reduce((a, b) => (b.score > a.score ? b : a));
  state.winnerId = top.id;
}
