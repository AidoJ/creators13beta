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
 * Win: first player to assemble a valid ecosystem: at least 4 Creators with
 * Earth / Fire / Air / Water covered, 12 matching Animals assigned 3-per-
 * chosen-Creator, and no Creator Cards left in hand.
 */

import {
  ANIMALS_PER_CREATOR,
  CREATORS_NEEDED,
  HAND_LIMIT,
  HAND_SIZE,
  playerTotalScore,
  type Axial,
  type DeckCard,
  type Ecosystem,
  type MatchState,
  type PlacedCard,
  type PlayerState,
} from "./types";
import { keyOf, neighbours } from "./board";
import { ELEMENTS, TYPE_TO_ELEMENT, type Element } from "./elements";
import type { CreatorTypeName } from "@/lib/gameCards";
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
  gameMode?: import("./types").GameMode;
  gameConfig?: import("./types").GameConfig;
}

export function createMatch(opts: CreateMatchOptions): MatchState {
  const rand = opts.rand ?? Math.random;
  const deck = shuffle(opts.deck, rand);

  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: [],
    ecosystem: { placed: new Map() },
    hiveShield: false,
    score: 0,
    firstPickupDone: false,
  }));

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
    pendingDisaster: null,
    gameMode: opts.gameMode ?? "end_of_days",
    gameConfig: opts.gameConfig ?? {},
  };
}


/** Opening pick-up: deal 5 cards in one go on a player's very first turn. */
export function drawInitialFive(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") throw new Error("Not in pick-up phase");
  const me = state.players[state.turn];
  if (me.firstPickupDone) throw new Error("Opening pick-up already done");
  if (state.draw.length === 0) throw new Error("Draw pile empty");
  const next = cloneState(state);
  const player = next.players[next.turn];
  const dealCount = Math.min(HAND_SIZE, next.draw.length);
  for (let i = 0; i < dealCount; i++) {
    const card = next.draw.shift()!;
    player.hand.push(card);
    if (card.kind === "golden_hive" && !card.spent) player.hiveShield = true;
  }
  player.firstPickupDone = true;
  next.drawnThisTurn = 2; // force advance to place phase
  next.phase = "place";
  next.lastEvent = `${player.name} drew their opening ${dealCount} cards`;
  return next;
}

/* --------------------------- pick-up phase --------------------------- */

export function pickFromDraw(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") throw new Error("Not in pick-up phase");
  if (state.draw.length === 0) throw new Error("Draw pile empty");
  const me = state.players[state.turn];
  if (!me.firstPickupDone) {
    throw new Error("First take your 5 opening cards.");
  }
  if (me.hand.length >= HAND_LIMIT) {
    throw new Error(`Hand limit reached (${HAND_LIMIT}). Play or discard cards before drawing more.`);
  }
  const next = cloneState(state);
  const card = next.draw.shift()!;
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  if (next.drawnThisTurn >= 2) next.phase = "place";
  next.lastEvent = `${next.players[next.turn].name} drew a card`;
  if (card.kind === "golden_hive" && !card.spent) next.players[next.turn].hiveShield = true;
  return next;
}

export function pickFromUsed(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") throw new Error("Not in pick-up phase");
  if (state.used.length === 0) throw new Error("Used pile empty");
  const me = state.players[state.turn];
  if (!me.firstPickupDone) {
    throw new Error("First take your 5 opening cards.");
  }
  if (me.hand.length >= HAND_LIMIT) {
    throw new Error(`Hand limit reached (${HAND_LIMIT}). Play or discard cards before drawing more.`);
  }
  const top = state.used[state.used.length - 1];
  if (top.kind === "golden_hive" && top.spent) {
    throw new Error("That Golden Hive has been spent — it can't be picked up.");
  }
  const next = cloneState(state);
  const popped = next.used.pop()!;
  // Tag with pickedUpThisTurn so it can't be re-weaponised as a Disaster
  // the same turn — the exploit being: pick up Creator → instantly play it
  // back as a disaster → opponent picks it up → repeats forever.
  const card = { ...popped, pickedUpThisTurn: true };
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  if (next.drawnThisTurn >= 2) next.phase = "place";
  next.lastEvent = `${next.players[next.turn].name} took ${card.name} from the used pile`;
  if (card.kind === "golden_hive" && !card.spent) next.players[next.turn].hiveShield = true;
  return next;
}

