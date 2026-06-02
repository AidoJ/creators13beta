/**
 * Hex split-background rotation helpers.
 *
 * Animal / Sky-Creature cards have a two-colour diagonal split (line drawn
 * from the upper-right vertex to the lower-left vertex of the pointy-top
 * hex). Rotating the hex by k * 60° clockwise lets the matching half face
 * the matching neighbour. The artwork itself never rotates.
 *
 * Edges by NEIGHBOUR_DIRS index at rotation 0:
 *   dir 0 (right)        → halfB
 *   dir 1 (upper-right)  → halfA
 *   dir 2 (upper-left)   → halfA
 *   dir 3 (left)         → halfA
 *   dir 4 (lower-left)   → halfB
 *   dir 5 (lower-right)  → halfB
 */

import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "./elements";
import type { DeckCard, Ecosystem, PlacedCard, Axial } from "./types";
import { NEIGHBOUR_DIRS, keyOf } from "./board";

const BASE_HALVES: Array<"A" | "B"> = ["B", "A", "A", "A", "B", "B"];

/** Which half (A or B) of a hex with `rotation` faces neighbour direction `dir`. */
export function halfFacing(dir: number, rotation: number): "A" | "B" {
  const r = ((rotation % 6) + 6) % 6;
  return BASE_HALVES[(dir - r + 6) % 6];
}

/** The Creator-Type / Element label that the given hex shows on the edge
 *  facing neighbour direction `dir`. Used by the board to render match badges. */
export function facingTypeLabel(
  card: DeckCard,
  rotation: number,
  dir: number,
): string | null {
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    const half = halfFacing(dir, rotation);
    return ((half === "A" ? t1 : t2) ?? t1 ?? null) as string | null;
  }
  if (card.kind === "creator") return card.element ?? null;
  if (card.kind === "sky_creator") return "Sky";
  return null;
}

/** Returns [colorA, colorB] for the split background of any card kind.
 *  Single-colour cards return the same value twice. */
export function cardHalfColors(card: DeckCard): [string, string] {
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    const c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#444";
    const c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    return [c1, c2];
  }
  if (card.kind === "creator") {
    const dt = card.displayType;
    const c = (dt && (CREATOR_TYPE_COLORS[dt as keyof typeof CREATOR_TYPE_COLORS])) ?? ELEMENT_COLORS[card.element!];
    return [c, c];
  }
  if (card.kind === "sky_creator") return [ELEMENT_COLORS.Sky, ELEMENT_COLORS.Sky];
  if (card.kind === "golden_body") return ["#f5c542", "#e0a920"];
  if (card.kind === "golden_hive") return ["#f5c542", "#ffffff"];
  return ["#444", "#444"];
}

function facingColor(card: DeckCard, rotation: number, dir: number): string {
  const [a, b] = cardHalfColors(card);
  return halfFacing(dir, rotation) === "A" ? a : b;
}

/** Pick the rotation (0..5) that maximises matching-colour edges with
 *  existing neighbours in `eco`. Ties broken by preferring rotation 0. */
export function bestRotationForPlacement(
  eco: Ecosystem,
  card: DeckCard,
  pos: Axial,
): number {
  // Single-colour cards: rotation is irrelevant.
  const [a, b] = cardHalfColors(card);
  if (a === b) return 0;

  let bestRot = 0;
  let bestScore = -1;
  for (let rot = 0; rot < 6; rot++) {
    let score = 0;
    for (let dir = 0; dir < 6; dir++) {
      const d = NEIGHBOUR_DIRS[dir];
      const nKey = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
      const neighbour = eco.placed.get(nKey);
      if (!neighbour) continue;
      const mine = facingColor(card, rot, dir);
      const theirs = facingColor(
        neighbour.card,
        neighbour.rotation ?? 0,
        (dir + 3) % 6,
      );
      if (mine.toLowerCase() === theirs.toLowerCase()) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRot = rot;
    }
  }
  return bestRot;
}

/** Returns a new ecosystem with the hex at posKey rotated +1 step (60° cw). */
export function rotatePlacedHex(eco: Ecosystem, posKey: string): Ecosystem {
  const pc = eco.placed.get(posKey);
  if (!pc) return eco;
  const next = new Map(eco.placed);
  next.set(posKey, { ...pc, rotation: (((pc.rotation ?? 0) + 1) % 6) });
  return { placed: next };
}
