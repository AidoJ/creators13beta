/**
 * SHARED LEARNING CONTENT — single source of truth for everything the game
 * teaches. Both surfaces render from this file:
 *
 *   1. The coached first match (`coachScript.ts` → CoachBar) references topics
 *      by id, so a rule change here changes what the coach says.
 *   2. The Rule Book / "How to play" panel renders these topics directly.
 *
 * ── EDITING GUIDE (A'Hara) ────────────────────────────────────────────────
 * Everything below is plain English text. To change wording, edit the strings
 * — nothing else needs touching.
 *
 *   title      short topic name shown on the topic card
 *   summary    one line shown under the title in the grid
 *   audiences  who sees it: "new" (first game), "refresher", "tips"
 *   blocks     the body, in order. Three kinds:
 *                { kind: "text",    text: "A paragraph." }
 *                { kind: "bullets", items: ["Point one.", "Point two."] }
 *                { kind: "note",    text: "A smaller aside." }
 *
 * Wrap words in **double asterisks** to bold them.
 * Keep sentences short — most players read this on a phone.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type LearnAudience = "new" | "refresher" | "tips";

export type LearnBlock =
  | { kind: "text"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "note"; text: string };

export interface LearnTopic {
  id: string;
  title: string;
  summary: string;
  audiences: LearnAudience[];
  blocks: LearnBlock[];
}

export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: "goal",
    title: "The goal",
    summary: "Build an ecosystem of 16 cards before anyone else.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "You are building your own honeycomb **ecosystem** of **16 cards**: **4 Creators** — one for each element (Earth, Fire, Air, Water) — plus **12 Animals**, 3 matching each Creator.",
      },
      {
        kind: "bullets",
        items: [
          "Each Animal must be **touching** the Creator it counts for.",
          "You must have **no Creator cards left in your hand** when you reach 16.",
          "A **Sky Creator** can stand in for any element. A **Golden Body** counts as any Animal.",
        ],
      },
      {
        kind: "note",
        text: "Ages 8–80+ · 2–4 players · 13Creators presents.",
      },
    ],
  },
  {
    id: "elements",
    title: "Elements & the 13 Creators",
    summary: "3 Creator Types per element, plus Sky as the wildcard.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "There are **13 Creator Types**. Twelve of them sit under one of the four elements — **3 per element** — and **Sky** stands apart as the wildcard.",
      },
      {
        kind: "bullets",
        items: [
          "**Fire** — Lava, Fire, Sun",
          "**Air** — Whirlwind, Lightning, Snow",
          "**Water** — Lake, Ocean, River",
          "**Earth** — Tree, Mountain, Soil",
          "**Sky** — the wildcard, standing in for any element",
        ],
      },
      {
        kind: "text",
        text: "Your ecosystem needs one Creator from each of the four elements. It does not matter which of the three types you use — a Lava Creator and a Sun Creator both cover Fire.",
      },
    ],
  },
  {
    id: "reading-a-card",
    title: "Reading a card",
    summary: "Colours, glyphs and the info flip.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "Every card is a hexagon split into coloured halves. Each colour is a **Creator Type**, and each type has its own glyph.",
      },
      {
        kind: "bullets",
        items: [
          "**Animals** belong to 1 or 2 Creator Types — two colours means the animal counts for either one.",
          "**Creator cards** show their element and their Creator Type.",
          "Tap the **ⓘ** on any card to flip it and read its descriptor.",
        ],
      },
      {
        kind: "note",
        text: "The colours are what matter when you place — matching halves are how cards connect.",
      },
    ],
  },
  {
    id: "the-turn",
    title: "Your turn: draw 2, play 2",
    summary: "Every turn has exactly two halves.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "On your very first turn you take an opening hand of **5 cards**. After that, every turn is the same shape:",
      },
      {
        kind: "bullets",
        items: [
          "**Pick up 2** — any mix of the Draw Pile and the top of the Used Pile.",
          "**Play 2** — each action is either placing a card on the board, discarding a card to the Used Pile, playing a Disaster, playing a Sky Creature steal, or spending a Hive to block a Disaster.",
        ],
      },
      {
        kind: "text",
        text: "You must take both actions — you cannot end your turn early. **Discarding always counts** as one of your two, so you are never stuck.",
      },
      {
        kind: "note",
        text: "Your hand caps at 5 cards at the end of a turn. Cards with no legal board play show muted — discard is your move for those.",
      },
    ],
  },
  {
    id: "placement",
    title: "Placing & adjacency",
    summary: "One matching neighbour is all you need.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "Your first card goes on the centre hex. Every card after that must go on an empty hex **touching your ecosystem**, and the rule is simple:",
      },
      {
        kind: "text",
        text: "**At least one neighbour must share a Creator Type with the card you are placing.** Only one side has to match. Non-matching neighbours are ignored — they never block you.",
      },
      {
        kind: "bullets",
        items: [
          "**Creators are anchors** — they may always sit beside other Creators and never block an incoming Animal.",
          "A **Sky Creator** is a wildcard element, but to place it you must still touch another Creator or a Sky-type card.",
          "A **Golden Body** matches anything.",
          "An Animal only counts toward the win once it is **touching** the Creator it belongs to.",
        ],
      },
      {
        kind: "note",
        text: "Free actions, any time: rotate a placed hex (+60°) to line colours up, or move one of your placed cards to another legal empty hex. Cards can move, but never leave the board.",
      },
    ],
  },
  {
    id: "disasters",
    title: "Disasters",
    summary: "Turn a spare Creator into a raid on your rivals.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "Once **all 4 of your own Creators are on the board**, any further Creator card in your hand can be played as a **Disaster** instead of being placed.",
      },
      {
        kind: "bullets",
        items: [
          "It wipes **every Animal matching that Creator's element** from your rivals' ecosystems.",
          "Those Animals land **straight onto your board** — never into your hand.",
          "A rival holding a **Golden Hive** can spend it to absorb the Disaster completely.",
          "The Creator card goes to the top of the Used Pile, where anyone can pick it up.",
        ],
      },
      {
        kind: "note",
        text: "A Sky Creator played as a Disaster only wipes Sky Mystical Creatures.",
      },
    ],
  },
  {
    id: "sky-steal",
    title: "Sky Creatures & stealing",
    summary: "Play them as an Animal, or spend them to steal.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "**Sky Creature** cards (the mythicals — Dragon, Griffin, Unicorn and friends) give you a choice each time you hold one:",
      },
      {
        kind: "bullets",
        items: [
          "**Place it as an Animal** — it counts toward any Creator it shares a type with.",
          "**Play it as a Stealer** — discard it to the Used Pile and take one Animal from **any opponent's** ecosystem into your hand.",
        ],
      },
      {
        kind: "note",
        text: "A Stealer that has been spent sits in the Used Pile and cannot be picked back up.",
      },
    ],
  },
  {
    id: "golden-cards",
    title: "Golden Body & Golden Hive",
    summary: "One is a wildcard Animal, one is a shield.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "Two golden cards behave differently to everything else in the deck.",
      },
      {
        kind: "bullets",
        items: [
          "**Golden Body** — a wildcard Animal. It matches any neighbour and counts toward any Creator.",
          "**Golden Hive** — cannot be placed and cannot be discarded. It sits in your hand until a Disaster is aimed at you, and you choose whether to spend it to block. Once spent it is gone for good.",
        ],
      },
    ],
  },
  {
    id: "quiz",
    title: "The quiz & bonus points",
    summary: "Answer questions about Creator Types for extra points.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "Every time you play a Creator card, a pulsing **Quiz badge** appears. Tap it to answer a short question about that Creator Type.",
      },
      {
        kind: "bullets",
        items: [
          "Correct answers earn **bonus points** on top of your match score.",
          "Bonuses come in tiers — every set number of correct answers awards another bonus.",
          "You can skip a quiz and keep playing, but you'll miss the bonus.",
        ],
      },
      {
        kind: "note",
        text: "Question count, tier size and bonus size are all set by the game admin, so the exact numbers show on the badge itself.",
      },
    ],
  },
  {
    id: "winning",
    title: "Winning & scoring",
    summary: "Three game types, three ways a match ends.",
    audiences: ["new", "refresher"],
    blocks: [
      {
        kind: "text",
        text: "**End of Days** — the classic. The match ends the moment someone assembles a valid 16-card ecosystem with no Creators left in hand. If both piles empty first, the match is a draw.",
      },
      {
        kind: "text",
        text: "**Top Score** — first to the target score (default 50) wins, or complete your ecosystem first, whichever comes sooner.",
      },
      {
        kind: "text",
        text: "**Beat the Clock** — a match timer and a per-turn timer. Highest score when the clock runs out, unless someone completes an ecosystem first.",
      },
      {
        kind: "note",
        text: "Score = 2 points per placed card, plus engine bonuses like Disaster wipes, plus your quiz bonuses.",
      },
    ],
  },
  {
    id: "tips-openings",
    title: "Tip: open with your Creators",
    summary: "Get all four elements down early.",
    audiences: ["tips"],
    blocks: [
      {
        kind: "text",
        text: "Creators may always sit beside other Creators, so they are the easiest cards to place. Getting all four down early does three things at once:",
      },
      {
        kind: "bullets",
        items: [
          "It unlocks **Disasters** — you can't play one until your own four are on the board.",
          "It gives every future Animal a matching neighbour to hook onto.",
          "It clears Creators out of your hand, which you must do anyway to win.",
        ],
      },
    ],
  },
  {
    id: "tips-shape",
    title: "Tip: mind your board shape",
    summary: "Keep open edges next to the right colours.",
    audiences: ["tips"],
    blocks: [
      {
        kind: "bullets",
        items: [
          "Rotating a hex is **free** — use it to expose the colour you need on an open edge.",
          "Spread your Creators out rather than clustering them, so each one has room for its 3 Animals.",
          "Two-colour Animals are your flexible glue — save them for awkward gaps.",
          "Remember you can **move** a placed card to another legal hex. A cramped board is fixable.",
        ],
      },
    ],
  },
  {
    id: "tips-timing",
    title: "Tip: timing your specials",
    summary: "When to fire a Disaster, steal, or spend the Hive.",
    audiences: ["tips"],
    blocks: [
      {
        kind: "bullets",
        items: [
          "Hold a Disaster until a rival has **several** matching Animals down — the wiped cards come to you.",
          "Watch the Used Pile: the Creator you discard is the Creator your opponent might pick up.",
          "Don't spend the **Golden Hive** on a Disaster that would only cost you one Animal. There is exactly one Hive in the whole deck.",
          "A **Sky Creature** is worth more as a steal when your opponent is one Animal from finishing.",
          "Answer quizzes as they come — the bonus points break ties in Top Score and Beat the Clock.",
        ],
      },
    ],
  },
];

export function topicById(id: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.id === id);
}

export function topicsFor(audience: LearnAudience): LearnTopic[] {
  return LEARN_TOPICS.filter((t) => t.audiences.includes(audience));
}

/** Renders **bold** markers into React-friendly segments. */
export function parseBold(text: string): Array<{ bold: boolean; text: string }> {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((chunk) =>
    chunk.startsWith("**") && chunk.endsWith("**")
      ? { bold: true, text: chunk.slice(2, -2) }
      : { bold: false, text: chunk },
  );
}
