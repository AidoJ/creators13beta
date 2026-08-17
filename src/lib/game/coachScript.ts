/**
 * COACHED FIRST MATCH — the script (v2).
 *
 * This is NOT a separate game engine. The coached match is a normal practice
 * match against the bot. Two things are scripted as INPUTS to the real engine:
 *   - the draw pile order (`seedOpeningHand` / `stackForWant`), and
 *   - the bot's moves (`coachBotScript.ts`).
 * Nothing inside the engine or the rules changes, so the tutorial can never
 * teach a rule the real game doesn't enforce. In particular there is NO
 * tutorial win shortcut: a win only ever happens if the engine's own
 * `checkWin` fires on a genuinely valid ecosystem.
 *
 * Each step declares:
 *   - `type`   — ack (read) · do (act) · watch (bot acts) · choose (optional)
 *   - `done`   — a predicate over a live TURN SNAPSHOT, never a move-event
 *                count, so a replayed or unrelated move can't advance it
 *   - `allow`  — the ACTION ENVELOPE: which specific action instance the step
 *                accepts. Anything outside it is gently prevented with a
 *                nudge, so the board can never drift into a state a later
 *                scripted step didn't expect.
 *
 * ── EDITING GUIDE ─────────────────────────────────────────────────────────
 * `prompt` is what the coach asks for, `confirm` what it says once done.
 * Both are plain text. Mechanics (`done`, `allow`, `want`, order) are code.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { CardKind, DeckCard, MatchState } from "./types";
import type { CreatorTypeName } from "@/lib/gameCards";

/** What the coach spotlights while a step is live. */
export type CoachTarget =
  | "deck"
  | "hand"
  | "board"
  | "quiz"
  | "discard"
  | "opponent"
  | "none";

/** Cards the coach wants on top of the draw pile before a step. */
export type CoachWant =
  | "creator"
  | "animal_match"
  | "sky_creature"
  | "golden_body"
  | "golden_hive"
  | null;

export type CoachStepType = "ack" | "do" | "watch" | "choose";

/** A live read of the match, rebuilt every render by Play.tsx. */
export interface CoachSnapshot {
  isMyTurn: boolean;
  phase: string;
  firstPickupDone: boolean;
  drawnThisTurn: number;
  /** Actions used this turn (placements + discards). */
  actionsUsed: number;
  actionsMax: number;
  handSize: number;
  handHasCreator: boolean;
  handHasGoldenBody: boolean;
  handHasGoldenHive: boolean;
  handHasSkyCreature: boolean;
  myPlaced: number;
  myCreatorsDown: number;
  oppPlaced: number;
  turnNumber: number;
  /** Monotonic counters — compared against the value captured when the step
   *  became live, so "one more of these happened" is unambiguous. */
  counters: {
    pickups: number;
    placements: number;
    discards: number;
    rotations: number;
    repositions: number;
    disasters: number;
    steals: number;
    botMoves: number;
    botPlacements: number;
    cardInfoOpens: number;
    opponentViews: number;
    hiveBlocks: number;
  };
}

export type CoachCounterKey = keyof CoachSnapshot["counters"];

/** Descriptor of the move being attempted, passed to the action envelope. */
export interface CoachMoveAttempt {
  type: string;
  card?: DeckCard | null;
}

export interface CoachStep {
  id: string;
  type: CoachStepType;
  topicId?: string;
  title: string;
  prompt: string;
  confirm: string;
  target: CoachTarget;
  scaffold: "full" | "medium" | "light";
  /** Completion predicate over the live snapshot vs the snapshot captured
   *  when this step became live. */
  done?: (now: CoachSnapshot, base: CoachSnapshot) => boolean;
  /** Live progress line, e.g. "1 of 2 picked up". */
  progress?: (now: CoachSnapshot, base: CoachSnapshot) => string | null;
  /**
   * ACTION ENVELOPE. Return null to allow the move, or a nudge string to
   * gently prevent it. Only the SPECIFIC intended action instance is allowed
   * while the step is live; everything else is refused with words.
   */
  allow?: (move: CoachMoveAttempt, now: CoachSnapshot) => string | null;
  /** Card stacked on top of the draw pile before this step. */
  want?: CoachWant;
  /** Auto-skips when it can't happen (choose steps). */
  optional?: boolean;
  /** Shown instead of stalling when the mechanic is unreachable. */
  fallback?: string;
}

const PLACE_MOVES = ["place"];
const DRAW_MOVES = ["draw_initial_5", "pickup_from_draw", "pickup_from_used"];
const FREE_MOVES = ["rotate_hex", "move_hex"];

/** Free actions (rotate / reposition) are legal at every step and never
 *  desync the script — they never leave the envelope. */
