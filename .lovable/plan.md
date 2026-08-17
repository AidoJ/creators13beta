# Learn & Rules: intro panel + restructured Rule Book

Goal: players can reach rules and learning material **before** a match, not just from a small icon mid-game, and get content matched to their experience level.

Canonical fact confirmed: **3 Creator Types per element** — Fire (Lava, Fire, Sun), Air (Whirlwind, Lightning, Snow), Water (Lake, Ocean, River), Earth (Tree, Mountain, Soil), plus **Sky** as the wildcard = 13.

## 1. Single content source

All rules/learning text moves into one data module with typed topics:

- Elements & the 13 Creators
- Reading a card (halves, glyphs, descriptor flip)
- Placement & adjacency
- Your turn (draw 2, play 2, discard)
- Disasters
- Sky Creator & stealing
- Golden Body & Golden Hive
- The Quiz & bonus points
- Winning & scoring
- Strategy tips (experienced tier)

Each topic: id, title, one-line summary, body blocks, audience tag (`new` / `refresher` / `tips`). The intro panel, the Rule Book sheet and the first-run tutorial all render from this module, so A'Hara's rule edits land in one place.

## 2. Intro panel ("How to play")

New component with the three doors:

- **I'm new** — guided walkthrough of the `new` topics in order, ending with a "Play a practice match vs a bot" button.
- **Refresher** — topic grid; tap a topic, read just that one, back to grid.
- **Tips** — strategy cards for experienced players.

Behaviour:
- Auto-opens **once** on first ever visit to `/play` (localStorage flag, versioned so we can re-show after major rule changes).
- Remembers the last door chosen, so returning players land on Refresher.
- Fully dismissible; never auto-opens again.

## 3. Entry points

Permanent **How to play** button added at the three moments people want it:

- `/play` (Play dashboard) — prominent.
- Lobby — secondary button while waiting.
- Match-over dialog — "Brush up before the next game".
- In-match help icon stays exactly as-is, but now opens the restructured Rule Book.

## 4. Rule Book restructure

`RuleBookSheet` becomes a topic grid instead of one long scroll: tap a topic to open it, breadcrumb back. Same sheet, same trigger, driven by the shared content module. Content gets the currently-missing detail: element grouping, steal rules (who/when), Golden Body wildcard vs Golden Hive shield, quiz bonus maths.

## 5. Tutorial overlay

The existing 6-slide overlay is retired in favour of the intro panel's "I'm new" path (same first-run trigger, richer content). `show_tutorial_overlay` in game settings now controls whether the intro panel auto-opens, so A'Hara keeps the on/off lever.

## Out of scope for this batch

- Animated/interactive mini-board demos (Layer 2 from the earlier brainstorm).
- Admin editing of rules content from the dashboard — content stays in code for now.
- Video or voiceover.

## Technical notes

- New: `src/lib/game/learnContent.ts`, `src/components/game/LearnPanel.tsx`.
- Modified: `RuleBookSheet.tsx`, `PlayDashboard.tsx`, `Lobby.tsx`, `MatchOverDialog.tsx`, `Play.tsx`.
- Removed: `TutorialOverlay.tsx` (its trigger logic moves into `LearnPanel`).
- Presentation only — no engine, database, or edge function changes.
- Mobile-first: sheet on phones, dialog on desktop; 44px tap targets; tested against iPhone and Galaxy S24 widths.
