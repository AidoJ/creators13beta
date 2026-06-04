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
import { NEIGHBOUR_DIRS, keyOf, neighbours } from "./board";

const BASE_HALVES: Array<"A" | "B"> = ["B", "A", "A", "A", "B", "B"];
const CANONICAL_TYPES = [
  "Lava", "Fire", "Whirlwind", "Snow", "Lightning", "Sun",
  "Lake", "Ocean", "Tree", "Mountain", "Soil", "River",
];

const sameType = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

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

function skyLockedSubTypeForRotation(eco: Ecosystem, skyPos: Axial): string | null {
  const counts: Record<string, number> = {};
  let golden = 0;
  for (const n of neighbours(skyPos)) {
    const pc = eco.placed.get(keyOf(n));
    if (!pc) continue;
    if (pc.card.kind === "golden_body") { golden += 1; continue; }
    if (pc.card.kind !== "animal" && pc.card.kind !== "sky_creature") continue;
    for (const t of pc.card.types ?? []) {
      if (!t || t === "Sky") continue;
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  const candidates = CANONICAL_TYPES
    .filter((t) => (counts[t] ?? 0) > 0 && (counts[t] ?? 0) + golden >= 3)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || CANONICAL_TYPES.indexOf(a) - CANONICAL_TYPES.indexOf(b));
  return candidates[0] ?? null;
}

function semanticEdgeScore(
  eco: Ecosystem,
  card: DeckCard,
  rotation: number,
  dir: number,
  neighbour: PlacedCard,
): number {
  if (card.kind === "golden_body" || neighbour.card.kind === "golden_body") return 1;

  const mine = facingTypeLabel(card, rotation, dir);
  const theirs = facingTypeLabel(neighbour.card, neighbour.rotation ?? 0, (dir + 3) % 6);

  if (card.kind === "animal" || card.kind === "sky_creature") {
    if (neighbour.card.kind === "creator") {
      return sameType(mine, neighbour.card.displayType) ? 4 : 0;
    }
    if (neighbour.card.kind === "sky_creator") {
      const sub = skyLockedSubTypeForRotation(eco, neighbour.pos);
      return sub && sameType(mine, sub) ? 4 : 0;
    }
  }

  if (neighbour.card.kind === "animal" || neighbour.card.kind === "sky_creature") {
    if (card.kind === "creator") {
      return sameType(theirs, card.displayType) ? 4 : 0;
    }
    if (card.kind === "sky_creator") {
      const sub = skyLockedSubTypeForRotation(eco, neighbour.pos);
      return sub && sameType(theirs, sub) ? 4 : 0;
    }
  }

  if (sameType(mine, theirs)) return 2;
  return facingColor(card, rotation, dir).toLowerCase() === facingColor(neighbour.card, neighbour.rotation ?? 0, (dir + 3) % 6).toLowerCase() ? 1 : 0;
}

/** Pick the rotation (0..5) that maximises matching-colour edges with
 *  existing neighbours in `eco`. Ties broken by preferring rotation 0. */
export function bestRotationForPlacement(
  eco: Ecosystem,
  card: DeckCard,
  pos: Axial,
  opts?: { restrictTo?: "creator-only" | "any"; currentRotation?: number; driverPos?: Axial },
): number {
  const restrict = opts?.restrictTo ?? "any";
  const current = opts?.currentRotation ?? 0;
  const driverKey = opts?.driverPos ? keyOf(opts.driverPos) : null;
  // Single-colour cards: rotation is irrelevant.
  const [a, b] = cardHalfColors(card);
  if (a === b) return 0;

  // Collect eligible neighbours under the restriction.
  const eligible: Array<{ dir: number; neighbour: NonNullable<ReturnType<typeof eco.placed.get>> }> = [];
  for (let dir = 0; dir < 6; dir++) {
    const d = NEIGHBOUR_DIRS[dir];
    const nKey = keyOf({ q: pos.q + d.q, r: pos.r + d.r });
    const neighbour = eco.placed.get(nKey);
    if (!neighbour) continue;
    if (driverKey && nKey !== driverKey) continue;
    if (restrict === "creator-only") {
      const k = neighbour.card.kind;
      if (k !== "creator" && k !== "sky_creator") continue;
    }
    eligible.push({ dir, neighbour });
  }
  // If restriction filtered out everything, don't auto-pivot — preserve current rotation.
  if (eligible.length === 0) return current;

  let bestRot = current;
  let bestScore = -1;
  for (let rot = 0; rot < 6; rot++) {
    let score = 0;
    for (const { dir, neighbour } of eligible) {
      score += semanticEdgeScore(eco, card, rot, dir, neighbour);
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
