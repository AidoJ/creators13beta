/**
 * Greedy bot: for each card in hand × each legal cell, score the optimal
 * placement and pick the highest matchingEdges. Ties broken by deck order
 * (first card / first cell). If nothing is legal, discards the first card
 * that has zero legal moves (or the first card if all do — shouldn't happen).
 */

import { canPlace, evaluatePlacement, legalCells, hasAnyLegalMove } from "./match";
import type { Axial, MatchState, Rotation } from "./types";

export type BotMove =
  | { kind: "place"; cardSlug: string; pos: Axial; rotation: Rotation }
  | { kind: "discard"; cardSlug: string };

export function pickBotMove(state: MatchState): BotMove {
  const player = state.players[state.turn];
  const cells = legalCells(state.board);

  let best: { score: number; cardSlug: string; pos: Axial; rotation: Rotation } | null = null;

  for (const card of player.hand) {
    for (const cell of cells) {
      if (!canPlace(card, cell, state.board)) continue;
      const { best: ev } = evaluatePlacement(card, cell, state.board);
      const score = ev.matchingEdges;
      if (!best || score > best.score) {
        best = { score, cardSlug: card.slug, pos: cell, rotation: ev.rotation };
      }
    }
  }

  if (best) {
    return { kind: "place", cardSlug: best.cardSlug, pos: best.pos, rotation: best.rotation };
  }

  // No legal placement → discard the card with the fewest matches anywhere
  // (or just the first if all are equally hopeless).
  const stuck = player.hand.find((c) => !hasAnyLegalMove(c, state.board)) ?? player.hand[0];
  return { kind: "discard", cardSlug: stuck.slug };
}