/** Skip the pick-up phase entirely and go straight to placement.
 *  Rule book treats pickup as up to 2 cards — players may choose to draw
 *  fewer (including zero) if their hand is already full or they don't need
 *  more cards. */
export function skipDraws(state: MatchState): MatchState {
  if (state.finished) return state;
  if (state.phase !== "draw") return state;
  const next = cloneState(state);
  next.phase = "place";
  next.lastEvent = `${next.players[next.turn].name} skipped pick-up`;
  return next;
}

/** End the current turn early (after placing 0 or 1 cards instead of 2). */
export function endTurnEarly(state: MatchState): MatchState {
  if (state.finished) return state;
  const next = cloneState(state);
  next.lastEvent = `${next.players[next.turn].name} ended their turn`;
  advanceTurn(next);
  return next;
}

/* --------------------------- placement helpers --------------------------- */

/** Does this animal/sky-creature link to that creator card? */
export function animalLinksToCreator(animal: DeckCard, creator: DeckCard): boolean {
  if (animal.kind === "golden_body") return true; // wildcard
  if (creator.kind === "sky_creator") {
    return (animal.types ?? []).some((t) => t === "Sky");
  }
  if (creator.kind !== "creator") return false;
  const animalTypes = (animal.types ?? []) as string[];
  // Strict rule: animal links ONLY if one of its 2 Creator Types matches this
  // Creator's exact type. (No element-bucket fallback — that caused huge
  // collateral wipes when a Fire Creator also pulled in Lava/Sun animals.)
  const creatorType = creator.displayType;
  if (creatorType) {
    return animalTypes.some((t) => t?.toLowerCase() === creatorType.toLowerCase());
  }
  // Truly untyped creator (shouldn't happen) — fall back to element match.
  const el = creator.element!;
  return animalTypes.some((t) => TYPE_TO_ELEMENT[t] === el);
}

/** Looser link rule used ONLY for win validation: an animal links to a creator
 *  if it shares the creator's ELEMENT (e.g. any Fire-element animal — Lava,
 *  Fire, Sun — counts toward any Fire-element creator). Disaster wipes keep
 *  the strict per-type rule via animalLinksToCreator. */
