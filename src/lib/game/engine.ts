/**
 * Turn engine for BCreators. Pure functions — never mutate input.
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
import { keyOf, neighbours, isAdjacent, NEIGHBOUR_DIRS } from "./board";
import { ELEMENTS, TYPE_TO_ELEMENT, type Element } from "./elements";

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
    // Golden Hive does NOT auto-arm on pickup — per the rule book the shield
    // only fires when the victim chooses to use it during a Disaster prompt.
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
  // Hive does NOT auto-arm — it stays passive in hand until used to block a disaster.
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
  if (top.spent) {
    const label = top.kind === "golden_hive" ? "Golden Hive" : top.kind === "sky_creature" ? "Sky Creature Stealer" : top.name;
    throw new Error(`That ${label} has been spent — it can't be picked up.`);
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
  // Hive does NOT auto-arm — it stays passive in hand until used to block a disaster.
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

/** Sky Creator no longer "locks" to a sub-type. Under the current rules
 *  only Sky Creature cards may sit adjacent to a Sky Creator, so there are
 *  no regular animals to derive a sub-type from. The function is retained
 *  for callers that expect a string|null return, and always returns null. */
export function skyLockedSubType(_eco: Ecosystem, _skyPos: Axial): string | null {
  return null;
}

/** True iff this Sky Creator has 3 or more adjacent Sky Creature cards. A
 *  Sky cluster is treated as a deferred-wildcard creator: its element is
 *  unspecified until win-check time, at which point it fills whichever of
 *  the four elements is missing from the rest of the ecosystem. */
export function isSkyCluster(eco: Ecosystem, skyPos: Axial): boolean {
  let n = 0;
  for (const nb of neighbours(skyPos)) {
    const pc = eco.placed.get(keyOf(nb));
    if (pc?.card.kind === "sky_creature") n += 1;
  }
  return n >= 3;
}

/** Returns the Creator-Type colour a Golden Body should mirror on its second
 *  hex-half so the board visually shows what it's locked into. A Golden Body
 *  is a wildcard animal placed adjacent to one Creator card — we return that
 *  Creator's displayType (or element name fallback). Null if no adjacent
 *  Creator card. */
export function goldenBodyLockedType(eco: Ecosystem, gbPos: Axial): string | null {
  for (const n of neighbours(gbPos)) {
    const pc = eco.placed.get(keyOf(n));
    if (!pc) continue;
    if (pc.card.kind === "creator") {
      return (pc.card.displayType as string | undefined) ?? (pc.card.element as string | undefined) ?? null;
    }
    if (pc.card.kind === "sky_creator") {
      const sub = skyLockedSubType(eco, pc.pos);
      return sub ?? "Sky";
    }
  }
  return null;
}


function animalTouchesCreatorAs(
  animalPc: PlacedCard,
  creatorPc: PlacedCard,
  opts?: { skySubType?: string | null; skyCluster?: boolean },
): boolean {
  if (!isAdjacent(animalPc.pos, creatorPc.pos)) return false;
  if (animalPc.card.kind === "golden_body") return true;
  if (animalPc.card.kind !== "animal" && animalPc.card.kind !== "sky_creature") return false;
  const animalTypes = animalPc.card.types ?? [];
  if (creatorPc.card.kind === "sky_creator") {
    // Sky cluster: only Sky Creatures (or Golden-Body wildcards) count as
    // the creator's three "animals" — and they must be adjacent (already
    // checked above).
    if (opts?.skyCluster) return animalPc.card.kind === "sky_creature";
    const sub = opts?.skySubType;
    return !!sub && animalTypes.some((t) => t.toLowerCase() === sub.toLowerCase());
  }
  if (creatorPc.card.kind !== "creator") return false;
  const creatorType = creatorPc.card.displayType;
  if (creatorType) return animalTypes.some((t) => t.toLowerCase() === creatorType.toLowerCase());
  const el = creatorPc.card.element;
  return !!el && animalTypes.some((t) => TYPE_TO_ELEMENT[t as keyof typeof TYPE_TO_ELEMENT] === el);
}

/** Does this animal/sky-creature link to that creator card?
 *  For Sky Creators, pass `opts.skySubType` (locked sub-type) so the check
 *  matches animals of that sub-type. Pass `opts.optimistic` to treat a Sky
 *  as matching any typed animal (used by the bot / link-finder — the Sky's
 *  sub-type is only resolved at win-check time). */
