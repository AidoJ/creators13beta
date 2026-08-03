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

/* ----------------- pickup / reshuffle rules (lockstep) -----------------
 *  These two predicates are the SINGLE SOURCE OF TRUTH for what counts as
 *  a legal pickup. Both `pickFromUsed`/`pickFromDraw` (the actual moves)
 *  and `playerHasAnyLegalMove` (the stalemate backstop) consume them, so
 *  the rule and the legal-move check can never drift.
 *
 *  Rule: a spent Sky Creature can still be picked up from the used pile
 *  and placed as a plain animal (it never steals again — `spent` stays
 *  true so it's also excluded from any future reshuffle). A spent Hive
 *  can NEVER be picked up. Everything else is pickable iff not spent.
 *  `disasterSpent` creators are still pickable — that flag only blocks
 *  re-using them as a Disaster, not normal pickup/placement. */
export function isUsedTopPickable(card: DeckCard | undefined | null): boolean {
  if (!card) return false;
  if (card.kind === "golden_hive") return !card.spent;
  if (card.kind === "sky_creature") return true; // spent or not
  return !card.spent;
}

/** True iff the player has a draw-phase pickup available right now.
 *  Mirrors the rules enforced inside pickFromDraw / pickFromUsed —
 *  including the lazy reshuffle: an empty draw pile is still "drawable"
 *  if the used pile contains any non-spent (i.e. reshuffleable) cards. */
export function playerCanPickUp(state: MatchState, slot: number): boolean {
  const p = state.players[slot];
  if (!p) return false;
  if (p.hand.length >= HAND_LIMIT) return false;
  // Direct draw, or reshuffle would refill draw.
  if (state.draw.length > 0) return true;
  if (state.used.some((c) => !c.spent)) return true;
  // No draw possible, but spent Sky Creature on top is still pickable.
  const top = state.used[state.used.length - 1];
  return isUsedTopPickable(top);
}

/** Move every non-spent card from `used` into `draw` in shuffled order.
 *  Spent cards (Hive used to block, Sky Creature used to steal) are
 *  permanently removed from play. Mutates `state` in place. Returns the
 *  number of cards reshuffled (0 means no reshuffle happened). */