function freeOk(move: CoachMoveAttempt) {
  return FREE_MOVES.includes(move.type);
}

/** Standard envelope: allow only these move types, nudge otherwise. */
function only(types: string[], nudge: string) {
  return (move: CoachMoveAttempt): string | null => {
    if (freeOk(move) || types.includes(move.type)) return null;
    return nudge;
  };
}

const gained = (k: CoachCounterKey, n = 1) =>
  (now: CoachSnapshot, base: CoachSnapshot) => now.counters[k] - base.counters[k] >= n;

export const COACH_STEPS: CoachStep[] = [
  /* ── Round 1 — heavy scaffolding ─────────────────────────────────── */
  {
    id: "welcome",
    type: "ack",
    topicId: "winning",
    title: "Welcome — learn by playing",
    prompt:
      "This is a real game against an easy bot, with nothing at stake. Your goal: build an ecosystem of **16 cards** — 4 Creators covering all four elements, each surrounded by 3 matching Animals. I'll walk you through every move.",
    confirm: "",
    target: "none",
    scaffold: "full",
  },
  {
    id: "draw-opening",
    type: "do",
    topicId: "the-turn",
    title: "Take your opening hand",
    prompt: "Tap **Draw 5** on the Draw Pile to take your opening hand.",
    confirm: "That's your hand. From now on you pick up 2 cards at the start of every turn.",
    target: "deck",
    scaffold: "full",
    done: (n) => n.firstPickupDone,
    allow: only(DRAW_MOVES, "Let's start with your hand — tap Draw 5 on the Draw Pile."),
  },
  {
    id: "read-a-card",
    type: "do",
    topicId: "reading-a-card",
    title: "Read a card",
    prompt:
      "Every hexagon is split into two coloured halves — each colour is a Creator Type. Tap the **ⓘ** on any card in your hand to flip it and read what it is.",
    confirm: "Those colours are everything — matching them is how cards connect.",
    target: "hand",
    scaffold: "full",
    done: gained("cardInfoOpens"),
    allow: only([], "Tap the ⓘ on a card in your hand first — I'll wait."),
  },
  {
    id: "elements",
    type: "ack",
    topicId: "elements",
    title: "13 Creators, 4 elements",
    prompt:
      "There are 13 Creator Types: 3 under each element — **Fire, Air, Water, Earth** — plus **Sky**, the wildcard. A finished ecosystem needs one Creator from each of the four elements.",
    confirm: "",
    target: "none",
    scaffold: "full",
  },
  {
    id: "tour-self",
    type: "ack",
    title: "Your side of the table",
    prompt:
      "Your **board** is the hex grid, your **hand** sits along the bottom, and the two piles are the **Draw Pile** (face down) and the **Used Pile** (face up). You can pick up from either.",
    confirm: "",
    target: "board",
    scaffold: "full",
  },
  {
    id: "tour-opponent",
    type: "ack",
    title: "Where your rivals are",
    prompt:
      "Every player builds their own ecosystem. On a big screen they sit in the rail beside your board. **On a phone, tap the dots at the top of the screen** to open a rival's ecosystem — you'll need that for Disasters and stealing.",
    confirm: "",
    target: "opponent",
    scaffold: "full",
  },
  {
    id: "place-first",
    type: "do",
    topicId: "placement",
    title: "Place your first card",
    prompt:
      "Tap a **Creator** card in your hand, then tap a glowing hex. Your first card can go anywhere — it's the anchor of your ecosystem.",
    confirm: "That Creator is your anchor. Everything else grows out from it.",
    target: "board",
    scaffold: "full",
    done: gained("placements"),
    allow: (move) => {
      if (freeOk(move)) return null;
      if (move.type !== "place") return "Place a card first — tap a card, then a glowing hex.";
      if (move.card && move.card.kind !== "creator" && move.card.kind !== "sky_creator")
        return "Start with a Creator card — it anchors your ecosystem.";
      return null;
    },
  },
  {
    id: "second-action",
    type: "do",
    topicId: "the-turn",
    title: "Two actions a turn",
    prompt:
      "Every turn is exactly **two actions** — place a card or discard one, in any mix. You've used one. Take your second action now.",
    confirm: "Two actions done — your turn ends and the bot plays.",
    target: "hand",
    scaffold: "full",
    done: (n) => n.actionsUsed >= n.actionsMax || !n.isMyTurn,
    progress: (n) => `Action ${Math.min(n.actionsUsed, n.actionsMax)} of ${n.actionsMax} used`,
    allow: only(
      ["place", "discard"],
      "One action left this turn — place a card or discard one.",
    ),
  },
  {
    id: "watch-bot-draw",
    type: "watch",
    title: "Now watch the bot",
    prompt:
      "Your turn is over, so the bot takes its turn. It picks up 2 cards exactly like you do — watch its hand count and its board.",
    confirm: "",
    target: "opponent",
    scaffold: "full",
    done: gained("botMoves"),
  },
  {
    id: "watch-bot-place",
    type: "watch",
    title: "Watch the bot place",
    prompt:
      "The bot is placing a card against a neighbour it shares a colour with — the exact same rule you follow. Watch its ecosystem grow.",
    confirm: "Same rules for everyone — that's how you read a rival's board.",
    target: "opponent",
    scaffold: "full",
    done: gained("botPlacements"),
    fallback: "The bot had nothing to place this turn — it discarded instead. Same two actions.",
  },

  /* ── Round 2 — the turn rhythm ───────────────────────────────────── */
  {
    id: "pickup-two",
    type: "do",
    topicId: "the-turn",
    title: "Your turn: pick up 2",
    prompt:
      "Your turn opens with a pick-up: take **2 cards** from the Draw Pile, the Used Pile, or one of each.",
    confirm: "Two in, two out. That's the rhythm of every turn.",
    target: "deck",
    scaffold: "full",
    done: (n) => n.phase !== "draw" || n.drawnThisTurn >= 2,
    progress: (n) => `${Math.min(n.drawnThisTurn, 2)} of 2 picked up`,
    allow: only(DRAW_MOVES, "Pick up your 2 cards first — tap the Draw Pile or the Used Pile."),
  },
  {
    id: "adjacency",
    type: "do",
    topicId: "placement",
    title: "The matching rule",
    prompt:
      "Place a card next to one you already have. The rule: at least one neighbour must **share a Creator Type** — one matching colour is enough. Only legal hexes glow.",
    confirm: "See how the halves lined up? That shared colour is the whole placement rule.",
    target: "board",
    scaffold: "full",
    want: "animal_match",
    done: gained("placements"),
    allow: only(PLACE_MOVES, "This one's about placing — tap a card, then a glowing hex."),
  },
  {
    id: "discard",
    type: "do",
    topicId: "the-turn",
    title: "Discarding is an action too",
    prompt:
      "Use your second action to **discard**: drag a card onto the Used Pile. Discarding is always legal, so you can never be stuck — cards with no legal home show muted in your hand.",
    confirm: "Discard is your escape hatch whenever nothing fits.",
    target: "discard",
    scaffold: "full",
    done: gained("discards"),
    allow: only(["discard"], "For this lesson, drop a card onto the Used Pile to discard it."),
  },
  {
    id: "rotate",
    type: "choose",
    topicId: "placement",
    title: "Free action: rotate",
    prompt:
      "Tap one of your placed hexes to rotate it 60°. It's **free** — it doesn't use an action — and it swings the colour you need toward an open edge. Try it, or skip.",
    confirm: "Rotating is free. Use it whenever the colours don't line up.",
    target: "board",
    scaffold: "medium",
    optional: true,
    done: gained("rotations"),
  },
  {
    id: "reposition",
    type: "choose",
    topicId: "placement",
    title: "Free action: reposition",
    prompt:
      "You can also pick up one of your own placed hexes and move it to another legal hex — also free. Try a reposition, or skip.",
    confirm: "Rearranging costs nothing, so tidy your board whenever you like.",
    target: "board",
    scaffold: "medium",
    optional: true,
    done: gained("repositions"),
  },
  {
    id: "watch-bot-again",
    type: "watch",
    title: "The bot's second turn",
    prompt:
      "Watch again — this time read its board yourself. Which colour did it match?",
    confirm: "",
    target: "opponent",
    scaffold: "medium",
    done: gained("botMoves"),
  },

  /* ── Round 3 — the live mechanics, actually played ───────────────── */
  {
    id: "hand-limit",
    type: "ack",
    topicId: "the-turn",
    title: "Hand limit",
    prompt:
      "Your hand holds 5 cards. If a card has nowhere legal to go it shows muted — discard it and move on rather than sitting on it.",
    confirm: "",
    target: "hand",
    scaffold: "medium",
  },
  {
    id: "golden-body",
    type: "do",
    topicId: "golden-cards",
    title: "Golden Body — the wildcard Animal",
    prompt:
      "You've been dealt a **Golden Body**. It matches anything, so it can go beside a hex it shares no colour with. Place it now.",
    confirm: "A Golden Body plugs any gap — save it for the hole nothing else fills.",
    target: "hand",
    scaffold: "full",
    want: "golden_body",
    optional: true,
    done: gained("placements"),
    allow: (move) => {
      if (freeOk(move)) return null;
      if (move.type !== "place") return "Place the Golden Body — tap it, then a glowing hex.";
      if (move.card && move.card.kind !== "golden_body")
        return "This lesson is the Golden Body — pick that card from your hand.";
      return null;
    },
    fallback: "No Golden Body came up — there are only a few in the deck. It's a wildcard Animal that matches anything.",
  },
  {
    id: "golden-hive",
    type: "ack",
    topicId: "golden-cards",
    title: "Golden Hive — the shield",
    prompt:
      "The **Golden Hive** can't be placed and can't be discarded. It simply waits in your hand and blocks **one Disaster** aimed at you. There is exactly one Hive in the whole deck.",
    confirm: "",
    target: "hand",
    scaffold: "medium",
  },
  {
    id: "creators-down",
    type: "do",
    topicId: "disasters",
    title: "Get your Creators down",
    prompt:
      "Disasters need all **4 of your own Creators** on the board first. Keep placing until your Creator count hits 4.",
    confirm: "All four elements covered — now you can fire a Disaster.",
    target: "board",
    scaffold: "medium",
    want: "creator",
    optional: true,
    progress: (n) => `Creators down: ${n.myCreatorsDown} of 4`,
    done: (n) => n.myCreatorsDown >= 4,
    allow: only(["place", "discard"], "Keep placing cards — you need 4 Creators on your board."),
    fallback: "The Creators didn't come around this game. Once all 4 of yours are placed, a spare Creator in hand can be fired as a Disaster.",
  },
  {
    id: "disaster",
    type: "do",
    topicId: "disasters",
    title: "Fire a Disaster",
    prompt:
      "Select a spare **Creator** in your hand and tap **Disaster**. It wipes every Animal of that type from your rivals' boards — and those Animals come to you.",
    confirm: "That's the biggest swing in the game.",
    target: "hand",
    scaffold: "full",
    want: "creator",
    optional: true,
    done: gained("disasters"),
    allow: only(["play_disaster", "resolve_disaster"], "Select a Creator card, then tap the Disaster button."),
    fallback: "No spare Creator to fire this time. A Disaster wipes every matching Animal from your rivals and hands them to you.",
  },
  {
    id: "disaster-aftermath",
    type: "ack",
    topicId: "disasters",
    title: "Look what it did",
    prompt:
      "Check your rival's board — the matching Animals are gone from it. If a rival holds the Golden Hive they can block one Disaster; that's the only defence.",
    confirm: "",
    target: "opponent",
    scaffold: "medium",
  },
  {
    id: "sky-steal",
    type: "do",
    topicId: "sky-steal",
    title: "Sky Creature — steal an Animal",
    prompt:
      "A **Sky Creature** can be placed like a normal Animal, or spent as a **Stealer**. Three taps: open your rival's board (**the dots at the top on a phone**), tap the Animal you want, then tap a hex on your own board.",
    confirm: "Stolen Animals land on your board — that's two boards changed in one move.",
    target: "hand",
    scaffold: "full",
    want: "sky_creature",
    optional: true,
    done: gained("steals"),
    allow: only(["play_sky_steal"], "Select the Sky Creature, tap Steal, then pick an Animal on your rival's board."),
    fallback: "No Sky Creature turned up. Spend one as a Stealer to take an Animal straight out of a rival's ecosystem.",
  },
  {
    id: "quiz",
    type: "ack",
    topicId: "quiz",
    title: "Quiz bonuses",
    prompt:
      "Quizzes run in matches against other players — not in bot practice, so you won't see one here. In a live match, playing a Creator can unlock a pulsing **Quiz badge** (there's a limit per match). It wakes up once your own actions are done, so it can never eat your turn clock, and stays tappable through your rivals' turns. Each set of correct answers adds bonus points.",
    confirm: "",
    target: "quiz",
    scaffold: "medium",
  },
  {
    id: "winning",
    type: "ack",
    topicId: "winning",
    title: "How you actually win",
    prompt:
      "**16 cards**: 4 Creators covering all four elements, 12 Animals with 3 touching each Creator — and **no Creator cards left in your hand**. The moment that's true, the game ends.",
    confirm: "",
    target: "board",
    scaffold: "medium",
    progress: (n) => `Your board: ${n.myPlaced} of 16 · Creators ${n.myCreatorsDown} of 4`,
  },
  {
    id: "fly-solo",
    type: "ack",
    title: "Over to you",
    prompt:
      "That's the whole game. Finish this match on your own — I'll get out of the way. The **Rule Book** in the header is there whenever you want it.",
    confirm: "",
    target: "none",
    scaffold: "light",
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
  golden_hive: "golden_hive",
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