export function animalLinksToCreator(
  animal: DeckCard,
  creator: DeckCard,
  opts?: { skySubType?: string | null; skyCluster?: boolean; optimistic?: boolean },
): boolean {
  if (animal.kind === "golden_body") return true; // wildcard
  if (creator.kind === "sky_creator") {
    if (opts?.skyCluster) return animal.kind === "sky_creature";
    if (opts?.optimistic) {
      return ((animal.types ?? []) as string[]).some((t) => !!t);
    }
    const sub = opts?.skySubType;
    if (!sub) return false;
    return ((animal.types ?? []) as string[]).some(
      (t) => t?.toLowerCase() === sub.toLowerCase(),
    );
  }
  if (creator.kind !== "creator") return false;
  const animalTypes = (animal.types ?? []) as string[];
  const creatorType = creator.displayType;
  if (creatorType) {
    return animalTypes.some((t) => t?.toLowerCase() === creatorType.toLowerCase());
  }
  const el = creator.element!;
  return animalTypes.some((t) => TYPE_TO_ELEMENT[t as keyof typeof TYPE_TO_ELEMENT] === el);
}

/** Find the creator card placed in this ecosystem that an animal would link to (if any). */
export function findLinkedCreator(
  eco: Ecosystem,
  animal: DeckCard,
): PlacedCard | null {
  for (const pc of eco.placed.values()) {
    if (pc.card.kind === "creator" || pc.card.kind === "sky_creator") {
      // Optimistic: Sky Creators here count as matching any typed animal.
      if (animalLinksToCreator(animal, pc.card, { optimistic: true })) return pc;
    }
  }
  return null;
}

function findAdjacentDriverCreator(eco: Ecosystem, card: DeckCard, pos: Axial): PlacedCard | undefined {
  const adjacentCreators = neighbours(pos)
    .map((n) => eco.placed.get(keyOf(n)))
    .filter((pc): pc is PlacedCard => !!pc && (pc.card.kind === "creator" || pc.card.kind === "sky_creator"));
  return adjacentCreators.find((pc) => animalLinksToCreator(card, pc.card, { optimistic: true })) ?? adjacentCreators[0];
}

/* --------------------------- adjacency match rule --------------------------- */

/** Updated rule set:
 *   - Creator cards (regular + Sky) can be placed anywhere; they need no
 *     type match with their neighbours.
 *   - Sky Creator reserves every adjacent cell for Sky Creature cards only —
 *     regular animals, Golden Body and Golden Hive cannot land there.
 *   - Golden Body is a wildcard animal; it can sit beside any non-Sky-Creator
 *     card.
 *   - Animals / Sky Creatures need AT LEAST ONE legal neighbour: a Creator
 *     (wildcard), a Golden card (wildcard), or another animal/sky-creature
 *     that shares at least one Creator Type. Non-matching animal neighbours
 *     on other sides do NOT block placement — they just aren't the anchor.
 */
function adjacencyError(
  eco: Ecosystem,
  card: DeckCard,
  pos: Axial,
): string | null {
  // Creators (incl. Sky Creator) place anywhere.
  if (card.kind === "creator" || card.kind === "sky_creator") return null;

  let sawNeighbour = false;
  let hasAnchor = false;
  for (let dir = 0; dir < 6; dir++) {
    const d = NEIGHBOUR_DIRS[dir];
    const nKey = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
    const pc = eco.placed.get(nKey);
    if (!pc) continue;
    sawNeighbour = true;

    // Hard veto: Sky Creator reserves its neighbour cells for Sky Creatures.
    if (pc.card.kind === "sky_creator") {
      if (card.kind !== "sky_creature") {
        return `Only Sky Creature cards can sit next to a Sky Creator.`;
      }
      hasAnchor = true;
      continue;
    }

    // Wildcard neighbours always count as an anchor.
    if (
      pc.card.kind === "creator" ||
      pc.card.kind === "golden_body" ||
      pc.card.kind === "golden_hive" ||
      card.kind === "golden_body"
    ) {
      hasAnchor = true;
      continue;
    }

    // Animal/sky-creature neighbour: anchor iff they share a Creator Type.
    if (card.kind === "animal" || card.kind === "sky_creature") {
      const myTypes = ((card.types ?? []) as string[]).filter(Boolean);
      const theirTypes = ((pc.card.types ?? []) as string[]).filter(Boolean);
      if (myTypes.some((mine) => theirTypes.some((t) => mine.toLowerCase() === t.toLowerCase()))) {
        hasAnchor = true;
      }
    }
  }

  if (sawNeighbour && !hasAnchor) {
    return `${card.name} needs at least one neighbour that shares a Creator Type (or a Creator / Golden card).`;
  }
  return null;
}

