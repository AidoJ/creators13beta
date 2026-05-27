/**
 * Turn engine for "B Creators". Pure functions — never mutate input.
 *
 * Turn flow per the rule book:
 *   1. Pick up 2 cards (any combination of draw-pile top or used-pile top).
 *   2. (Optional) Rearrange — currently exposed via the UI as drag-to-move,
 *      not enforced in engine.
 *   3. Put down 2 cards: either onto your ecosystem, or play a special
 *      power (Disaster / Sky-Creature steal), or discard to the used pile.
 *
 * Win: first player to assemble 4 Creators + 12 matching Animals AND have
 * no Creator Cards left in their hand.
 */

import {
  ANIMALS_PER_CREATOR,
  CREATORS_NEEDED,
  HAND_SIZE,
  type Axial,
  type DeckCard,
  type Ecosystem,
  type MatchState,
  type PlacedCard,
  type PlayerState,
} from "./types";
import { keyOf, neighbours } from "./board";
import { TYPE_TO_ELEMENT } from "./elements";
import { bestRotationForPlacement, rotatePlacedHex } from "./rotation";

/* --------------------------- helpers --------------------------- */

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cloneEco(e: Ecosystem): Ecosystem {
  return { placed: new Map(e.placed) };
}

function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, hand: p.hand.slice(), ecosystem: cloneEco(p.ecosystem) };
}

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    players: s.players.map(clonePlayer),
    draw: s.draw.slice(),
    used: s.used.slice(),
  };
}

export function legalEcoCells(eco: Ecosystem, excludeKey?: string): Axial[] {
  const sources = Array.from(eco.placed.values()).filter(
    (pc) => !excludeKey || keyOf(pc.pos) !== excludeKey,
  );
  if (sources.length === 0) return [{ q: 0, r: 0 }];
  const occupied = new Set(sources.map((pc) => keyOf(pc.pos)));
  const empty = new Map<string, Axial>();
  for (const pc of sources) {
    for (const n of neighbours(pc.pos)) {
      const k = keyOf(n);
      if (!occupied.has(k) && !empty.has(k)) empty.set(k, n);
    }
  }
  return Array.from(empty.values());
}

/* --------------------------- match setup --------------------------- */

export interface CreateMatchOptions {
  players: Array<Pick<PlayerState, "id" | "name">>;
  deck: DeckCard[];
  rand?: () => number;
}

export function createMatch(opts: CreateMatchOptions): MatchState {
  const rand = opts.rand ?? Math.random;
  let deck = shuffle(opts.deck, rand);

  const players: PlayerState[] = opts.players.map((p) => {
    const hand = deck.slice(0, HAND_SIZE);
    deck = deck.slice(HAND_SIZE);
    return {
      id: p.id,
      name: p.name,
      hand,
      ecosystem: { placed: new Map() },
      hiveShield: false,
      score: 0,
    };
  });

  return {
    players,
    turn: 0,
    draw: deck,
    used: [],
    phase: "draw",
    drawnThisTurn: 0,
    placedThisTurn: 0,
    turnNumber: 1,
    finished: false,
    winnerId: null,
  };
}

/* --------------------------- pick-up phase --------------------------- */

export function pickFromDraw(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") throw new Error("Not in pick-up phase");
  if (state.draw.length === 0) throw new Error("Draw pile empty");
  const next = cloneState(state);
  const card = next.draw.shift()!;
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  if (next.drawnThisTurn >= 2) next.phase = "place";
  next.lastEvent = `${next.players[next.turn].name} drew a card`;
  if (card.kind === "golden_hive") next.players[next.turn].hiveShield = true;
  return next;
}

export function pickFromUsed(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") throw new Error("Not in pick-up phase");
  if (state.used.length === 0) throw new Error("Used pile empty");
  const next = cloneState(state);
  const card = next.used.pop()!;
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  if (next.drawnThisTurn >= 2) next.phase = "place";
  next.lastEvent = `${next.players[next.turn].name} took ${card.name} from the used pile`;
  if (card.kind === "golden_hive") next.players[next.turn].hiveShield = true;
  return next;
}

/* --------------------------- placement helpers --------------------------- */

/** Does this animal/sky-creature link to that creator card? */
export function animalLinksToCreator(animal: DeckCard, creator: DeckCard): boolean {
  if (animal.kind === "golden_body") return true; // wildcard
  if (creator.kind === "sky_creator") return true; // wildcard
  if (creator.kind !== "creator") return false;
  const el = creator.element!;
  // Sky creatures count for any element they share via their types
  return (animal.types ?? []).some((t) => TYPE_TO_ELEMENT[t] === el);
}

/** Find the creator card placed in this ecosystem that an animal would link to (if any). */
export function findLinkedCreator(
  eco: Ecosystem,
  animal: DeckCard,
): PlacedCard | null {
  for (const pc of eco.placed.values()) {
    if (pc.card.kind === "creator" || pc.card.kind === "sky_creator") {
      if (animalLinksToCreator(animal, pc.card)) return pc;
    }
  }
  return null;
}

