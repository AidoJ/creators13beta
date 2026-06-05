/**
 * Simple greedy bot.
 *
 * Pick-up phase: prefers drawing from the deck (hidden) unless the top of
 * the used pile is a Creator / wildcard the bot doesn't already have.
 *
 * Place phase: prioritises (1) placing a Creator the ecosystem still needs,
 * (2) placing an animal next to a matching Creator, (3) any legal placement,
 * (4) discarding the least useful card.
 */

import {
  animalLinksToCreator,
  discardCard,
  drawInitialFive,
  legalEcoCells,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  ecosystemSummary,
  playDisaster,
  skyLockedSubType,
  placementMatchesNeighbours,
} from "./engine";
import { CREATORS_NEEDED, HAND_LIMIT, type DeckCard, type MatchState } from "./types";
import { TYPE_TO_ELEMENT, ELEMENTS } from "./elements";
import { isAdjacent } from "./board";


export type BotDifficulty = "easy" | "medium" | "hard";

export function botStep(state: MatchState, difficulty: BotDifficulty = "medium"): MatchState {
  if (state.finished) return state;

  const me = state.players[state.turn];

  if (state.phase === "draw") {
    if (!me.firstPickupDone) {
      return drawInitialFive(state);
    }
    // Respect hand limit — if already full, skip drawing and go play.
    if (me.hand.length >= HAND_LIMIT) {
      return { ...state, phase: "place" as const, lastEvent: `${me.name} hand is full — skipping pick-up` };
    }
    const top = state.used[state.used.length - 1];
    const wantUsed = top && !top.spent && (top.kind === "creator" || top.kind === "sky_creator" || top.kind === "golden_body" || top.kind === "golden_hive");
    if (wantUsed && state.used.length > 0) return pickFromUsed(state);
    if (state.draw.length > 0) return pickFromDraw(state);
    if (state.used.length > 0 && !top?.spent) return pickFromUsed(state);
    return state;
  }

  const player = state.players[state.turn];
  const { creators } = ecosystemSummary(player.ecosystem);
  const handFull = player.hand.length >= HAND_LIMIT - 2;

  // Difficulty modifier:
  //   easy   — 40% of the time the bot skips the optimal "place a needed creator"
  //            and the adjacency-matching step, falling through to a random legal placement.
  //   medium — full greedy (original behaviour).
  //   hard   — never skips, AND will play disasters as soon as eligible.
  const skipOptimal = difficulty === "easy" && Math.random() < 0.4;
  const aggressiveDisasters = difficulty === "hard";

  // Helper: first legal cell that also satisfies the adjacency-match rule.
  const firstValidCell = (card: DeckCard) => {
    const cells = legalEcoCells(player.ecosystem);
    return cells.find((c) => placementMatchesNeighbours(player.ecosystem, card, c));
  };

  // 1) Place a creator we still need.
  if (!skipOptimal && creators < CREATORS_NEEDED) {
    const creator = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (creator) {
      const cell = firstValidCell(creator);
      if (cell) {
        try { return placeOnEcosystem(state, creator.uid, cell); } catch {}
      }
    }
  }

  // 2) Place an animal that links to a placed creator (do this BEFORE disasters
  //    when hand is full, so we don't flood ourselves with more cards).
  //    Prefer a legal empty hex that TOUCHES the matching creator — the win
  //    rule requires adjacency.
  const placedCreators = [...player.ecosystem.placed.values()].filter(
    (pc) => pc.card.kind === "creator" || pc.card.kind === "sky_creator",
  );
  if (!skipOptimal) {
    for (const card of player.hand) {
      if (card.kind !== "animal" && card.kind !== "sky_creature" && card.kind !== "golden_body") continue;
      const link = placedCreators.find((pc) => animalLinksToCreator(card, pc.card, { optimistic: true }));
      if (!link) continue;
      const cells = legalEcoCells(player.ecosystem)
        .filter((c) => placementMatchesNeighbours(player.ecosystem, card, c));
      const adj = cells.filter((c) => isAdjacent(c, link.pos));
      const cell = adj[0] ?? cells[0];
      if (!cell) continue;
      try { return placeOnEcosystem(state, card.uid, cell); } catch {}
    }
  }

  // 3) Play a disaster ONLY when we (a) still have headroom, (b) have already
  //    completed our own creator set, AND (c) that creator set spans all 4
  //    elements (Earth/Fire/Air/Water). Mirrors the engine rule: a Sky Creator
  //    counts for its locked sub-type's element when locked, otherwise for any
  //    element it is currently adjacent to.
  const myElements = new Set<string>();
  for (const pc of placedCreators) {
    if (pc.card.kind === "sky_creator") {
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

  const hasAllElements = ELEMENTS.every((e) => myElements.has(e));
  const disasterEligible = creators >= CREATORS_NEEDED && hasAllElements;
  if ((aggressiveDisasters || !handFull) && disasterEligible) {
    const spare = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (spare) {
      try { return playDisaster(state, spare.uid); } catch {}
    }
  }

  // 4) Place anything legal (respecting adjacency-match rule).
  for (const card of player.hand) {
    if (card.kind === "golden_hive") continue;
    const cell = firstValidCell(card);
    if (!cell) continue;
    try { return placeOnEcosystem(state, card.uid, cell); } catch {}
  }


  // 5) Discard the first card.
  const dump = player.hand[0];
  if (dump) return discardCard(state, dump.uid);
  return state;
}
