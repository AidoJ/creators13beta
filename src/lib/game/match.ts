/**
 * Match / adjacency rules.
 *
 * A placed card is LEGAL on a non-empty board only if at least one of its
 * two Creator Types matches a Creator Type on at least one of its occupied
 * neighbours (matching = the touching edges share the same Creator Type).
 *
 * For each candidate placement we also compute the OPTIMAL rotation: the
 * rotation that maximises the number of matching edges. Ties broken by
 * preferring lower rotation index (stable, predictable).
 */

import type { GameCard } from "@/lib/gameCards";
import { EDGE_DIRS, keyOf, OPPOSITE_EDGE, type EdgeIndex } from "./board";
import { ALL_ROTATIONS, typeAtEdge } from "./rotation";
import type { Axial, MatchState, PlacedCard, Rotation } from "./types";

export interface PlacementEvaluation {
  rotation: Rotation;
  matchingEdges: number;
  /** Edges (on the candidate hex) that produce a colour-continuous join. */
  matchedEdgeIndices: EdgeIndex[];
}

/** Returns the placed neighbours of a position as [edgeIndex, placedCard][]. */
export function occupiedNeighbours(
  board: MatchState["board"],
  pos: Axial,
): Array<[EdgeIndex, PlacedCard]> {
  const out: Array<[EdgeIndex, PlacedCard]> = [];
  for (let i = 0 as EdgeIndex; i < 6; i = (i + 1) as EdgeIndex) {
    const d = EDGE_DIRS[i];
    const k = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
    const occ = board.get(k);
    if (occ) out.push([i, occ]);
  }
  return out;
}

/** Score every rotation; returns the best plus a full breakdown. */
export function evaluatePlacement(
  card: GameCard,
  pos: Axial,
  board: MatchState["board"],
): { best: PlacementEvaluation; all: PlacementEvaluation[] } {
  const occ = occupiedNeighbours(board, pos);
  const all: PlacementEvaluation[] = ALL_ROTATIONS.map((rot) => {
    const matchedEdgeIndices: EdgeIndex[] = [];
    for (const [edge, neighbourCard] of occ) {
      const ourType = typeAtEdge(card, rot, edge);
      const theirEdge = OPPOSITE_EDGE[edge];
      const theirType = typeAtEdge(
        neighbourCard.card,
        neighbourCard.rotation,
        theirEdge,
      );
      if (ourType === theirType) matchedEdgeIndices.push(edge);
    }
    return { rotation: rot, matchingEdges: matchedEdgeIndices.length, matchedEdgeIndices };
  });
  const best = all.reduce((a, b) => (b.matchingEdges > a.matchingEdges ? b : a));
  return { best, all };
}

/** Adjacent empty cells that touch at least one placed card. */
export function legalCells(board: MatchState["board"]): Axial[] {
  if (board.size === 0) return [{ q: 0, r: 0 }];
  const empty = new Map<string, Axial>();
  for (const placed of board.values()) {
    for (const d of EDGE_DIRS) {
      const cell = { q: placed.pos.q + d.q, r: placed.pos.r + d.r };
      const k = keyOf(cell);
      if (!board.has(k) && !empty.has(k)) empty.set(k, cell);
    }
  }
  return Array.from(empty.values());
}

/**
 * A card can legally be placed at `pos` if either (a) the board is empty
 * (first move) or (b) some rotation produces ≥ 1 matching edge with an
 * adjacent placed card.
 */
export function canPlace(
  card: GameCard,
  pos: Axial,
  board: MatchState["board"],
): boolean {
  if (board.size === 0) return true;
  if (board.has(keyOf(pos))) return false;
  const occ = occupiedNeighbours(board, pos);
  if (occ.length === 0) return false;
  const { best } = evaluatePlacement(card, pos, board);
  return best.matchingEdges > 0;
}

/** Does this card have ANY legal placement anywhere on the current board? */
export function hasAnyLegalMove(card: GameCard, board: MatchState["board"]): boolean {
  if (board.size === 0) return true;
  for (const cell of legalCells(board)) {
    if (canPlace(card, cell, board)) return true;
  }
  return false;
}