/* --------------------------- place phase --------------------------- */

export function placeOnEcosystem(
  state: MatchState,
  cardUid: string,
  pos: Axial,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");

  const next = cloneState(state);
  const player = next.players[next.turn];
  const idx = player.hand.findIndex((c) => c.uid === cardUid);
  if (idx < 0) throw new Error("Card not in hand");
  const card = player.hand[idx];

  // Hive is a passive shield — it armed automatically the moment it was picked up.
  if (card.kind === "golden_hive") {
    throw new Error("Golden Hive is already armed (🛡 by your name). It can't be placed on the board — discard it to make room in your hand.");
  }

  // Only allow placement on a legal (adjacent) empty cell.
  const legal = legalEcoCells(player.ecosystem);
  if (!legal.some((c) => c.q === pos.q && c.r === pos.r)) {
    throw new Error("Hex must be empty and adjacent to your ecosystem");
  }

  // Rules: animals must adjoin / belong to a matching Creator. We enforce a
  // soft rule — animals can be placed freely; win-check verifies linkage.
  const rotation = bestRotationForPlacement(player.ecosystem, card, pos);
  player.ecosystem.placed.set(keyOf(pos), { card, pos, rotation });
  player.hand.splice(idx, 1);
  player.score += card.kind === "creator" || card.kind === "sky_creator" ? 3 : 1;
  next.placedThisTurn += 1;
  next.lastEvent = `${player.name} placed ${card.name}`;
  return afterAction(next);
}

/** Manually rotate a placed hex (+60° clockwise) in a player's ecosystem.
 *  Does not consume a turn / action — purely a presentation tweak. */
export function rotateMyPlacedHex(
  state: MatchState,
  playerId: string,
  posKey: string,
): MatchState {
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) return state;
  player.ecosystem = rotatePlacedHex(player.ecosystem, posKey);
  return next;
}

/** Move an already-placed card in your own ecosystem to another empty hex.
 *  Rule book: between draw and place, "you can move any existing cards to a
 *  better placement before you put down your 2 cards." Cards cannot be removed
 *  from the ecosystem — only repositioned. Does not consume a turn action. */
export function moveMyPlacedHex(
  state: MatchState,
  playerId: string,
  fromKey: string,
  toPos: Axial,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  const next = cloneState(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const existing = player.ecosystem.placed.get(fromKey);
  if (!existing) throw new Error("No card at that hex");
  const toKey = keyOf(toPos);
  if (toKey === fromKey) return next;
  const tempPlaced = new Map(player.ecosystem.placed);
  tempPlaced.delete(fromKey);
  if (tempPlaced.has(toKey)) throw new Error("That hex is already occupied");
  if (tempPlaced.size > 0) {
    const adjacent = neighbours(toPos).some((n) => tempPlaced.has(keyOf(n)));
    if (!adjacent) throw new Error("Target hex must touch your ecosystem");
  }
  tempPlaced.set(toKey, { ...existing, pos: toPos });
  player.ecosystem = { placed: tempPlaced };
  next.lastEvent = `${player.name} moved ${existing.card.name}`;
  return next;
}

export function discardCard(state: MatchState, cardUid: string): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");
  const next = cloneState(state);
  const player = next.players[next.turn];
  const idx = player.hand.findIndex((c) => c.uid === cardUid);
  if (idx < 0) throw new Error("Card not in hand");
  const [card] = player.hand.splice(idx, 1);
  next.used.push(card);
  next.placedThisTurn += 1;
  next.lastEvent = `${player.name} discarded ${card.name}`;
  return afterAction(next);
}

/**
 * Disaster: play a Creator Card to the used pile. Wipes every Animal in
 * every OTHER ecosystem that linked to this creator's element. Wiped animals
 * go to the disaster-player's ecosystem-pending stash → for simplicity in v1
 * we add them directly back to the disaster-player's hand for re-placement.
 * Hive shields absorb the disaster on a single victim.
 */
