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
  legalEcoCells,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  ecosystemSummary,
  playDisaster,
} from "./engine";
import { CREATORS_NEEDED, HAND_LIMIT, type DeckCard, type MatchState } from "./types";

export function botStep(state: MatchState): MatchState {
  if (state.finished) return state;

  const me = state.players[state.turn];

  if (state.phase === "draw") {
    // Respect hand limit — if already full, skip drawing and go play.
    if (me.hand.length >= HAND_LIMIT) {
      return { ...state, phase: "place" as const, lastEvent: `${me.name} hand is full — skipping pick-up` };
    }
    const top = state.used[state.used.length - 1];
    const wantUsed = top && (top.kind === "creator" || top.kind === "sky_creator" || top.kind === "golden_body" || top.kind === "golden_hive");
    if (wantUsed && state.used.length > 0) return pickFromUsed(state);
    if (state.draw.length > 0) return pickFromDraw(state);
    if (state.used.length > 0) return pickFromUsed(state);
    return state;
  }

  const player = state.players[state.turn];
  const { creators } = ecosystemSummary(player.ecosystem);
  const handFull = player.hand.length >= HAND_LIMIT - 2;

  // 1) Place a creator we still need.
  if (creators < CREATORS_NEEDED) {
    const creator = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (creator) {
      const cell = legalEcoCells(player.ecosystem)[0];
      try { return placeOnEcosystem(state, creator.uid, cell); } catch {}
    }
  }

  // 2) Place an animal that links to a placed creator (do this BEFORE disasters
  //    when hand is full, so we don't flood ourselves with more cards).
  const placedCreators = [...player.ecosystem.placed.values()].filter(
    (pc) => pc.card.kind === "creator" || pc.card.kind === "sky_creator",
  );
  for (const card of player.hand) {
    if (card.kind !== "animal" && card.kind !== "sky_creature" && card.kind !== "golden_body") continue;
    const link = placedCreators.find((pc) => animalLinksToCreator(card, pc.card));
    if (!link) continue;
    const cells = legalEcoCells(player.ecosystem);
    const cell = cells[0];
    try { return placeOnEcosystem(state, card.uid, cell); } catch {}
  }

  // 3) Play a disaster only when we still have headroom — disasters return
  //    wiped animals to our hand and can otherwise spiral the hand size.
  if (!handFull && creators >= CREATORS_NEEDED) {
    const spare = player.hand.find((c) => c.kind === "creator" || c.kind === "sky_creator");
    if (spare) {
      try { return playDisaster(state, spare.uid); } catch {}
    }
  }

  // 4) Place anything legal.
  const any = player.hand.find((c) => c.kind !== "golden_hive");
  if (any) {
    const cell = legalEcoCells(player.ecosystem)[0];
    try { return placeOnEcosystem(state, any.uid, cell); } catch {}
  }

  // 5) Discard the first card.
  const dump = player.hand[0];
  if (dump) return discardCard(state, dump.uid);
  return state;
}