export function animalLinksToCreatorByElement(animal: DeckCard, creator: DeckCard): boolean {
  if (animal.kind === "golden_body") return true;
  if (creator.kind === "sky_creator") {
    return (animal.types ?? []).some((t) => t === "Sky" || TYPE_TO_ELEMENT[t as CreatorTypeName] === "Sky");
  }
  if (creator.kind !== "creator") return false;
  const el = creator.element;
  if (!el) return false;
  const animalTypes = (animal.types ?? []) as string[];
  return animalTypes.some((t) => TYPE_TO_ELEMENT[t as CreatorTypeName] === el);
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
  if (state.pendingDisaster) throw new Error("Resolve the pending Golden Hive prompt first.");

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
  if (state.pendingDisaster) throw new Error("Resolve the pending Golden Hive prompt first.");
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
 * every OTHER ecosystem that linked to this creator's element.
 *
 * If any victim holds an UNSPENT Golden Hive in their hand, the disaster
 * pauses (state.pendingDisaster is set) and waits for that victim to choose
 * Activate Now / Save for Later via `resolveDisaster`.
 */
export function playDisaster(
  state: MatchState,
  creatorUid: string,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");
  if (state.pendingDisaster) throw new Error("Resolve the pending Golden Hive prompt first.");
  
  const next = cloneState(state);
  const player = next.players[next.turn];
  const idx = player.hand.findIndex((c) => c.uid === creatorUid);
  if (idx < 0) throw new Error("Card not in hand");
  const creator = player.hand[idx];
  if (creator.kind !== "creator" && creator.kind !== "sky_creator") {
    throw new Error("Only Creator Cards can be played as a Disaster");
  }
  if (creator.pickedUpThisTurn) {
    throw new Error(
      "You just picked this Creator up from the used pile — you can place it on your board this turn, or use it as a Disaster on your NEXT turn.",
    );
  }
  if (creator.disasterSpent) {
    throw new Error(
      `This ${creator.name} has already been played as a Disaster — each Creator can only trigger one Disaster per match. You can still place it on your board.`,
    );
  }

  const spentCreator = { ...creator, disasterSpent: true };
  player.hand.splice(idx, 1);
  next.used.push(spentCreator);

  // Find a victim who can intercept with a Golden Hive in hand.
  const hiveVictim = next.players.find(
    (p) =>
      p.id !== player.id &&
      p.hand.some((c) => c.kind === "golden_hive" && !c.spent),
  );
  if (hiveVictim) {
    next.pendingDisaster = {
      attackerId: player.id,
      victimId: hiveVictim.id,
      creator,
    };
    next.lastEvent = `${player.name} played a ${creator.name} Disaster — waiting on ${hiveVictim.name}'s Golden Hive…`;
    // Disaster has been played but does not consume the placement slot until
    // resolved — that way the attacker can't sneak in another action while
    // the victim decides.
    return next;
  }

  applyDisasterWipe(next, player.id, creator);
  next.placedThisTurn += 1;
  return afterAction(next);
}

/** Victim's response to a pending disaster prompt. */
export function resolveDisaster(state: MatchState, useHive: boolean): MatchState {
  if (state.finished) return state;
  if (!state.pendingDisaster) throw new Error("No disaster pending");
  const next = cloneState(state);
  const pd = next.pendingDisaster!;
  const attacker = next.players.find((p) => p.id === pd.attackerId)!;
  const victim = next.players.find((p) => p.id === pd.victimId)!;

  if (useHive) {
    // Move the victim's Hive from hand to the used pile, flagged spent so
    // nobody can ever pick it up again.
    const hIdx = victim.hand.findIndex((c) => c.kind === "golden_hive" && !c.spent);
    if (hIdx < 0) throw new Error("Hive no longer in hand");
    const [hive] = victim.hand.splice(hIdx, 1);
    next.used.push({ ...hive, spent: true });
    victim.hiveShield = false;
    next.lastEvent = `${victim.name} activated their Golden Hive — the ${pd.creator.name} Disaster was blocked!`;
    // Other victims (if any 3+ player matches ever exist) still get hit.
    applyDisasterWipe(next, attacker.id, pd.creator, victim.id);
  } else {
    next.lastEvent = `${victim.name} saved their Golden Hive for later — the Disaster hits.`;
    applyDisasterWipe(next, attacker.id, pd.creator);
  }

  next.pendingDisaster = null;
  next.placedThisTurn += 1;
  return afterAction(next);
}

/** Internal: apply the wipe for every victim except `skipVictimId` (used when
 *  one victim's hive blocks them out of the wipe). */
function applyDisasterWipe(
  next: MatchState,
  attackerId: string,
  creator: DeckCard,
  skipVictimId?: string,
): void {
  const player = next.players.find((p) => p.id === attackerId)!;
  let wiped = 0;
  let placedOnBoard = 0;
  for (const victim of next.players) {
    if (victim.id === attackerId) continue;
    if (skipVictimId && victim.id === skipVictimId) continue;
    if (victim.hiveShield) {
      victim.hiveShield = false;
      next.lastEvent = `Hive shield absorbed the ${creator.name} disaster!`;
      continue;
    }
    const survivors = new Map<string, PlacedCard>();
    for (const [k, pc] of victim.ecosystem.placed) {
      // Golden Bodies are wildcard treasures and are immune to disasters —
      // only regular animals and sky creatures can be wiped.
      const isAnimal =
        pc.card.kind === "animal" ||
        pc.card.kind === "sky_creature";
      if (isAnimal && animalLinksToCreator(pc.card, creator)) {
        const cells = legalEcoCells(player.ecosystem);
        if (cells.length > 0) {
          const pos = cells[0];
          const rotation = bestRotationForPlacement(player.ecosystem, pc.card, pos);
          player.ecosystem.placed.set(keyOf(pos), { card: pc.card, pos, rotation });
          player.score += 1;
          placedOnBoard += 1;
        } else {
          player.hand.push(pc.card);
        }
        wiped += 1;
      } else {
        survivors.set(k, pc);
      }
    }
    victim.ecosystem.placed = survivors;
  }
  if (wiped > 0) {
    const tail =
      placedOnBoard === wiped
        ? `added to ${player.name}'s ecosystem`
        : placedOnBoard > 0
          ? `${placedOnBoard} added to ecosystem, ${wiped - placedOnBoard} to hand`
          : `returned to ${player.name}'s hand`;
    next.lastEvent = `${player.name} played a ${creator.name} Disaster — ${wiped} animal${wiped > 1 ? "s" : ""} taken (${tail})`;
  }
}

/**
 * Sky Creature steal — discard a sky_creature to the used pile, steal any
 * one animal from any opponent's ecosystem and place it directly onto the
 * stealer's own ecosystem at `placeAt`. If `placeAt` is omitted (e.g. bot
 * fallback), the stolen card goes to the stealer's hand instead.
 */
export function playSkyCreatureSteal(
  state: MatchState,
  skyCreatureUid: string,
  victimId: string,
  victimPosKey: string,
  placeAt?: Axial,
): MatchState {
  if (state.finished) throw new Error("Match is over");
  if (state.phase !== "place") throw new Error("Pick up 2 cards first");
  if (state.pendingDisaster) throw new Error("Resolve the pending Golden Hive prompt first.");
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

  if (placeAt) {
    const legal = legalEcoCells(player.ecosystem);
    if (!legal.some((c) => c.q === placeAt.q && c.r === placeAt.r)) {
      throw new Error("Pick a glowing hex on your own board to place the stolen card.");
    }
    
    const rotation = bestRotationForPlacement(player.ecosystem, stolen.card, placeAt);
    player.ecosystem.placed.set(keyOf(placeAt), { card: stolen.card, pos: placeAt, rotation });
    player.score += 1;
    next.lastEvent = `${player.name} stole ${stolen.card.name} from ${victim.name} and placed it`;
  } else {
    player.hand.push(stolen.card);
    next.lastEvent = `${player.name} stole ${stolen.card.name} from ${victim.name}`;
  }

  next.placedThisTurn += 1;
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
  // Clear pickedUpThisTurn flags so cards picked up last turn become
  // Disaster-eligible again from this point onward.
  for (const p of state.players) {
    p.hand = p.hand.map((c) => (c.pickedUpThisTurn ? { ...c, pickedUpThisTurn: false } : c));
  }
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

export interface EcosystemWinValidation {
  valid: boolean;
  creators: DeckCard[];
  animals: DeckCard[];
  selectedCreators: DeckCard[];
  stillHoldingCreators: DeckCard[];
  hasElementCoverage: boolean;
}

/** Full classic ecosystem validation shared by human and bot actions. */
export function validateEcosystemWin(player: PlayerState): EcosystemWinValidation {
  const placed = Array.from(player.ecosystem.placed.values()).map((pc) => pc.card);
  const creators = placed.filter(
    (c) => c.kind === "creator" || c.kind === "sky_creator",
  );
  const animals = placed.filter(
    (c) => c.kind === "animal" || c.kind === "sky_creature" || c.kind === "golden_body",
  );
  const stillHoldingCreators = player.hand.filter(
    (c) => c.kind === "creator" || c.kind === "sky_creator",
  );

  if (creators.length < CREATORS_NEEDED || animals.length < CREATORS_NEEDED * ANIMALS_PER_CREATOR) {
    return { valid: false, creators, animals, selectedCreators: [], stillHoldingCreators, hasElementCoverage: false };
  }

  const quartets = enumerateElementCoveringQuartets(creators);
  for (const quartet of quartets) {
    if (canAssignAnimalsToCreators(quartet, animals)) {
      return {
        valid: stillHoldingCreators.length === 0,
        creators,
        animals,
        selectedCreators: quartet,
        stillHoldingCreators,
        hasElementCoverage: true,
      };
    }
  }

  return {
    valid: false,
    creators,
    animals,
    selectedCreators: [],
    stillHoldingCreators,
    hasElementCoverage: quartets.length > 0,
  };
}

/** Can we pick exactly ANIMALS_PER_CREATOR animals per creator from the placed
 *  animal pool such that every chosen animal links to its assigned creator?
 *  Extra animals on the board beyond 3 × creators are allowed and simply unused. */
function canAssignAnimalsToCreators(creators: DeckCard[], animals: DeckCard[]): boolean {
  if (creators.length !== CREATORS_NEEDED) return false;
  if (animals.length < CREATORS_NEEDED * ANIMALS_PER_CREATOR) return false;
  const slots = creators.map((creator) => ({ creator, assigned: [] as number[] }));
  const used = new Set<number>();

  const recurse = (): boolean => {
    if (slots.every((slot) => slot.assigned.length === ANIMALS_PER_CREATOR)) return true;

    let targetIndex = -1;
    let targetOptions: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.assigned.length >= ANIMALS_PER_CREATOR) continue;
      const options = animals
        .map((animal, idx) => ({ animal, idx }))
        .filter(({ animal, idx }) => !used.has(idx) && animalLinksToCreator(animal, slot.creator))
        .map(({ idx }) => idx);
      if (targetIndex === -1 || options.length < targetOptions.length) {
        targetIndex = i;
        targetOptions = options;
      }
    }

    if (targetIndex === -1 || targetOptions.length === 0) return false;
    for (const animalIndex of targetOptions) {
      used.add(animalIndex);
      slots[targetIndex].assigned.push(animalIndex);
      if (recurse()) return true;
      slots[targetIndex].assigned.pop();
      used.delete(animalIndex);
    }
    return false;
  };

  return recurse();
}