export function playDisaster(
  state: MatchState,
  creatorUid: string,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");
  const next = cloneState(state);
  const player = next.players[next.turn];
  const idx = player.hand.findIndex((c) => c.uid === creatorUid);
  if (idx < 0) throw new Error("Card not in hand");
  const creator = player.hand[idx];
  if (creator.kind !== "creator" && creator.kind !== "sky_creator") {
    throw new Error("Only Creator Cards can be played as a Disaster");
  }

  // Rule: only after you have your 4 creators may you spend extras as Disasters.
  const placedCreators = countCreators(player.ecosystem);
  if (placedCreators < CREATORS_NEEDED) {
    throw new Error(`Place your ${CREATORS_NEEDED} Creators in your ecosystem first`);
  }

  player.hand.splice(idx, 1);
  next.used.push(creator);

  let wiped = 0;
  for (const victim of next.players) {
    if (victim.id === player.id) continue;
    if (victim.hiveShield) {
      victim.hiveShield = false;
      next.lastEvent = `Hive shield absorbed the ${creator.name} disaster!`;
      continue;
    }
    const survivors = new Map<string, PlacedCard>();
    for (const [k, pc] of victim.ecosystem.placed) {
      const isAnimal = pc.card.kind === "animal" || pc.card.kind === "sky_creature" || pc.card.kind === "golden_body";
      if (isAnimal && animalLinksToCreator(pc.card, creator)) {
        // Wiped → return to current player's hand to place later.
        player.hand.push(pc.card);
        wiped += 1;
      } else {
        survivors.set(k, pc);
      }
    }
    victim.ecosystem.placed = survivors;
  }
  if (wiped > 0) next.lastEvent = `${player.name} played a ${creator.name} Disaster — ${wiped} animal${wiped > 1 ? "s" : ""} taken`;
  next.placedThisTurn += 1;
  return afterAction(next);
}

/**
 * Sky Creature steal — discard a sky_creature to the used pile, steal any
 * one animal from any opponent's ecosystem into your hand.
 */
export function playSkyCreatureSteal(
  state: MatchState,
  skyCreatureUid: string,
  victimId: string,
  victimPosKey: string,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");
  const next = cloneState(state);
  const player = next.players[next.turn];
  const idx = player.hand.findIndex((c) => c.uid === skyCreatureUid);
  if (idx < 0) throw new Error("Sky Creature not in hand");
  const sky = player.hand[idx];
  if (sky.kind !== "sky_creature") throw new Error("Only Sky Creatures can steal");

  const victim = next.players.find((p) => p.id === victimId);
  if (!victim) throw new Error("Victim not found");
  const stolen = victim.ecosystem.placed.get(victimPosKey);
  if (!stolen) throw new Error("Target hex empty");
  const k = stolen.card.kind;
  if (k !== "animal" && k !== "sky_creature" && k !== "golden_body") {
    throw new Error("Sky Creatures can only steal animals");
  }

  player.hand.splice(idx, 1);
  next.used.push(sky);
  victim.ecosystem.placed.delete(victimPosKey);
  player.hand.push(stolen.card);
  next.placedThisTurn += 1;
  next.lastEvent = `${player.name} stole ${stolen.card.name} from ${victim.name}`;
  return afterAction(next);
}

/* --------------------------- turn / win plumbing --------------------------- */

function afterAction(state: MatchState): MatchState {
  checkWin(state);
  if (state.finished) return state;
  if (state.placedThisTurn >= 2) advanceTurn(state);
  return state;
}

function advanceTurn(state: MatchState): void {
  // Skip to next player.
  state.turn = (state.turn + 1) % state.players.length;
  state.phase = "draw";
  state.drawnThisTurn = 0;
  state.placedThisTurn = 0;
  state.turnNumber += 1;

  // If both piles are empty AND no player can finish, end the match by score.
  if (state.draw.length === 0 && state.used.length === 0) {
    const anyCardsLeft = state.players.some((p) => p.hand.length > 0);
    if (!anyCardsLeft) finalise(state);
  }
}

function countCreators(eco: Ecosystem): number {
  let n = 0;
  for (const pc of eco.placed.values()) {
    if (pc.card.kind === "creator" || pc.card.kind === "sky_creator") n += 1;
  }
  return n;
}

export function ecosystemSummary(eco: Ecosystem) {
  let creators = 0;
  let animals = 0;
  for (const pc of eco.placed.values()) {
    const k = pc.card.kind;
    if (k === "creator" || k === "sky_creator") creators += 1;
    else if (k === "animal" || k === "sky_creature" || k === "golden_body") animals += 1;
  }
  return { creators, animals, total: eco.placed.size };
}

function checkWin(state: MatchState): void {
  for (const p of state.players) {
    const { creators, animals } = ecosystemSummary(p.ecosystem);
    if (creators < CREATORS_NEEDED) continue;
    if (animals < CREATORS_NEEDED * ANIMALS_PER_CREATOR) continue;
    const stillHoldingCreators = p.hand.some(
      (c) => c.kind === "creator" || c.kind === "sky_creator",
    );
    if (stillHoldingCreators) continue;
    finalise(state, p.id);
    return;
  }
}

function finalise(state: MatchState, winnerId?: string): void {
  state.finished = true;
  if (winnerId) {
    state.winnerId = winnerId;
  } else {
    const top = state.players.reduce((a, b) => (b.score > a.score ? b : a));
    state.winnerId = top.id;
  }
  state.lastEvent = `Match over — winner: ${
    state.players.find((p) => p.id === state.winnerId)?.name ?? "—"
  }`;
}