/** Throws a friendly error if `card` cannot be placed at `pos`. */
function assertAdjacencyMatches(eco: Ecosystem, card: DeckCard, pos: Axial): void {
  const err = adjacencyError(eco, card, pos);
  if (err) throw new Error(err);
}

/** Returns true iff placing `card` at `pos` would respect the adjacency rule. */
export function placementMatchesNeighbours(eco: Ecosystem, card: DeckCard, pos: Axial): boolean {
  return adjacencyError(eco, card, pos) === null;
}

/** Kept for backwards compatibility (used by older callers / tests). Returns
 *  true when the two cards could legally touch under the new rule set,
 *  ignoring rotation-aware half-match nuance. */
export function cardsShareCreatorType(a: DeckCard, b: DeckCard): boolean {
  if (a.kind === "creator" || a.kind === "sky_creator") return b.kind !== "sky_creator" || a.kind === "creator" || a.kind === "sky_creator";
  if (b.kind === "creator") return true;
  if (b.kind === "sky_creator") return a.kind === "sky_creature";
  if (a.kind === "golden_body" || a.kind === "golden_hive") return true;
  if (b.kind === "golden_body" || b.kind === "golden_hive") return true;
  const ta = ((a.types ?? []) as string[]).map((t) => t?.toLowerCase());
  const tb = new Set(((b.types ?? []) as string[]).map((t) => t?.toLowerCase()));
  return ta.some((t) => tb.has(t));
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

  // Adjacency-match rule: every neighbouring card must share a Creator Type
  // with the incoming card (wildcards — Sky Creator, Golden Body — match all).
  assertAdjacencyMatches(player.ecosystem, card, pos);


  // Rules: animals must adjoin / belong to a matching Creator. We enforce a
  // soft rule — animals can be placed freely; win-check verifies linkage.


  // Auto-pivot rules: an animal only pivots when it lands next to a matching
  // Creator (or Sky-Creator). Creator cards have no facing colour halves, so
  // their rotation stays 0; placing a Creator instead triggers repivot on any
  // adjacent animals that now have a Creator neighbour.
  const isAnimalLike = card.kind === "animal" || card.kind === "sky_creature";
  // For an animal landing next to a Creator, pin rotation to that single
  // Creator so the matching half deterministically faces it.
  const driverCreator = isAnimalLike
    ? findAdjacentDriverCreator(player.ecosystem, card, pos)
    : undefined;
  const rotation = isAnimalLike
    ? bestRotationForPlacement(player.ecosystem, card, pos, {
        restrictTo: "creator-only",
        driverPos: driverCreator?.pos,
      })
    : 0;
  player.ecosystem.placed.set(keyOf(pos), { card, pos, rotation });
  if (isAnimalLike) {
    const lockedRotation = bestRotationForPlacement(player.ecosystem, card, pos, {
      restrictTo: "creator-only",
      currentRotation: rotation,
      driverPos: driverCreator?.pos,
    });
    player.ecosystem.placed.set(keyOf(pos), { card, pos, rotation: lockedRotation });
  }
  // After placing, re-pivot adjacent animals — when the placed card is a
  // Creator, drive their rotation off this new Creator only.
  repivotNeighbours(player.ecosystem, pos, pos);
  repivotSkyLockNeighbours(player.ecosystem, pos);
  player.hand.splice(idx, 1);
  player.score += card.kind === "creator" || card.kind === "sky_creator" ? 3 : 1;
  next.placedThisTurn += 1;
  next.lastEvent = `${player.name} placed ${card.name}`;
  return afterAction(next);
}

/** After a card lands at `pos`, re-pivot every adjacent animal/sky-creature
 *  so its matching half faces the freshly updated ecosystem. When `driverPos`
 *  is provided, each animal pivots toward THAT hex only — useful when a
 *  Creator was just placed and should be the sole driver for its neighbours. */