export function reshuffleUsedIntoDraw(
  state: MatchState,
  rand: () => number = Math.random,
): number {
  const live: DeckCard[] = [];
  const dead: DeckCard[] = [];
  for (const c of state.used) (c.spent ? dead : live).push(c);
  if (live.length === 0) return 0;
  state.draw = shuffle(live, rand);
  // Permanently-removed (spent) cards stay nowhere — they exit play.
  // The used pile is now empty until the next discard/disaster lands.
  state.used = [];
  return live.length;
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
    // A.2 — N-player lifecycle fields. Default everyone to 'active' with
    // no rank assigned yet. For 2-player matches these behave invisibly
    // (single completer ends the game exactly as before).
    rank: null,
    status: "active",
    finalisedAt: null,
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
    // A.2 — N-player rotation/placements. Default rotation is sequential
    // [0..N-1]; A.3/B may pass a randomised permutation. `placements` fills
    // as players are finalised.
    placements: [],
    turnOrder: opts.players.map((_, i) => i),
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
  const me = state.players[state.turn];
  if (!me.firstPickupDone) {
    throw new Error("First take your 5 opening cards.");
  }
  if (me.hand.length >= HAND_LIMIT) {
    throw new Error(`Hand limit reached (${HAND_LIMIT}). Play or discard cards before drawing more.`);
  }
  const next = cloneState(state);
  // Lazy auto-reshuffle: if the draw pile is empty but the used pile has
  // any live (non-spent) cards, fold them into a fresh shuffled draw pile.
  // Spent cards (Hive used to block, Sky Creature used to steal) are
  // permanently removed from play — this is the mechanism that lets the
  // game converge to a clean terminal state. Surfaced via lastEvent so
  // every client sees the same explanatory string after the commit.
  let reshuffleNote = "";
  if (next.draw.length === 0) {
    const reshuffled = reshuffleUsedIntoDraw(next);
    if (reshuffled === 0) {
      throw new Error("No cards left to draw");
    }
    reshuffleNote = ` (used pile reshuffled — ${reshuffled} card${reshuffled === 1 ? "" : "s"} back in play)`;
  }
  const card = next.draw.shift()!;
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  // Advance to place when the player CAN'T draw anymore: hit the 2-draw cap
  // OR the hand is full. Prevents the wedge where hand==5 but drawnThisTurn<2.
  if (next.drawnThisTurn >= 2 || next.players[next.turn].hand.length >= HAND_LIMIT) next.phase = "place";

  next.lastEvent = `${next.players[next.turn].name} drew a card${reshuffleNote}`;
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
  // Lockstep with `isUsedTopPickable` / `playerHasAnyLegalMove`: a spent
  // Sky Creature is still pickable (placed as a plain animal — `spent`
  // stays true so it never steals again and is filtered on any future
  // reshuffle). A spent Hive is NEVER pickable.
  if (!isUsedTopPickable(top)) {
    const label = top.kind === "golden_hive" ? "Golden Hive" : top.name;
    throw new Error(`That ${label} has been spent — it can't be picked up.`);
  }
  const next = cloneState(state);
  const popped = next.used.pop()!;
  // Tag with pickedUpThisTurn so it can't be re-weaponised as a Disaster
  // the same turn — the exploit being: pick up Creator → instantly play it
  // back as a disaster → opponent picks it up → repeats forever.
  // Preserve `spent` exactly as-is (a spent Sky Creature stays spent — it
  // becomes a plain animal on placement and is excluded from any future
  // reshuffle if it ever returns to the used pile).
  const card = { ...popped, pickedUpThisTurn: true };
  next.players[next.turn].hand.push(card);
  next.drawnThisTurn += 1;
  if (next.drawnThisTurn >= 2 || next.players[next.turn].hand.length >= HAND_LIMIT) next.phase = "place";

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
    // Golden Body is a wildcard animal — it stands in for a Sky Creature
    // when counting toward the cluster threshold.
    if (pc?.card.kind === "sky_creature" || pc?.card.kind === "golden_body") n += 1;
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

/** Adjacency-match rule (loose — per client):
 *   - At least ONE neighbour (Creator or animal) must share a Creator Type
 *     with the placed card. Only one side needs to match.
 *   - No neighbour ever "vetoes" a placement based on element — non-matching
 *     neighbours are simply ignored. Creators are foundational anchors.
 *   - Wildcards (Sky Creator, Golden Body, Golden Hive) match anything,
 *     both as placed card and as neighbour.
 *   - Two Creators touching is always legal and satisfies the anchor.
 *   - The very first card on an empty board has no neighbours → legal.
 *   - Golden Hive cannot be placed at all (handled in placeOnEcosystem).
 */
function cardWildcardForAdjacency(card: DeckCard): boolean {
  return (
    card.kind === "sky_creator" ||
    card.kind === "golden_body" ||
    card.kind === "golden_hive"
  );
}

/** Wildcard-ness when the card is the one BEING PLACED.
 *  A Sky Creator is a wildcard *element* (for ecosystem completion) and a
 *  wildcard *anchor* for its neighbours, but it may not be dropped anywhere
 *  on the board: like every other Creator it must touch another Creator or a
 *  neighbour carrying the Sky type. */
function placementWildcard(card: DeckCard): boolean {
  return card.kind === "golden_body" || card.kind === "golden_hive";
}

function cardAdjacencyTypes(card: DeckCard): string[] {
  if (card.kind === "sky_creator") return ["Sky"];
  if (card.kind === "creator") {
    if (card.displayType) return [card.displayType as string];
    if (card.element) {
      return Object.entries(TYPE_TO_ELEMENT)
        .filter(([, e]) => e === card.element)
        .map(([t]) => t);
    }
    return [];
  }
  if (card.kind === "animal" || card.kind === "sky_creature") {
    return ((card.types ?? []) as string[]).filter(Boolean);
  }
  return [];
}

/** "Lion (Mountain/Sun)" — used to make illegal-placement toasts diagnosable
 *  instead of leaving the player guessing which neighbour was checked. */
function describeNeighbour(card: DeckCard): string {
  const types = cardAdjacencyTypes(card);
  return types.length ? `${card.name} (${types.join("/")})` : card.name;
}

function typeSetsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b.map((t) => t.toLowerCase()));
  return a.some((t) => setB.has(t.toLowerCase()));
}

