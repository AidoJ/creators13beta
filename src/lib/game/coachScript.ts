/**
 * COACHED FIRST MATCH — the script.
 *
 * This is NOT a separate game engine. The coached match is a normal practice
 * match against the bot; this script simply watches the moves the player makes
 * (via `Play.tsx`'s single `guarded()` funnel) and advances one lesson at a
 * time.
 *
 * Design rules, in priority order:
 *   1. The coach NEVER blocks a legal move. Every action stays available at
 *      all times — off-script taps are redirected with words, not locks.
 *   2. Every lesson must be POSSIBLE. The draw pile is deterministically
 *      stacked (see `seedOpeningHand` / `stackForWant`) so the card a lesson
 *      needs is always the next one up.
 *   3. Scaffolding fades. Full highlights on the first instance of a mechanic,
 *      lighter prompts after, and the coach retires before the match ends so
 *      the player finishes on their own.
 *
 * ── EDITING GUIDE (A'Hara) ────────────────────────────────────────────────
 * `prompt` is what the coach asks for. `confirm` is what it says once the
 * player has done it. Both are plain text — edit freely. `topicId` links a
 * step to a Rule Book topic in `learnContent.ts`, which powers the "Tell me
 * more" link.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { CardKind, DeckCard, MatchState } from "./types";
import type { CreatorTypeName } from "@/lib/gameCards";

/** What the coach spotlights while a step is live. */
export type CoachTarget = "deck" | "hand" | "board" | "quiz" | "discard" | "none";

/** Cards the coach wants on top of the draw pile before a step. */
export type CoachWant = "creator" | "animal_match" | "sky_creature" | "golden_body" | null;

export interface CoachStep {
  id: string;
  /** Related Rule Book topic — powers the "Tell me more" link. */
  topicId?: string;
  title: string;
  prompt: string;
  /** Shown briefly once the step completes. */
  confirm: string;
  target: CoachTarget;
  /** full = spotlight + highlights, medium = prompt only, light = whisper. */
  scaffold: "full" | "medium" | "light";
  /** Move types that count toward completing this step. */
  completedBy?: string[];
  /** How many qualifying moves are needed (default 1). */
  count?: number;
  /** Read-only step — advances on "Got it". */
  ack?: boolean;
  /** Gentle redirect when the player does something else instead. */
  redirect?: string;
  /** Card the coach stacks on top of the draw pile for this step. */
  want?: CoachWant;
  /** Optional steps auto-skip if they can't happen. */
  optional?: boolean;
}

