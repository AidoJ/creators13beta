/**
 * Greedy bot with ecosystem-completion awareness.
 *
 * The old bot placed animals in the first legal cell they linked to and
 * poured surplus cards onto the board via a generic fallback. That produced
 * huge, sprawling ecosystems where individual creators never accumulated
 * their required 3 adjacent matching animals — so the bot could hold every
 * card it needed to win and still never trigger the win check.
 *
 * The new strategy tracks per-creator "slots":
 *   - Each placed creator needs 3 adjacent matching animals.
 *   - Each free neighbour hex around that creator is a candidate slot.
 *   - We ONLY place an animal in a slot if it matches that creator, and we
 *     prefer creators that are closest to completion.
 *   - Non-matching / surplus cards are discarded instead of dumped onto the
 *     board where they'd block a creator's remaining slots.
 *   - Creators are placed with a preference for cells that leave at least
 *     3 empty neighbour hexes for future animals.
 */

import {
  animalLinksToCreator,
  discardCard,
  drawInitialFive,
  endTurnEarly,
  legalEcoCells,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  ecosystemSummary,
  playDisaster,
  skipDraws,
  skyLockedSubType,
  isSkyCluster,
  placementMatchesNeighbours,
} from "./engine";
import { CREATORS_NEEDED, ANIMALS_PER_CREATOR, HAND_LIMIT, type DeckCard, type MatchState, type PlacedCard, type Ecosystem, type Axial } from "./types";
import { TYPE_TO_ELEMENT, ELEMENTS } from "./elements";
import { isAdjacent, neighbours, keyOf } from "./board";


export type BotDifficulty = "easy" | "medium" | "hard";

interface CreatorSlotInfo {
  pc: PlacedCard;
  matched: number;            // adjacent animals already matching this creator
  freeAdjacent: Axial[];      // empty hex cells adjacent to this creator
  needed: number;             // ANIMALS_PER_CREATOR - matched (>=0)
}

function summariseCreators(eco: Ecosystem): CreatorSlotInfo[] {
  const out: CreatorSlotInfo[] = [];
  for (const pc of eco.placed.values()) {
    if (pc.card.kind !== "creator" && pc.card.kind !== "sky_creator") continue;
    let matched = 0;
    const freeAdjacent: Axial[] = [];
    for (const n of neighbours(pc.pos)) {
      const nb = eco.placed.get(keyOf(n));
      if (!nb) {
        freeAdjacent.push(n);
        continue;
      }
      if (animalLinksToCreator(nb.card, pc.card, { optimistic: true })) matched += 1;
    }
    out.push({
      pc,
      matched,
      freeAdjacent,
      needed: Math.max(0, ANIMALS_PER_CREATOR - matched),
    });
  }
  return out;
}

/** Cells that are adjacent to any creator still needing matching animals —
 *  we treat these as "reserved" and won't fill them with non-matching cards. */
function reservedCells(creatorInfo: CreatorSlotInfo[]): Set<string> {
  const reserved = new Set<string>();
  for (const ci of creatorInfo) {
    if (ci.needed <= 0) continue;
    for (const c of ci.freeAdjacent) reserved.add(keyOf(c));
  }
  return reserved;
}

