/**
 * SCRIPTED BOT — coached practice matches only.
 *
 * The coached tutorial narrates what the bot does ("watch it match a colour"),
 * so the bot must not improvise. This module replaces the bot AI's *decision*
 * with a deterministic, readable policy — but every move it returns is applied
 * through the SAME engine functions the real game uses, so the bot can never
 * make a move the real rules wouldn't allow.
 *
 * Policy, in order:
 *   1. draw phase  — opening five, otherwise pick up from the draw pile
 *   2. place phase — the first hand card that has a legal, colour-matching
 *      home, placed in the first legal cell (stable ordering ⇒ reproducible)
 *   3. otherwise   — discard the first card, else end the turn
 *
 * No disasters, no steals: the coached bot never wipes the learner's board
 * mid-lesson. Those mechanics are taught from the player's side instead.
 */
import {
  discardCard,
  drawInitialFive,
  endTurnEarly,
  legalEcoCells,
  pickFromDraw,
  pickFromUsed,
  placeOnEcosystem,
  placementMatchesNeighbours,
  skipDraws,
} from "./engine";
import { keyOf } from "./board";
import type { MatchState } from "./types";

export interface CoachBotResult {
  next: MatchState;
  /** What the bot just did — used for WATCH-step narration. */
  kind: "draw" | "place" | "discard" | "end" | "none";
}

export function coachBotStep(state: MatchState): CoachBotResult {
  if (state.finished) return { next: state, kind: "none" };
  const me = state.players[state.turn];
  if (!me) return { next: state, kind: "none" };

  /* ---- Draw phase ---- */
  if (state.phase === "draw") {
    if (!me.firstPickupDone) {
      try {
        return { next: drawInitialFive(state), kind: "draw" };
      } catch {
        /* fall through */
      }
    }
    if (state.draw.length > 0) {
      try {
        return { next: pickFromDraw(state), kind: "draw" };
      } catch {
        /* fall through */
      }
    }
    if (state.used.length > 0) {
      try {
        return { next: pickFromUsed(state), kind: "draw" };
      } catch {
        /* fall through */
      }
    }
    try {
      return { next: skipDraws(state), kind: "draw" };
    } catch {
      return { next: state, kind: "none" };
    }
  }

  /* ---- Place phase: first legal matching placement, stable order ---- */
  const cells = legalEcoCells(me.ecosystem);
  // Stable cell ordering so the same board always yields the same play.
  const ordered = [...cells].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  for (const card of me.hand) {
    if (card.kind === "golden_hive") continue; // cannot be placed
    for (const cell of ordered) {
      if (!placementMatchesNeighbours(me.ecosystem, card, cell)) continue;
      try {
        return { next: placeOnEcosystem(state, card.uid, cell), kind: "place" };
      } catch {
        /* try the next combination */
      }
    }
  }

  /* ---- Nothing placeable: discard, else end the turn ---- */
  const discardable = me.hand.find((c) => c.kind !== "golden_hive");
  if (discardable) {
    try {
      return { next: discardCard(state, discardable.uid), kind: "discard" };
    } catch {
      /* fall through */
    }
  }
  try {
    return { next: endTurnEarly(state), kind: "end" };
  } catch {
    return { next: state, kind: "none" };
  }
}