function checkWin(state: MatchState): void {
  // First-to-N points game mode wins as soon as anyone hits target.
  if (state.gameMode === "first_to_50") {
    const target = state.gameConfig?.targetScore ?? 50;
    let bestId: string | null = null;
    let bestPts = -1;
    for (const p of state.players) {
      const pts = playerTotalScore(p);
      if (pts >= target && pts > bestPts) {
        bestPts = pts;
        bestId = p.id;
      }
    }
    if (bestId) {
      finalise(state, bestId);
      return;
    }
  }

  // Classic ecosystem-complete win (end_of_days, also a valid early win for first_to_50).
  // Rule: the placed ecosystem must contain AT LEAST one Creator covering each
  // of the four elements (Earth / Fire / Air / Water — Sky Creator is a wildcard),
  // and there must exist a way to assign 3 placed animals to each of those four
  // chosen Creators matching its Creator Type. Extra Creators / animals on the
  // board beyond that selection are allowed.
  for (const p of state.players) {
    if (!validateEcosystemWin(p).valid) continue;
    finalise(state, p.id);
    return;
  }
}

/** Return all 4-creator subsets of `creators` such that each of the 4 elements
 *  (earth / fire / air / water) is covered by exactly one creator in the subset.
 *  Sky Creators act as wildcards (can fill any element slot). */