function repivotNeighbours(eco: Ecosystem, pos: Axial, driverPos?: Axial): void {
  for (const n of neighbours(pos)) {
    const nKey = keyOf(n);
    const pc = eco.placed.get(nKey);
    if (!pc) continue;
    if (pc.card.kind !== "animal" && pc.card.kind !== "sky_creature") continue;
    const newRot = bestRotationForPlacement(eco, pc.card, pc.pos, {
      restrictTo: "creator-only",
      currentRotation: pc.rotation ?? 0,
      driverPos,
    });
    if (newRot !== (pc.rotation ?? 0)) {
      eco.placed.set(nKey, { ...pc, rotation: newRot });
    }
  }
}

function repivotSkyLockNeighbours(eco: Ecosystem, pos: Axial): void {
  const skyPcs = [eco.placed.get(keyOf(pos)), ...neighbours(pos).map((n) => eco.placed.get(keyOf(n)))]
    .filter((pc): pc is PlacedCard => !!pc && pc.card.kind === "sky_creator");
  for (const skyPc of skyPcs) {
    if (!skyLockedSubType(eco, skyPc.pos)) continue;
    repivotNeighbours(eco, skyPc.pos, skyPc.pos);
  }
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
  checkWin(next);
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
  // Adjacency-match rule: also applies to repositioning.
  assertAdjacencyMatches({ placed: tempPlaced }, existing.card, toPos);

  tempPlaced.set(toKey, { ...existing, pos: toPos });
  player.ecosystem = { placed: tempPlaced };
  // Re-pivot the moved card to match its new neighbours, and re-pivot any
  // adjacent animals whose neighbour set just changed.
  if (existing.card.kind === "animal" || existing.card.kind === "sky_creature") {
    const driverCreator = findAdjacentDriverCreator(player.ecosystem, existing.card, toPos);
    const newRot = bestRotationForPlacement(player.ecosystem, existing.card, toPos, {
      restrictTo: "creator-only",
      currentRotation: existing.rotation ?? 0,
      driverPos: driverCreator?.pos,
    });
    player.ecosystem.placed.set(toKey, { ...existing, pos: toPos, rotation: newRot });
  }
  repivotNeighbours(player.ecosystem, toPos, toPos);
  repivotSkyLockNeighbours(player.ecosystem, toPos);
  next.lastEvent = `${player.name} moved ${existing.card.name}`;
  checkWin(next);
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

  // Rule book prerequisite: you may only unleash a Disaster once your own
  // ecosystem covers all four elements (Earth/Fire/Air/Water). A Sky Creator
  // on your board counts for the element of its locked sub-type if locked;
  // otherwise it counts for ANY element it's currently adjacent to. A Sky
  // Creator that has formed a "Sky cluster" (≥3 adjacent Sky Creatures) is a
  // deferred wildcard — it fills whichever single element is otherwise
  // missing from the rest of the ecosystem.
  const myElements = new Set<Element>();
  let hasWildcardSky = false;
  for (const pc of player.ecosystem.placed.values()) {
    if (pc.card.kind === "creator" && pc.card.element) {
      myElements.add(pc.card.element);
    } else if (pc.card.kind === "sky_creator") {
      if (isSkyCluster(player.ecosystem, pc.pos)) {
        hasWildcardSky = true;
        continue;
      }
      const sub = skyLockedSubType(player.ecosystem, pc.pos);
      if (sub) {
        const el = TYPE_TO_ELEMENT[sub as keyof typeof TYPE_TO_ELEMENT];
        if (el && el !== "Sky") myElements.add(el as Element);
        continue;
      }
      // Unlocked Sky → look at neighbours and credit every element it touches.
      for (const n of neighbours(pc.pos)) {
        const nb = player.ecosystem.placed.get(keyOf(n));
        if (!nb) continue;
        if (nb.card.kind === "creator" && nb.card.element) {
          myElements.add(nb.card.element);
        } else if (nb.card.kind === "animal" || nb.card.kind === "sky_creature") {
          for (const t of nb.card.types ?? []) {
            if (!t || t === "Sky") continue;
            const el = TYPE_TO_ELEMENT[t as keyof typeof TYPE_TO_ELEMENT];
            if (el && el !== "Sky") myElements.add(el as Element);
          }
        }
      }
    }
  }
  if (hasWildcardSky && myElements.size >= ELEMENTS.length - 1) {
    for (const e of ELEMENTS) myElements.add(e);
  }
  if (!ELEMENTS.every((e) => myElements.has(e))) {
    throw new Error(
      "You must place one Creator of each element (Earth, Fire, Air, Water) on your own board before you can unleash a Disaster. A Sky Creator counts for whatever element it's connected to.",
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
      // Sky Creator Disaster (rule book): wipes ONLY mythical creatures
      // carrying the Sky symbol — i.e. sky_creature cards. Regular animals
      // and Golden Bodies are untouched.
      const wipesThis = creator.kind === "sky_creator"
        ? pc.card.kind === "sky_creature"
        : isAnimal && animalLinksToCreator(pc.card, creator);
      if (wipesThis) {
        const cells = legalEcoCells(player.ecosystem);
        if (cells.length > 0) {
          const pos = cells[0];
          const driverCreator = findAdjacentDriverCreator(player.ecosystem, pc.card, pos);
          const rotation = bestRotationForPlacement(player.ecosystem, pc.card, pos, {
            restrictTo: "creator-only",
            driverPos: driverCreator?.pos,
          });
          player.ecosystem.placed.set(keyOf(pos), { card: pc.card, pos, rotation });
          repivotSkyLockNeighbours(player.ecosystem, pos);
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
  if (k === "golden_body") {
    throw new Error("Golden Body is a wildcard treasure and cannot be stolen.");
  }
  if (k !== "animal" && k !== "sky_creature") {
    throw new Error("Sky Creatures can only steal animals.");
  }
  if (!placeAt) {
    throw new Error("Pick a hex on your own board to place the stolen animal.");
  }

  const legal = legalEcoCells(player.ecosystem);
  if (!legal.some((c) => c.q === placeAt.q && c.r === placeAt.r)) {
    throw new Error("Pick a glowing hex on your own board to place the stolen card.");
  }
  assertAdjacencyMatches(player.ecosystem, stolen.card, placeAt);

  player.hand.splice(idx, 1);
  // Sky Creature played as a Stealer goes to the used pile FLAGGED SPENT so
  // no other player can pick it up.
  next.used.push({ ...sky, spent: true });
  victim.ecosystem.placed.delete(victimPosKey);

  const driverCreator = findAdjacentDriverCreator(player.ecosystem, stolen.card, placeAt);
  const rotation = bestRotationForPlacement(player.ecosystem, stolen.card, placeAt, {
    restrictTo: "creator-only",
    driverPos: driverCreator?.pos,
  });
  player.ecosystem.placed.set(keyOf(placeAt), { card: stolen.card, pos: placeAt, rotation });
  repivotSkyLockNeighbours(player.ecosystem, placeAt);
  player.score += 1;
  next.lastEvent = `${player.name} stole ${stolen.card.name} from ${victim.name} and placed it`;


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


  // Both piles empty AND no player can play any more cards.
  if (state.draw.length === 0 && state.used.length === 0) {
    const anyCardsLeft = state.players.some((p) => p.hand.length > 0);
    if (!anyCardsLeft) {
      // End of Days is ecosystem-only — no "highest score wins" fallback.
      // If nobody has assembled a valid ecosystem the match is a DRAW
      // (winnerId = null). Progress awards half points to each player.
      // Top Score / Beat the Clock still resolve by score.
      if ((state.gameMode ?? "end_of_days") === "end_of_days") {
        state.finished = true;
        state.winnerId = null;
        state.lastEvent =
          "Both piles are empty and no one completed a valid ecosystem — match ends in a draw. Each player earns half points.";
      } else {
        finalise(state);
      }
    }
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

/** Full classic ecosystem validation shared by human and bot actions.
 *
 *  Win rule: 4 Creators covering Earth/Fire/Air/Water (Sky Creator wildcard),
 *  3 animals assigned per chosen Creator (Golden Body wildcard animal), AND
 *  each assigned animal must be PLACED ON THE BOARD TOUCHING that Creator's
 *  hex (axial neighbour). Animals not adjacent to any matching Creator do
 *  not count toward the win. */
export function validateEcosystemWin(player: PlayerState): EcosystemWinValidation {
  const placedAll = Array.from(player.ecosystem.placed.values());
  const creatorPcs = placedAll.filter(
    (pc) => pc.card.kind === "creator" || pc.card.kind === "sky_creator",
  );
  const animalPcs = placedAll.filter(
    (pc) =>
      pc.card.kind === "animal" ||
      pc.card.kind === "sky_creature" ||
      pc.card.kind === "golden_body",
  );
  const creators = creatorPcs.map((pc) => pc.card);
  const animals = animalPcs.map((pc) => pc.card);
  const stillHoldingCreators = player.hand.filter(
    (c) => c.kind === "creator" || c.kind === "sky_creator",
  );

  if (creators.length < CREATORS_NEEDED || animals.length < CREATORS_NEEDED * ANIMALS_PER_CREATOR) {
    return { valid: false, creators, animals, selectedCreators: [], stillHoldingCreators, hasElementCoverage: false };
  }

  // Map card -> PlacedCard so we can recover positions after quartet enumeration.
  const pcByUid = new Map<string, PlacedCard>();
  for (const pc of placedAll) pcByUid.set(pc.card.uid, pc);

  // Pre-compute Sky Creators' locked sub-types AND cluster flags from the board.
  // A Sky cluster (≥3 adjacent Sky Creatures) is a deferred wildcard: its
  // element is whichever of Earth/Fire/Air/Water is otherwise missing.
  const skySubByUid = new Map<string, string | null>();
  const skyClusterByUid = new Map<string, boolean>();
  for (const pc of creatorPcs) {
    if (pc.card.kind === "sky_creator") {
      const cluster = isSkyCluster(player.ecosystem, pc.pos);
      skyClusterByUid.set(pc.card.uid, cluster);
      skySubByUid.set(pc.card.uid, cluster ? null : skyLockedSubType(player.ecosystem, pc.pos));
    }
  }

  const quartets = enumerateElementCoveringQuartets(creators, (c) => {
    if (c.kind === "sky_creator") {
      if (skyClusterByUid.get(c.uid)) return ELEMENTS; // deferred wildcard fills any element
      const sub = skySubByUid.get(c.uid) ?? null;
      if (!sub) return [];
      const el = TYPE_TO_ELEMENT[sub as keyof typeof TYPE_TO_ELEMENT];
      return el && el !== "Sky" ? [el as Element] : [];
    }
    return c.element ? [c.element] : [];
  });
  for (const quartet of quartets) {
    const quartetPcs = quartet.map((c) => pcByUid.get(c.uid)!).filter(Boolean);
    if (quartetPcs.length !== quartet.length) continue;
    if (canAssignAdjacentAnimalsToCreators(quartetPcs, animalPcs, skySubByUid, skyClusterByUid)) {
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

/** Backtracking assignment: each creator must get exactly 3 placed animals
 *  that (a) link by Creator Type and (b) sit on an axial neighbour hex. */
function canAssignAdjacentAnimalsToCreators(
  creators: PlacedCard[],
  animals: PlacedCard[],
  skySubByUid?: Map<string, string | null>,
  skyClusterByUid?: Map<string, boolean>,
): boolean {
  if (creators.length !== CREATORS_NEEDED) return false;
  if (animals.length < CREATORS_NEEDED * ANIMALS_PER_CREATOR) return false;
  const slots = creators.map((creator) => ({ creator, assigned: [] as number[] }));
  const used = new Set<number>();

  const linkOpts = (creator: DeckCard) =>
    creator.kind === "sky_creator"
      ? {
          skySubType: skySubByUid?.get(creator.uid) ?? null,
          skyCluster: skyClusterByUid?.get(creator.uid) ?? false,
        }
      : undefined;

  const recurse = (): boolean => {
    if (slots.every((slot) => slot.assigned.length === ANIMALS_PER_CREATOR)) return true;

    let targetIndex = -1;
    let targetOptions: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.assigned.length >= ANIMALS_PER_CREATOR) continue;
      const options = animals
        .map((animalPc, idx) => ({ animalPc, idx }))
        .filter(({ animalPc, idx }) =>
          !used.has(idx) &&
          animalTouchesCreatorAs(animalPc, slot.creator, linkOpts(slot.creator.card)),
        )
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
function enumerateElementCoveringQuartets(
  creators: DeckCard[],
  elementsOf?: (c: DeckCard) => Element[],
): DeckCard[][] {
  const out: DeckCard[][] = [];
  const seen = new Set<string>();
  const used = new Set<number>();
  const picked: DeckCard[] = [];
  const elsOf = elementsOf ?? ((c: DeckCard): Element[] =>
    c.kind === "sky_creator" ? ELEMENTS : c.element ? [c.element] : []);
  const recurse = (eIdx: number) => {
    if (eIdx === ELEMENTS.length) {
      const key = [...used].sort((a, b) => a - b).join(",");
      if (!seen.has(key)) { seen.add(key); out.push(picked.slice()); }
      return;
    }
    const el = ELEMENTS[eIdx];
    for (let i = 0; i < creators.length; i++) {
      if (used.has(i)) continue;
      if (!elsOf(creators[i]).includes(el)) continue;
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