function adjacencyError(
  eco: Ecosystem,
  card: DeckCard,
  pos: Axial,
): string | null {
  const myIsWildcard = placementWildcard(card);
  const myTypes = myIsWildcard ? [] : cardAdjacencyTypes(card);

  let neighbourCount = 0;
  let anchorMatches = 0;
  const neighbourDescs: string[] = [];

  for (let dir = 0; dir < 6; dir++) {
    const d = NEIGHBOUR_DIRS[dir];
    const nKey = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
    const pc = eco.placed.get(nKey);
    if (!pc) continue;
    neighbourCount += 1;
    neighbourDescs.push(describeNeighbour(pc.card));

    if (myIsWildcard || cardWildcardForAdjacency(pc.card)) {
      anchorMatches += 1;
      continue;
    }

    const placingCreator = card.kind === "creator" || card.kind === "sky_creator";
    const neighbourIsCreator = pc.card.kind === "creator" || pc.card.kind === "sky_creator";
    // Two Creators touching is always legal and satisfies the anchor.
    if (placingCreator && neighbourIsCreator) {
      anchorMatches += 1;
      continue;
    }

    if (typeSetsOverlap(myTypes, cardAdjacencyTypes(pc.card))) {
      anchorMatches += 1;
    }
  }

  if (neighbourCount === 0) return null;
  if (anchorMatches === 0) {
    const typeList = myTypes.length ? myTypes.join(" or ") : "any Creator Type";
    return `Can't place ${card.name} here — none of the touching neighbours share ${typeList}. Touching: ${neighbourDescs.join(", ")}.`;
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

/* ----------- Per-cell placement explanation (UI tooltip) ----------- */

export interface PlacementReason {
  legal: boolean;
  /** Short single-sentence explanation, safe to drop into a tooltip. */
  text: string;
}

/** Explain whether `card` may be placed at `pos`, with copy that mirrors the
 *  canonical phrasing: "share a Creator Type". Used for the per-cell tooltip
 *  on the board. Cells that aren't adjacent to the ecosystem at all are not
 *  rendered, so we don't try to explain that case here. */
export function placementReason(
  eco: Ecosystem,
  card: DeckCard,
  pos: Axial,
): PlacementReason {
  if (eco.placed.has(keyOf(pos))) {
    return { legal: false, text: "This hex already has a card." };
  }

  const myIsWildcard = placementWildcard(card);
  const myTypes = myIsWildcard ? [] : cardAdjacencyTypes(card);

  let neighbourCount = 0;
  let firstMatch: { reason: string } | null = null;

  for (let dir = 0; dir < 6; dir++) {
    const d = NEIGHBOUR_DIRS[dir];
    const nKey = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
    const pc = eco.placed.get(nKey);
    if (!pc) continue;
    neighbourCount += 1;
    if (firstMatch) continue;

    const neighbourName = pc.card.name;
    const neighbourIsWildcard = cardWildcardForAdjacency(pc.card);

    if (myIsWildcard) {
      firstMatch = { reason: `${card.name} is a wildcard — anchors to ${neighbourName}.` };
      continue;
    }
    if (neighbourIsWildcard) {
      firstMatch = { reason: `${neighbourName} is a wildcard — matches any card.` };
      continue;
    }

    const placingCreator = card.kind === "creator" || card.kind === "sky_creator";
    const neighbourIsCreator = pc.card.kind === "creator" || pc.card.kind === "sky_creator";
    if (placingCreator && neighbourIsCreator) {
      firstMatch = { reason: `Creators anchor to other Creators — matches ${neighbourName}.` };
      continue;
    }

    const otherTypes = cardAdjacencyTypes(pc.card);
    const shared = myTypes.find((t) =>
      otherTypes.some((o) => o.toLowerCase() === t.toLowerCase()),
    );
    if (shared) {
      firstMatch = { reason: `Shares ${shared} with ${neighbourName}.` };
    }
  }

  if (neighbourCount === 0) {
    return { legal: true, text: `${card.name} — first card on the board.` };
  }
  if (firstMatch) {
    return { legal: true, text: firstMatch.reason };
  }
  const typeList = myTypes.length ? myTypes.join(" or ") : "any Creator Type";
  return {
    legal: false,
    text: `Can't place ${card.name} here — none of the neighbours share ${typeList}.`,
  };
}

/* ----------- Disaster eligibility (also used by stuck-card check) ----------- */

/** True iff this ecosystem covers all four elements (Earth/Fire/Air/Water),
 *  satisfying the prerequisite to unleash a Disaster. Mirrors the gate
 *  enforced inside `playDisaster`. */
export function playerCanUnleashDisaster(eco: Ecosystem): boolean {
  const myElements = new Set<Element>();
  let hasWildcardSky = false;
  for (const pc of eco.placed.values()) {
    if (pc.card.kind === "creator" && pc.card.element) {
      myElements.add(pc.card.element);
    } else if (pc.card.kind === "sky_creator") {
      if (isSkyCluster(eco, pc.pos)) {
        hasWildcardSky = true;
        continue;
      }
      for (const n of neighbours(pc.pos)) {
        const nb = eco.placed.get(keyOf(n));
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
  return ELEMENTS.every((e) => myElements.has(e));
}

/** True iff `card`, currently held by `playerId`, has at least one legal
 *  action available this turn beyond the always-available discard:
 *   - a legal board placement, OR
 *   - a Disaster (Creator/Sky Creator + all 4 elements placed + not spent), OR
 *   - a Sky-Creature steal (an opponent has a stealable animal + the player
 *     has at least one empty adjacent cell on their board to land it).
 *  Golden Hive is always considered "ready" (never board-placed, never stuck).
 *  Pure function of `state` — never cache the result. */
export function hasAnyLegalAction(
  state: MatchState,
  playerId: string,
  card: DeckCard,
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (card.kind === "golden_hive") return true;

  const cells = legalEcoCells(player.ecosystem);
  if (cells.some((c) => placementMatchesNeighbours(player.ecosystem, card, c))) {
    return true;
  }
  if (
    (card.kind === "creator" || card.kind === "sky_creator") &&
    !card.pickedUpThisTurn &&
    !card.disasterSpent &&
    playerCanUnleashDisaster(player.ecosystem)
  ) {
    return true;
  }
  if (card.kind === "sky_creature" && cells.length > 0) {
    const stealable = state.players.some(
      (p) =>
        p.id !== playerId &&
        Array.from(p.ecosystem.placed.values()).some(
          (pc) =>
            pc.card.kind === "animal" ||
            pc.card.kind === "sky_creature" ||
            pc.card.kind === "golden_body",
        ),
    );
    if (stealable) return true;
  }
  return false;
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
    if (player.ecosystem.placed.has(keyOf(pos))) {
      throw new Error("That hex already has a card — pick an empty one.");
    }
    throw new Error("Cards must be placed touching your existing ecosystem.");
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
  const target = player.hand[idx];
  if (target.kind === "golden_hive") {
    throw new Error("Golden Hive can't be discarded — it can only leave your hand by blocking an incoming Disaster.");
  }
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

  // Find the (at most one) active opponent holding an unspent Golden Hive.
  // Single-Hive invariant: the deck contains exactly ONE Golden Hive across
  // the whole match regardless of player count, so this filter always
  // produces 0 or 1 results — never more. The result is wrapped in an array
  // purely for queue-shape consistency with `resolveDisaster`; it is NOT
  // evidence that multi-Hive play is supported (it isn't).
  // Disconnect protection: a disconnected opponent cannot respond to the
  // Hive prompt, so they're excluded from the victim queue here (and from
  // the wipe itself in applyDisasterWipe). The disaster proceeds against
  // any remaining connected victims without hanging.
  const hiveVictims = next.players.filter(
    (p) =>
      p.id !== player.id &&
      (p.status ?? "active") === "active" &&
      !(typeof p.disconnectedAt === "number" && p.disconnectedAt > 0) &&
      p.hand.some((c) => c.kind === "golden_hive" && !c.spent),
  );

  if (hiveVictims.length > 0) {
    const victimIds = hiveVictims.map((p) => p.id);
    next.pendingDisaster = {
      attackerId: player.id,
      victimIds,
      victimId: victimIds[0],
      blockedBy: [],
      creator,
    };
    const waitingNames = hiveVictims.map((p) => p.name).join(", ");
    next.lastEvent = `${player.name} played a ${creator.name} Disaster — waiting on ${waitingNames}'s Golden Hive…`;
    // Disaster has been played but does not consume the placement slot until
    // resolved — that way the attacker can't sneak in another action while
    // the victim decides.
    return next;
  }

  applyDisasterWipe(next, player.id, creator);
  next.placedThisTurn += 1;
  return afterAction(next);
}

/** Victim's response to a pending disaster prompt. Processes the (only)
 *  Hive-holder at the head of `pendingDisaster.victimIds` — by the
 *  single-Hive invariant the queue length is always ≤ 1, so this resolves
 *  in a single call. The remaining-queue branch below is dead code in real
 *  play but is retained as a structural safety net. After the decision the
 *  wipe is applied against every active opponent except attackers who
 *  blocked with their Hive. */

export function resolveDisaster(state: MatchState, useHive: boolean): MatchState {
  if (state.finished) return state;
  if (!state.pendingDisaster) throw new Error("No disaster pending");
  const next = cloneState(state);
  const pd = next.pendingDisaster!;
  const attacker = next.players.find((p) => p.id === pd.attackerId)!;
  const queue = pd.victimIds && pd.victimIds.length > 0 ? pd.victimIds.slice() : [pd.victimId];
  const currentVictimId = queue[0];
  const victim = next.players.find((p) => p.id === currentVictimId)!;
  const blockedBy = (pd.blockedBy ?? []).slice();

  if (useHive) {
    // Move the victim's Hive from hand to the used pile, flagged spent so
    // nobody can ever pick it up again.
    const hIdx = victim.hand.findIndex((c) => c.kind === "golden_hive" && !c.spent);
    if (hIdx < 0) throw new Error("Hive no longer in hand");
    const [hive] = victim.hand.splice(hIdx, 1);
    next.used.push({ ...hive, spent: true });
    victim.hiveShield = false;
    blockedBy.push(victim.id);
    next.lastEvent = `${victim.name} activated their Golden Hive — the ${pd.creator.name} Disaster was blocked!`;
  } else {
    next.lastEvent = `${victim.name} saved their Golden Hive for later — the Disaster hits.`;
  }

  const remaining = queue.slice(1);
  if (remaining.length > 0) {
    // More Hive-holders still to decide. Keep the pause in place.
    next.pendingDisaster = {
      ...pd,
      victimIds: remaining,
      victimId: remaining[0],
      blockedBy,
    };
    return next;
  }

  // All Hive decisions are in → execute the wipe against every active
  // non-attacker except those who blocked.
  applyDisasterWipe(next, attacker.id, pd.creator, blockedBy);
  next.pendingDisaster = null;
  next.placedThisTurn += 1;
  return afterAction(next);
}

/** Internal: apply the wipe for every active non-attacker except victims
 *  in `skipVictimIds` (those who blocked with a Hive). Also skips already-
 *  finalised / conceded / forfeited players. */
function applyDisasterWipe(
  next: MatchState,
  attackerId: string,
  creator: DeckCard,
  skipVictimIds: string[] = [],
): void {
  const player = next.players.find((p) => p.id === attackerId)!;
  const skipSet = new Set(skipVictimIds);
  let wiped = 0;
  let placedOnBoard = 0;
  for (const victim of next.players) {
    if (victim.id === attackerId) continue;
    if (skipSet.has(victim.id)) continue;
    if ((victim.status ?? "active") !== "active") continue;
    // Disconnect protection: skip disconnected players entirely (their
    // boards are untouched until they reconnect or the match resolves).
    if (typeof victim.disconnectedAt === "number" && victim.disconnectedAt > 0) continue;
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
  // Disconnect steal-protection: a disconnected opponent's cards cannot be
  // targeted until they reconnect (or the match resolves). Mirrors the
  // disaster wipe carve-out in applyDisasterWipe.
  if (typeof victim.disconnectedAt === "number" && victim.disconnectedAt > 0) {
    throw new Error(`${victim.name} is disconnected — their cards are protected until they reconnect.`);
  }
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

/** True iff `slot` has at least one legal move available right now —
 *  i.e. they can pick up (direct draw / reshuffle-into-draw / spent-Sky-
 *  pickable used-top), place / disaster / steal with any held card, or
 *  discard a non-Hive card (which recycles into the used pile and is
 *  therefore productive). Used by the stalemate backstop; pickup checks
 *  consume the SAME `playerCanPickUp` / `isUsedTopPickable` helpers that
 *  `pickFromDraw` and `pickFromUsed` enforce, so the backstop and the
 *  actual move rules can never drift. */
function playerHasAnyLegalMove(state: MatchState, slot: number): boolean {
  const p = state.players[slot];
  if (!p) return false;
  if ((p.status ?? "active") !== "active") return false;

  // Pickup options — sourced from the same predicate `pickFromDraw` /
  // `pickFromUsed` enforce. Covers: direct draw, reshuffle-of-live-used,
  // and spent-Sky-Creature-pickable top. A spent Hive on top correctly
  // fails this check (matches `isUsedTopPickable`'s asymmetry).
  if (playerCanPickUp(state, slot)) return true;


  // Card-driven actions: placement, disaster, steal. We deliberately skip
  // Golden Hive here — `hasAnyLegalAction` returns true for Hive cards
  // because the Hive is always "ready" to block an incoming disaster, but
  // a Hive in hand does NOT give its holder a legal *turn* action (it
  // can't be placed, can't be played, and can't be discarded). Counting
  // it as a legal move would mask a real stalemate where the player's
  // hand contains only a Hive.
  for (const card of p.hand) {
    if (card.kind === "golden_hive") continue;
    if (hasAnyLegalAction(state, p.id, card)) return true;
  }

  // Discarding a non-Hive card is only "productive" if the piles are still
  // alive — i.e. the discarded card can be recycled into a future draw or
  // picked up from the used pile top. When BOTH the draw pile is empty AND
  // the used pile has no live (non-spent) cards left, a discard just cycles
  // dead cards around forever without any player being able to progress.
  // Treating such a discard as productive was the wedge behind the
  // "deck + discard exhausted → nobody wins → game stuck" softlock.
  const pilesAlive = state.draw.length > 0 || state.used.some((c) => !c.spent);
  if (pilesAlive && p.hand.some((c) => c.kind !== "golden_hive")) return true;



  return false;
}

/** True iff EVERY still-active player has zero legal moves available.
 *  Backstop trigger for stalemate finalisation. */
function matchIsStalemated(state: MatchState): boolean {
  if (state.finished) return false;
  let sawActive = false;
  for (let i = 0; i < state.players.length; i++) {
    if ((state.players[i].status ?? "active") !== "active") continue;
    sawActive = true;
    if (playerHasAnyLegalMove(state, i)) return false;
  }
  return sawActive;
}

/** If every active player is stuck, end the match through the standard
 *  finalisation path (the same one used by finaliseByScore / pile exhaustion).
 *  Ranked by score in every mode — only a genuine tie on score is a draw.
 *  Returns true if it fired. */
function checkStalemateBackstop(state: MatchState): boolean {
  if (state.finished) return false;
  if (!matchIsStalemated(state)) return false;
  // A pile-exhaustion / stalemate end is NOT automatically a draw: it is still
  // ranked by score, and only an actual tie on score is a draw. The old
  // special case here forced winnerId=null whenever nobody had completed an
  // ecosystem, which showed "It's a draw" for matches one player had clearly
  // won on points.
  finalise(state);
  state.lastEvent =
    "No legal moves remain — remaining players ranked by score.";
  return true;
}

function afterAction(state: MatchState): MatchState {
  checkWin(state);
  if (state.finished) return state;
  if (state.placedThisTurn >= 2) advanceTurn(state);
  if (state.finished) return state;
  // Mid-turn state mutations (disaster wipes, steals, etc.) can leave the
  // match stalemated without advanceTurn firing. Catch it here too.
  checkStalemateBackstop(state);
  return state;
}

/** A.4 — true iff the seat is currently disconnected (server stamps
 *  `disconnectedAt` from the realtime presence layer). NOT the same as
 *  "stuck": a disconnected player may still have legal moves on the board;
 *  we just can't ask them. Same forward-scan SKIP mechanism, distinct
 *  semantic. Past-grace handling is separate (see `isDisconnectedPastGrace`).
 */
function isDisconnected(state: MatchState, slot: number): boolean {
  const at = state.players[slot]?.disconnectedAt;
  return typeof at === "number" && at > 0;
}

/** A.4 — true iff the seat has been disconnected long enough that the sweep
 *  is allowed to forfeit them and end the match if only one connected
 *  active player remains. Uses `state.disconnectGraceMs` (default 5 min).
 *  `now` is injectable for deterministic tests; defaults to wall clock. */
function isDisconnectedPastGrace(
  state: MatchState,
  slot: number,
  now: number = Date.now(),
): boolean {
  const at = state.players[slot]?.disconnectedAt;
  if (typeof at !== "number" || at <= 0) return false;
  const grace = state.disconnectGraceMs ?? 5 * 60 * 1000;
  return now - at > grace;
}

/** Server-side: trigger the engine's normal turn-advance on behalf of a
 *  disconnected, past-grace seat whose turn would otherwise hang forever.
 *  Idempotent: if `state.turn` is not currently held by a past-grace
 *  disconnected seat, returns the state unchanged. When it does fire, the
 *  result is identical to a connected player completing their turn — the
 *  same `advanceTurn` path runs, so ≤1-active finalisation, placements,
 *  winnerId, and `lastEvent` are all populated through normal engine logic.
 *  Called by `forfeit-stale-disconnects` to unstick idle past-grace turns. */
export function forceAdvanceTurn(state: MatchState, now: number = Date.now()): MatchState {
  if (!isDisconnectedPastGrace(state, state.turn, now)) return state;
  const next: MatchState = {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
  };
  advanceTurn(next, now);
  return next;
}

/** 2-player instant-end on disconnect: the sweep calls this once
 *  `disconnected_at` is stamped (post-debounce) on a 2-player match,
 *  regardless of whose turn it is. We force `disconnectGraceMs = 0` so
 *  the disconnected seat is treated as past-grace by `advanceTurn`'s
 *  ≤1-active check, which routes through the same finalise path the
 *  past-grace sweep uses for 3+ player matches — placements, winnerId,
 *  and lastEvent are populated through normal engine logic. No new
 *  finalise path is introduced for the 2-player case. */
export function forceFinaliseDisconnect2p(
  state: MatchState,
  now: number = Date.now(),
): MatchState {
  const next: MatchState = {
    ...state,
    disconnectGraceMs: 0,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
  };

  // 2-player anti-exploit rule: in a 2P match, the player who STAYS at the
  // table beats the player who LEFT, regardless of in-progress score.
  // Ranking past-grace disconnects by score would let a player drop while
  // ahead to lock in a win — explicitly disallowed. Survivor = rank 1,
  // departed = rank 2. Departed is finalised through the normal middle-band
  // path (status='finalised'), NOT 'forfeit' — losing a match by disconnect
  // and being flagged as a malicious quitter are different things. They take
  // the standard loss ELO for rank 2; no additional quitter penalty stacks.
  //
  // Fallback: if BOTH seats are past-grace (or neither cleanly is), defer to
  // advanceTurn's existing finalise-by-score path. 3+ player matches are
  // unaffected — they never call this function.
  if (next.players.length === 2) {
    const disconnectedSlots = next.players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => typeof p.disconnectedAt === "number" && (p.disconnectedAt ?? 0) > 0);
    if (disconnectedSlots.length === 1) {
      const departedSlot = disconnectedSlots[0].i;
      const survivor = next.players[1 - departedSlot];
      const departed = next.players[departedSlot];
      finalise(next, survivor.id);
      next.endedByDisconnect = true;
      next.lastEvent = `${departed.name} left the match — ${survivor.name} wins.`;
      return next;
    }
  }

  advanceTurn(next, now);
  return next;
}

function advanceTurn(state: MatchState, now: number = Date.now()): void {
  // Clear pickedUpThisTurn flags so cards picked up last turn become
  // Disaster-eligible again from this point onward.
  for (const p of state.players) {
    p.hand = p.hand.map((c) => (c.pickedUpThisTurn ? { ...c, pickedUpThisTurn: false } : c));
  }

  // A.2 — N-player rotation. Walk `turnOrder` from the current player and
  // pick the next slot whose player is still 'active' AND not past the
  // disconnect grace window. If ≤1 such player remains, finalise the match
  // (they take the next available rank; past-grace disconnects are ranked
  // by score in finalise() — NOT routed through the quitter bottom-band
  // path, which is reserved for explicit Leave Match / concede).
  const order =
    state.turnOrder && state.turnOrder.length === state.players.length
      ? state.turnOrder
      : state.players.map((_, i) => i);
  const isActive = (slot: number) => (state.players[slot]?.status ?? "active") === "active";
  const canStillContinue = (slot: number) =>
    isActive(slot) && !isDisconnectedPastGrace(state, slot, now);

  const continuingSlots = order.filter(canStillContinue);
  if (continuingSlots.length <= 1) {
    finalise(state);
    return;
  }


  const currentOrderIdx = order.indexOf(state.turn);
  const startFrom = currentOrderIdx < 0 ? 0 : currentOrderIdx;

  // Auto-pass scan: walk forward through `turnOrder` and stop on the first
  // ACTIVE, CONNECTED player who has at least one legal move available.
  // Skipped seats fall into one of two categories:
  //   (a) stuck: no legal move available right now (e.g. hive-only hand).
  //   (b) disconnected: presence layer says they're not here to play.
  // Both are auto-passed (NOT conceded) — same skip mechanism, distinct
  // semantic. A stuck seat may become unstuck when an opponent's move
  // changes the board; a disconnected seat may rejoin within grace. If the
  // scan completes a full lap without finding a player who can act, every
  // continuing player is stuck → stalemate backstop finalises by score.
  // Bounded by `order.length`, so it cannot loop.
  let nextSlot = state.turn;
  const passedNames: string[] = [];
  let landed = false;
  let firstActiveFallback = -1;
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(startFrom + step) % order.length];
    if (!isActive(candidate)) continue;
    if (firstActiveFallback < 0) firstActiveFallback = candidate;
    // Disconnect-within-grace: skip the seat (auto-pass) but keep them in
    // the match. Past-grace seats were already excluded from `continuingSlots`
    // above and contribute to the ≤1 match-end check there.
    if (isDisconnected(state, candidate)) {
      const skipped = state.players[candidate];
      if (skipped?.name) passedNames.push(`${skipped.name} (disconnected)`);
      continue;
    }
    if (playerHasAnyLegalMove(state, candidate)) {
      nextSlot = candidate;
      landed = true;
      break;
    }
    const skipped = state.players[candidate];
    if (skipped?.name) passedNames.push(skipped.name);
  }
  // No connected active player has a legal move — every skip we just
  // recorded is a would-be auto-pass that the stalemate backstop will roll
  // up into a finalise-by-score below. Park `state.turn` on the first active
  // slot so downstream consumers don't see a finalised player as "current".
  if (!landed && firstActiveFallback >= 0) nextSlot = firstActiveFallback;
  state.turn = nextSlot;
  const nextPlayer = state.players[nextSlot];
  const startsFull = !!nextPlayer?.firstPickupDone && (nextPlayer.hand?.length ?? 0) >= HAND_LIMIT;
  state.phase = startsFull ? "place" : "draw";
  state.drawnThisTurn = startsFull ? 2 : 0;
  state.placedThisTurn = 0;
  state.turnNumber += 1;

  if (landed && passedNames.length > 0) {
    const label =
      passedNames.length === 1
        ? `${passedNames[0]} — turn passed.`
        : `Turn passed for ${passedNames.join(", ")}.`;
    state.lastEvent = label;
  }

  // Stalemate backstop: fire whenever no active player has any legal move,
  // not only the strict "both piles + all hands empty" case. Catches the
  // softlock where the draw pile is empty and the used-pile top is a spent
  // Sky Creature (or any other unpickable card) that locks every active
  // player out of their pickup phase. Routes through the standard
  // finalise() path so ranked outcomes use the same N-player ELO settlement.
  checkStalemateBackstop(state);
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
  // Winner-takes-all — collapses to today's 2-player behaviour. (N>2 first-
  // to-N is not generalised further in A.2 by design; pending product call.)
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

  // Classic ecosystem-complete win. INSTANT-END for ALL player counts (client
  // confirmed, Jun 2026): the first player to complete a valid ecosystem ends
  // the match immediately. They take rank 1; every other player is ranked by
  // total score descending (ties share rank) via the same `finalise` path
  // used by N=2 today. No partial-finalise — there's no incentive for
  // runners-up to keep playing under the points economy (winner 6, others 1).
  for (const p of state.players) {
    if ((p.status ?? "active") !== "active") continue;
    if (!validateEcosystemWin(p).valid) continue;
    finalise(state, p.id);
    return;
  }
}

/** A.3 — finalise a single player (mid-match completion / concede / forfeit)
 *  without ending the match.
 *
 *  Ranking direction (per A.3 product decision):
 *    - 'completed' → rank from the TOP (1, 2, 3, …) in completion order.
 *    - 'conceded' / 'forfeit' → rank from the BOTTOM (N, N-1, N-2, …) in
 *      quit order. A quitter must never out-rank a player who stayed to
 *      the finish — otherwise we'd incentivise quitting-while-ahead.
 *
 *  Example (N=4): p2 concedes → rank 4; p1 completes → rank 1; p3 concedes
 *  → rank 3; the last active p4 is finalised by score into the middle band
 *  → rank 2. */
function partiallyFinalisePlayer(
  state: MatchState,
  playerId: string,
  reason: "completed" | "conceded" | "forfeit" = "completed",
): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  if ((player.status ?? "active") !== "active") return;
  const placements = state.placements ?? [];

  let topCount = 0;
  let bottomCount = 0;
  for (const pl of placements) {
    const pp = state.players.find((x) => x.id === pl.playerId);
    const st = pp?.status ?? "active";
    if (st === "conceded" || st === "forfeit") bottomCount += 1;
    else topCount += 1;
  }

  const N = state.players.length;
  const rank = reason === "completed" ? topCount + 1 : N - bottomCount;

  player.status =
    reason === "conceded" ? "conceded" : reason === "forfeit" ? "forfeit" : "finalised";
  player.rank = rank;
  player.finalisedAt = Date.now();
  state.placements = [...placements, { playerId, rank }];
  state.lastEvent =
    reason === "completed"
      ? `${player.name} completed their ecosystem — finished #${rank}.`
      : reason === "conceded"
      ? `${player.name} conceded — finished #${rank}.`
      : `${player.name} forfeited — finished #${rank}.`;
}

/** A.3 — public concede handler. Applies the concede ranking and, if only
 *  one active player remains, closes the match out. Returns a NEW state.
 *
 *  For N=2 this collapses to the legacy behaviour exactly: conceder takes
 *  rank 2, the other player is finalised at rank 1, match ends. */
export function concedePlayer(state: MatchState, playerId: string): MatchState {
  if (state.finished) return state;
  const next = cloneState(state);
  partiallyFinalisePlayer(next, playerId, "conceded");
  if (next.pendingDisaster && next.pendingDisaster.victimIds.includes(playerId)) {
    const remaining = next.pendingDisaster.victimIds.filter((id) => id !== playerId);
    if (remaining.length === 0) {
      const attackerId = next.pendingDisaster.attackerId;
      const creator = next.pendingDisaster.creator;
      const blockedBy = next.pendingDisaster.blockedBy ?? [];
      next.pendingDisaster = null;
      applyDisasterWipe(next, attackerId, creator, blockedBy);
    } else {
      next.pendingDisaster = {
        ...next.pendingDisaster,
        victimIds: remaining,
        victimId: remaining[0],
      };
    }
  }
  const activeCount = next.players.filter(
    (p) => (p.status ?? "active") === "active",
  ).length;
  if (activeCount <= 1) {
    finalise(next);
  } else {
    const conceiderSlot = next.players.findIndex((p) => p.id === playerId);
    if (next.turn === conceiderSlot) {
      next.placedThisTurn = 2;
      advanceTurn(next);
    }
  }
  return next;
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

/** Force-finalise (e.g. Beat-the-Clock timer expiry). All players are
 *  ranked by total score (desc). Ties share the higher rank — since every
 *  non-winner currently earns the same points regardless of exact
 *  loser-rank position (winner-takes-all rule), exact ordering among ties
 *  does not affect progress. */
export function finaliseByScore(state: MatchState): MatchState {
  if (state.finished) return state;
  const next = cloneState(state);
  finalise(next);
  const winner = next.placements?.[0]
    ? next.players.find((p) => p.id === next.placements![0].playerId)
    : null;
  next.lastEvent = winner
    ? `Time's up — ${winner.name} wins on points!`
    : "Time's up — match ranked by score.";
  return next;
}

/** A.3 — assign ranks to every player and populate `placements`.
 *
 *  Ranking model:
 *    - Top band (ranks 1..K): players already finalised as 'completed' /
 *      'finalised' (mid-match completers), in completion order — preserved.
 *    - Bottom band (ranks N..N-Q+1): players already 'conceded' / 'forfeit',
 *      preserved.
 *    - Middle band (ranks K+1..N-Q): remaining active players, sorted by
 *      `playerTotalScore` desc. Tied players share the higher rank (e.g.
 *      two tied for rank 2 both get 2; the next gets 4).
 *    - If `winnerId` is provided and that player is still active, they take
 *      rank K+1 (top of the middle band) — used by the 2-player fast path
 *      so concede / first-to-50 still produce identical 2-player ELO.
 *
 *  For 2-player matches this collapses to today's behaviour exactly: the
 *  called-out winner takes rank 1, the opponent rank 2. */
function finalise(state: MatchState, winnerId?: string): void {
  state.finished = true;
  const placements = (state.placements ?? []).slice();
  const ranked = new Set(placements.map((pl) => pl.playerId));

  let topCount = 0;
  let bottomCount = 0;
  for (const pl of placements) {
    const pp = state.players.find((x) => x.id === pl.playerId);
    const st = pp?.status ?? "active";
    if (st === "conceded" || st === "forfeit") bottomCount += 1;
    else topCount += 1;
  }
  const N = state.players.length;

  // Honour explicit winner if still active → they take next top-band rank.
  if (winnerId && !ranked.has(winnerId)) {
    const winnerPlayer = state.players.find((p) => p.id === winnerId);
    if (winnerPlayer && (winnerPlayer.status ?? "active") === "active") {
      const rank = topCount + 1;
      winnerPlayer.status = "finalised";
      winnerPlayer.rank = rank;
      winnerPlayer.finalisedAt = Date.now();
      placements.push({ playerId: winnerId, rank });
      ranked.add(winnerId);
      topCount += 1;
    }
  }

  // Rank remaining actives into the middle band [topCount+1 .. N-bottomCount].
  const remaining = state.players
    .filter((p) => !ranked.has(p.id))
    .sort((a, b) => playerTotalScore(b) - playerTotalScore(a));

  let cursor = topCount + 1;
  let i = 0;
  while (i < remaining.length) {
    const groupRank = cursor;
    const score = playerTotalScore(remaining[i]);
    let j = i;
    while (j < remaining.length && playerTotalScore(remaining[j]) === score) {
      const p = remaining[j];
      p.status = "finalised";
      p.rank = groupRank;
      p.finalisedAt = Date.now();
      placements.push({ playerId: p.id, rank: groupRank });
      ranked.add(p.id);
      j += 1;
    }
    cursor = groupRank + (j - i); // next group skips by group size
    i = j;
  }

  state.placements = placements;
  const topPlacements = placements.filter((pl) => pl.rank === 1);
  const top = topPlacements[0];
  // Two or more players sharing rank 1 is a genuine draw; a single rank-1
  // player is an outright winner even if the match ended on pile exhaustion.
  state.winnerId = topPlacements.length === 1 ? top.playerId : null;
  const topName = top
    ? state.players.find((p) => p.id === top.playerId)?.name ?? "—"
    : "—";
  state.lastEvent = state.winnerId
    ? `Match over — winner: ${topName}`
    : "Match over — no outright winner";
}