function enumerateElementCoveringQuartets(creators: DeckCard[]): DeckCard[][] {
  const out: DeckCard[][] = [];
  const seen = new Set<string>();
  const used = new Set<number>();
  const picked: DeckCard[] = [];
  const elementsOf = (c: DeckCard): Element[] =>
    c.kind === "sky_creator" ? ELEMENTS : c.element ? [c.element] : [];
  const recurse = (eIdx: number) => {
    if (eIdx === ELEMENTS.length) {
      const key = [...used].sort((a, b) => a - b).join(",");
      if (!seen.has(key)) { seen.add(key); out.push(picked.slice()); }
      return;
    }
    const el = ELEMENTS[eIdx];
    for (let i = 0; i < creators.length; i++) {
      if (used.has(i)) continue;
      if (!elementsOf(creators[i]).includes(el)) continue;
      used.add(i); picked.push(creators[i]);
      recurse(eIdx + 1);
      used.delete(i); picked.pop();
    }
  };
  recurse(0);
  return out;
}

/** Force-finalise (e.g. Beat-the-Clock timer expiry). Highest total score wins. */
export function finaliseByScore(state: MatchState): MatchState {
  if (state.finished) return state;
  const next = cloneState(state);
  const top = next.players.reduce((a, b) =>
    playerTotalScore(b) > playerTotalScore(a) ? b : a,
  );
  finalise(next, top.id);
  next.lastEvent = `Time's up — ${top.name} wins on points!`;
  return next;
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