export const COACH_STEPS: CoachStep[] = [
  {
    id: "draw-opening",
    topicId: "the-turn",
    title: "Take your opening hand",
    prompt:
      "Learn by playing — a real game against an easy bot, nothing at stake. Tap **Draw 5** to take your opening hand.",
    confirm: "That's your hand. From now on you pick up 2 cards at the start of every turn.",
    target: "deck",
    scaffold: "full",
    completedBy: ["draw_initial_5", "pickup_from_draw"],
    redirect: "Let's draw first — tap the Draw Pile.",
  },
  {
    id: "read-a-card",
    topicId: "reading-a-card",
    title: "Read a card",
    prompt:
      "Look at your hand. Each hexagon is split into coloured halves — every colour is a Creator Type. Tap the ⓘ on any card to flip it and read what it is.",
    confirm: "Those colours are everything — matching them is how cards connect.",
    target: "hand",
    scaffold: "full",
    ack: true,
  },
  {
    id: "elements",
    topicId: "elements",
    title: "13 Creators, 4 elements",
    prompt:
      "There are 13 Creator Types: 3 under each element — Fire, Air, Water, Earth — plus Sky as the wildcard. Your ecosystem needs one Creator from each of the four elements.",
    confirm: "",
    target: "none",
    scaffold: "full",
    ack: true,
  },
  {
    id: "place-first",
    topicId: "placement",
    title: "Place your first card",
    prompt:
      "Tap a Creator card in your hand, then tap the glowing centre hex. Your first card can go anywhere on the board.",
    confirm: "That Creator is the anchor of your ecosystem.",
    target: "board",
    scaffold: "full",
    completedBy: ["place"],
    redirect: "Pick a card from your hand first, then tap a glowing hex.",
  },
  {
    id: "place-adjacent",
    topicId: "placement",
    title: "Now match a neighbour",
    prompt:
      "Place a second card next to the first. The rule: at least one neighbour must share a Creator Type — one matching colour is enough. The glowing hexes show where it's legal.",
    confirm: "See how the sides connected? That shared colour is the whole placement rule.",
    target: "board",
    scaffold: "full",
    completedBy: ["place"],
    want: "animal_match",
    redirect: "Choose a card, then tap one of the glowing hexes.",
  },
  {
    id: "draw-two",
    topicId: "the-turn",
    title: "A normal turn: pick up 2",
    prompt:
      "Your turn ended after two actions. When it comes back around, pick up 2 cards — from the Draw Pile, the Used Pile, or one of each.",
    confirm: "Two in, two out. That's every turn.",
    target: "deck",
    scaffold: "medium",
    completedBy: ["pickup_from_draw", "pickup_from_used"],
    count: 2,
    redirect: "Pick up 2 cards to start your turn.",
  },
  {
    id: "discard",
    topicId: "the-turn",
    title: "Discarding counts as an action",
    prompt:
      "Drag any card onto the Used Pile to discard it. Discarding is always legal, so you can never be stuck — and cards with no legal play show muted in your hand.",
    confirm: "Good. Discard is your escape hatch whenever nothing fits.",
    target: "discard",
    scaffold: "medium",
    completedBy: ["discard"],
    redirect: "Drop a card onto the Used Pile to discard it.",
  },
  {
    id: "rotate",
    topicId: "placement",
    title: "Free action: rotate",
    prompt:
      "Tap one of your placed hexes to rotate it 60°. It's free, it doesn't use an action, and it lets you turn the colour you need toward an open edge. Try it, or skip ahead.",
    confirm: "Rotating is free — use it whenever the colours don't line up.",
    target: "board",
    scaffold: "light",
    completedBy: ["rotate_hex"],
    optional: true,
  },
  {
    id: "quiz",
    topicId: "quiz",
    title: "Quiz bonuses",
    prompt:
      "Every time you play a Creator card a pulsing Quiz badge appears. Tap it and answer a question about that Creator Type — correct answers add bonus points to your score. Skipping is fine, but you lose the bonus.",
    confirm: "",
    target: "quiz",
    scaffold: "medium",
    ack: true,
  },
  {
    id: "disaster",
    topicId: "disasters",
    title: "Play a Disaster",
    prompt:
      "Once all 4 of your own Creators are on the board, a spare Creator in your hand can be fired as a Disaster — it wipes every matching Animal from your rivals and drops them onto your board. Get your Creators down, then use the Disaster button.",
    confirm: "That's the biggest swing in the game — and those Animals are yours now.",
    target: "hand",
    scaffold: "medium",
    completedBy: ["play_disaster"],
    want: "creator",
    optional: true,
    redirect: "Select a Creator card in your hand, then tap Disaster.",
  },
  {
    id: "steal",
    topicId: "sky-steal",
    title: "Sky Creatures & stealing",
    prompt:
      "A Sky Creature can be placed as a normal Animal, or spent as a Stealer — discard it and take one Animal straight out of an opponent's ecosystem. Try a steal, or skip ahead if you'd rather keep it.",
    confirm: "Stolen Animals come into your hand — you still have to place them.",
    target: "hand",
    scaffold: "medium",
    completedBy: ["play_sky_steal"],
    want: "sky_creature",
    optional: true,
    redirect: "Select the Sky Creature, then tap Steal.",
  },
  {
    id: "golden",
    topicId: "golden-cards",
    title: "The two golden cards",
    prompt:
      "Two cards behave differently. Golden Body is a wildcard Animal — it matches anything. Golden Hive can't be placed or discarded; it waits in your hand and blocks one Disaster aimed at you. There's only one Hive in the whole deck. Full detail is in the Rule Book.",
    confirm: "",
    target: "none",
    scaffold: "light",
    ack: true,
  },
  {
    id: "winning",
    topicId: "winning",
    title: "How you win",
    prompt:
      "16 cards: 4 Creators covering all four elements, plus 12 Animals — 3 touching each Creator — and no Creator cards left in your hand.",
    confirm: "",
    target: "none",
    scaffold: "light",
    ack: true,
  },
  {
    id: "fly-solo",
    title: "Over to you",
    prompt:
      "That's everything you need. Finish this game on your own — I'll stay out of the way. The ⓘ Rule Book is in the header any time you want it.",
    confirm: "",
    target: "none",
    scaffold: "light",
    ack: true,
  },
];