export function botStep(state: MatchState, difficulty: BotDifficulty = "medium"): MatchState {
  if (state.finished) return state;

  const me = state.players[state.turn];

  if (state.phase === "draw") {
    if (!me.firstPickupDone) {
      return drawInitialFive(state);
    }
    if (me.hand.length >= HAND_LIMIT) {
      try { return skipDraws(state); } catch { /* fall through */ }
    }
    const top = state.used[state.used.length - 1];
    const wantUsed = top && !top.spent && (top.kind === "creator" || top.kind === "sky_creator" || top.kind === "golden_body" || top.kind === "golden_hive");
    if (wantUsed && state.used.length > 0) return pickFromUsed(state);
    if (state.draw.length > 0) return pickFromDraw(state);
    if (state.used.length > 0 && !top?.spent) return pickFromUsed(state);
    try { return skipDraws(state); } catch { return state; }
  }

  const player = state.players[state.turn];
  const { creators } = ecosystemSummary(player.ecosystem);
  const handFull = player.hand.length >= HAND_LIMIT - 2;

  const skipOptimal = difficulty === "easy" && Math.random() < 0.4;
  const aggressiveDisasters = difficulty === "hard";

  const creatorInfo = summariseCreators(player.ecosystem);
  const reserved = reservedCells(creatorInfo);

  // ---------- 1) Place a needed creator in a well-spaced cell ----------
  if (!skipOptimal && creators < CREATORS_NEEDED) {
    const creatorCard = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (creatorCard) {
      const cells = legalEcoCells(player.ecosystem)
        .filter((c) => placementMatchesNeighbours(player.ecosystem, creatorCard, c));
      // Score cells by (a) number of currently empty neighbour hexes (want ≥3
      // so the creator has room for its 3 animals) and (b) NOT stealing a
      // reserved slot from an already-placed creator.
      const scored = cells.map((cell) => {
        const emptyN = neighbours(cell).filter((n) => !player.ecosystem.placed.has(keyOf(n))).length;
        const stealsReserved = reserved.has(keyOf(cell));
        return { cell, score: (stealsReserved ? -10 : 0) + emptyN };
      });
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      if (pick) {
        try { return placeOnEcosystem(state, creatorCard.uid, pick.cell); } catch {}
      }
    }
  }

  // ---------- 2) Place an animal into a creator that still needs it ----------
  // Enumerate (hand card, creator, cell) triples and pick the best.
  if (!skipOptimal) {
    interface Candidate { uid: string; cell: Axial; ciNeeded: number; ciFree: number; }
    const candidates: Candidate[] = [];
    const legal = legalEcoCells(player.ecosystem);
    const legalKeys = new Set(legal.map(keyOf));

    for (const card of player.hand) {
      if (card.kind !== "animal" && card.kind !== "sky_creature" && card.kind !== "golden_body") continue;
      for (const ci of creatorInfo) {
        if (ci.needed <= 0) continue;
        if (!animalLinksToCreator(card, ci.pc.card, { optimistic: true })) continue;
        for (const cell of ci.freeAdjacent) {
          if (!legalKeys.has(keyOf(cell))) continue;
          if (!placementMatchesNeighbours(player.ecosystem, card, cell)) continue;
          candidates.push({ uid: card.uid, cell, ciNeeded: ci.needed, ciFree: ci.freeAdjacent.length });
        }
      }
    }
    // Prefer creators closest to done (needed=1 first), then those with the
    // fewest remaining free adjacent cells (avoid losing a slot).
    candidates.sort((a, b) => (a.ciNeeded - b.ciNeeded) || (a.ciFree - b.ciFree));
    for (const cand of candidates) {
      try { return placeOnEcosystem(state, cand.uid, cand.cell); } catch {}
    }
  }

  // ---------- 3) Disasters (only when own set is complete) ----------
  const placedCreators = creatorInfo.map((ci) => ci.pc);
  const myElements = new Set<string>();
  let hasWildcardSky = false;
  for (const pc of placedCreators) {
    if (pc.card.kind === "sky_creator") {
      if (isSkyCluster(player.ecosystem, pc.pos)) {
        hasWildcardSky = true;
        continue;
      }
      const sub = skyLockedSubType(player.ecosystem, pc.pos);
      if (sub) {
        const el = TYPE_TO_ELEMENT[sub];
        if (el && el !== "Sky") myElements.add(el);
        continue;
      }
      for (const n of neighbours(pc.pos)) {
        const nb = player.ecosystem.placed.get(keyOf(n));
        if (!nb) continue;
        if (nb.card.kind === "creator" && nb.card.element) {
          myElements.add(nb.card.element);
        } else if (nb.card.kind === "animal" || nb.card.kind === "sky_creature") {
          for (const t of nb.card.types ?? []) {
            if (!t || t === "Sky") continue;
            const el = TYPE_TO_ELEMENT[t];
            if (el && el !== "Sky") myElements.add(el);
          }
        }
      }
    } else if (pc.card.element) {
      myElements.add(pc.card.element);
    }
  }
  if (hasWildcardSky && myElements.size >= ELEMENTS.length - 1) {
    for (const e of ELEMENTS) myElements.add(e);
  }
  const hasAllElements = ELEMENTS.every((e) => myElements.has(e));
  const disasterEligible = creators >= CREATORS_NEEDED && hasAllElements;
  if ((aggressiveDisasters || !handFull) && disasterEligible) {
    const spare = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (spare) {
      try { return playDisaster(state, spare.uid); } catch {}
    }
  }

  // ---------- 4) Discard rather than pollute the board ----------
  // The old fallback dumped any legal card anywhere, which frequently
  // consumed the last free neighbour slot of an unfinished creator and
  // permanently blocked the win. Instead, discard unhelpful cards so we
  // cycle through the deck toward matching ones.
  //
  // A card is "unhelpful" if it's an animal we can't legally place into any
  // creator slot AND it isn't a creator/sky_creator/golden_body/golden_hive.
  // Placement fallback is retained but tightly constrained: only place into
  // a cell that is NOT a reserved slot AND has no unfinished-creator neighbour.
  {
    const legal = legalEcoCells(player.ecosystem);
    for (const card of player.hand) {
      if (card.kind === "golden_hive") continue;
      // Only place surplus creators / golden bodies here — never a plain animal
      // that would take a reserved cell from another creator.
      if (card.kind !== "creator" && card.kind !== "sky_creator" && card.kind !== "golden_body") continue;
      const cell = legal.find((c) =>
        placementMatchesNeighbours(player.ecosystem, card, c) &&
        !reserved.has(keyOf(c))
      );
      if (cell) {
        try { return placeOnEcosystem(state, card.uid, cell); } catch {}
      }
    }
  }

  // ---------- 5) Discard the least useful card ----------
  // Prefer discarding plain animals (they cycle back and may match later)
  // over creators / wildcards. Golden Hive cannot be discarded.
  const discardOrder = [...player.hand]
    .filter((c) => c.kind !== "golden_hive")
    .sort((a, b) => {
      const rank = (c: DeckCard) => {
        if (c.kind === "animal") {
          // Prefer discarding animals we can't link to ANY placed creator.
          const linked = placedCreators.some((pc) => animalLinksToCreator(c, pc.card, { optimistic: true }));
          return linked ? 2 : 0;
        }
        if (c.kind === "sky_creature") return 3;
        if (c.kind === "golden_body") return 4;
        if (c.kind === "sky_creator") return 5;
        if (c.kind === "creator") return 5;
        return 1;
      };
      return rank(a) - rank(b);
    });
  const dump = discardOrder[0];
  if (dump) {
    try { return discardCard(state, dump.uid); } catch { /* fall through */ }
  }
  // 6) Nothing legal to do — end the turn so play advances.
  try { return endTurnEarly(state); } catch { return state; }
}
