/** Pointy-top hex grid helpers (axial coordinates). */

import type { Axial } from "./types";

export const NEIGHBOUR_DIRS: ReadonlyArray<Axial> = [
  { q: +1, r:  0 },
  { q: +1, r: -1 },
  { q:  0, r: -1 },
  { q: -1, r:  0 },
  { q: -1, r: +1 },
  { q:  0, r: +1 },
];

export const keyOf = (p: Axial): string => `${p.q},${p.r}`;
export const parseKey = (k: string): Axial => {
  const [q, r] = k.split(",").map(Number);
  return { q, r };
};

export function neighbours(pos: Axial): Axial[] {
  return NEIGHBOUR_DIRS.map((d) => ({ q: pos.q + d.q, r: pos.r + d.r }));
}

export function axialToPixel(q: number, r: number, size: number) {
  const W = size;
  const H = size * 1.1547;
  return { x: W * (q + r / 2), y: H * 0.75 * r };
}
