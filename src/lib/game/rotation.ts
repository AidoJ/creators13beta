/**
 * Hex rotation + type-half mapping.
 *
 * A card stores its two Creator Types as (typeA, typeB). At rotation 0 the
 * card occupies a true 50/50 split. We model which edges show which type
 * with a simple rule: at rotation 0, edges 5,0,1 (top-half, NW→NE→E) belong
 * to typeA and edges 2,3,4 (S→SW→W) belong to typeB.
 *
 * A rotation r ∈ 0..5 cycles which edges those halves cover, in 60°
 * increments going CLOCKWISE (matching EDGE_DIRS order). So edge i at
 * rotation r originally came from edge ((i - r + 6) % 6) at rotation 0.
 */

import type { CreatorTypeName, GameCard } from "@/lib/gameCards";
import type { EdgeIndex, Rotation } from "./types";

/** Which edges (at rotation 0) belong to typeA / typeB respectively. */
export const TYPE_A_EDGES_BASE: ReadonlyArray<EdgeIndex> = [5, 0, 1];
export const TYPE_B_EDGES_BASE: ReadonlyArray<EdgeIndex> = [2, 3, 4];

/** Which Creator Type sits on the given edge of `card` when rotated by `rot`. */
export function typeAtEdge(
  card: Pick<GameCard, "type_a" | "type_b">,
  rot: Rotation,
  edge: EdgeIndex,
): CreatorTypeName {
  const baseEdge = ((edge - rot + 6) % 6) as EdgeIndex;
  return TYPE_A_EDGES_BASE.includes(baseEdge) ? card.type_a : card.type_b;
}

/** All six rotation values. */
export const ALL_ROTATIONS: Rotation[] = [0, 1, 2, 3, 4, 5];
