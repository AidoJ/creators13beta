/**
 * Hex grid helpers (pointy-top, axial coordinates).
 *
 * Edge indexing (0..5), starting at the top-right edge and going clockwise:
 *   0 = NE (neighbour at q+1, r-1)
 *   1 = E  (neighbour at q+1, r  )
 *   2 = SE (neighbour at q,   r+1)
 *   3 = SW (neighbour at q-1, r+1)
 *   4 = W  (neighbour at q-1, r  )
 *   5 = NW (neighbour at q,   r-1)
 */

import type { Axial } from "./types";

export type EdgeIndex = 0 | 1 | 2 | 3 | 4 | 5;

export const EDGE_DIRS: ReadonlyArray<Axial> = [
  { q: +1, r: -1 }, // 0 NE
  { q: +1, r:  0 }, // 1 E
  { q:  0, r: +1 }, // 2 SE
  { q: -1, r: +1 }, // 3 SW
  { q: -1, r:  0 }, // 4 W
  { q:  0, r: -1 }, // 5 NW
];

/** Opposite-edge lookup: edge i on hex A faces edge OPPOSITE[i] on the neighbour. */
export const OPPOSITE_EDGE: ReadonlyArray<EdgeIndex> = [3, 4, 5, 0, 1, 2];

export const keyOf = (p: Axial): string => `${p.q},${p.r}`;
export const parseKey = (k: string): Axial => {
  const [q, r] = k.split(",").map(Number);
  return { q, r };
};

export const eqAxial = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;

export function neighbour(pos: Axial, edge: EdgeIndex): Axial {
  const d = EDGE_DIRS[edge];
  return { q: pos.q + d.q, r: pos.r + d.r };
}

export function neighbours(pos: Axial): Axial[] {
  return EDGE_DIRS.map((d) => ({ q: pos.q + d.q, r: pos.r + d.r }));
}