/* ------------------------------------------------------------------ */
/* Deterministic deck stacking                                         */
/* ------------------------------------------------------------------ */

function pull(draw: DeckCard[], pred: (c: DeckCard) => boolean): DeckCard | null {
  const i = draw.findIndex(pred);
  return i >= 0 ? draw.splice(i, 1)[0] : null;
}

/**
 * Guarantees a teachable opening hand: one Creator, two Animals that share
 * that Creator's type (so the adjacency lesson always has a legal move), and
 * two more Creators of different elements.
 */
export function seedOpeningHand(state: MatchState): MatchState {
  const draw = [...state.draw];
  const creator1 = pull(draw, (c) => c.kind === "creator" && !!c.displayType);
  if (!creator1) return state;
  const t = creator1.displayType as CreatorTypeName;
  const animal1 = pull(draw, (c) => c.kind === "animal" && !!c.types?.includes(t));
  const animal2 = pull(draw, (c) => c.kind === "animal" && !!c.types?.includes(t));
  const creator2 = pull(draw, (c) => c.kind === "creator" && c.element !== creator1.element);
  const creator3 = pull(
    draw,
    (c) => c.kind === "creator" && c.element !== creator1.element && c.element !== creator2?.element,
  );
  const picks = [creator1, animal1, animal2, creator2, creator3].filter(Boolean) as DeckCard[];
  return { ...state, draw: [...picks, ...draw] };
}

/** Creator Types currently visible on a player's board — used to guarantee the
 *  next stacked Animal has a legal home. */
function typesOnBoard(state: MatchState, playerIdx: number): Set<string> {
  const out = new Set<string>();
  const eco = state.players[playerIdx]?.ecosystem;
  if (!eco) return out;
  eco.placed.forEach((pc) => {
    pc.card.types?.forEach((t) => out.add(t));
    if (pc.card.displayType) out.add(pc.card.displayType);
  });
  return out;
}

const KIND_FOR_WANT: Record<Exclude<CoachWant, null | "animal_match">, CardKind> = {
  creator: "creator",
  sky_creature: "sky_creature",
  golden_body: "golden_body",
};

/**
 * Moves the card a lesson needs to the top of the draw pile. Called only when
 * it is the coached player's draw phase, so the bot can never intercept it.
 * Returns the same state object when nothing needed moving.
 */
export function stackForWant(state: MatchState, want: CoachWant, playerIdx: number): MatchState {
  if (!want) return state;
  const draw = [...state.draw];

  if (want === "animal_match") {
    const types = typesOnBoard(state, playerIdx);
    if (types.size === 0) return state;
    const card = pull(draw, (c) => c.kind === "animal" && !!c.types?.some((t) => types.has(t)));
    if (!card) return state;
    return { ...state, draw: [card, ...draw] };
  }

  const kind = KIND_FOR_WANT[want];
  const card = pull(draw, (c) => c.kind === kind);
  if (!card) return state;
  return { ...state, draw: [card, ...draw] };
}
