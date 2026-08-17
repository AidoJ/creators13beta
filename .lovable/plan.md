# Learn to Play: coached first match + rules reference

Two surfaces, one content source. The coached match is the priority; the reference is a straightforward render of the same data.

Canonical framing confirmed against the engine (`src/lib/game/elements.ts`): **3 Creator Types per element × 4 elements + Sky wildcard = 13** — Fire (Lava, Fire, Sun), Air (Whirlwind, Lightning, Snow), Water (Lake, Ocean, River), Earth (Tree, Mountain, Soil), Sky (wildcard). Content will state this exactly.

---

## Report: the three questions you asked

### (a) Can practice/bot mode host a coaching overlay? Yes — cleanly.

Practice mode (`/play/new?practice=1`) runs the **real engine locally in the browser**, no server round-trip. Two properties make a coaching layer cheap:

1. **Every player action funnels through one function** — `guarded(fn, move)` in `Play.tsx`. It already receives a typed `move` descriptor (`pickup_from_draw`, `place_card`, `discard`, `disaster`, `steal`, `rotate_hex`, …) and the resulting state. That is the single hook point: the coach subscribes to "a move of type X just succeeded" without touching any game logic.
2. **The deck is built and shuffled client-side** before `initMatch`, so the coached match can be dealt from a **stacked deck** — guaranteeing the player is holding the cards each lesson needs (a placeable animal early, a Creator for the disaster lesson, a Sky Creature for the steal lesson) instead of hoping RNG cooperates.

What's needed, and it's all additive presentation code:
- A `useCoach` hook holding the script position, driven by the `guarded` callback plus state snapshots.
- A coach bar component (bottom sheet on phones, side card on desktop) with the current prompt, a progress dot row, and Skip.
- A **spotlight** mechanism: the coach names a target (deck, a hand card, valid hexes, the quiz badge) and the existing highlight props already on `Ecosystem`/`PlayerHand` (`highlight_valid_placements`, `stuckUids`) are driven from it. No new highlight system.
- Bot difficulty forced to easy and bot think-time slightly raised during the coached match so prompts are readable.

Explicitly NOT built: a separate tutorial engine. The coached match is the real game with a script watching it.

### (b) Proposed guided-move sequence

Each step: prompt → wait for that specific action → confirm ("see how the sides connected?") → advance. Scaffolding fades as listed.

| # | Lesson | Player does | Guidance level |
|---|---|---|---|
| 1 | Welcome / the goal in one line | Tap Start | Full |
| 2 | Draw | Taps the deck twice | Full — deck spotlit, everything else dimmed |
| 3 | Read a card | Taps ⓘ on the card just drawn | Full — points at the halves, glyph, descriptor flip |
| 4 | Elements & the 13 | Reads a compact 4-column panel + Sky | Full (the one read-only step) |
| 5 | First placement & adjacency | Places the animal on a valid hex | Full — valid hexes pulse, invalid dimmed; confirm explains the shared type |
| 6 | Second action & discard | Places or discards to complete "play 2" | Medium — no pulsing, prompt only |
| 7 | Rotate / reposition (free actions) | Rotates a placed hex | Light — offered, skippable |
| 8 | Quiz | Answers one quiz question via the badge | Medium — badge spotlit once |
| 9 | Disaster | Plays a Creator as a Disaster (deck-stacked so all 4 Creators are down) | Medium — explains what it wipes and where the animals land |
| 10 | Sky & stealing | Plays one Sky Creature steal | Medium |
| 11 | Golden Body / Golden Hive | Meets whichever appears; Hive explained when a Disaster targets them | Light, contextual |
| 12 | Winning | Prompt recaps 16 cards / 4 Creators / no Creators in hand | Light |
| 13 | Fly solo | Coach retires to a small "Tips" pill; player finishes the match unaided | None |

If a lesson's trigger can't happen (no Sky Creature reachable, no Disaster legal), the coach **teaches it as a one-card explainer and moves on** rather than stalling — a stacked deck makes this rare but it must never hang.

### (c) Off-script taps — how they're handled

Design rule: **the coach never blocks the engine.** Every legal move stays legal at all times; the coach only observes.

- **Wrong-but-legal action** (places when the prompt said draw): the move goes through normally, the coach shows a gentle redirect ("Nice — we'll come back to placing. Draw first: tap the deck") and stays on the step.
- **Action that satisfies a later step**: the coach marks that step complete and skips it rather than re-teaching it.
- **Illegal move**: the engine's existing toast fires unchanged; the coach adds one plain-English line about why.
- **Idle / lost**: after ~20s of no action on a step the prompt escalates to a stronger hint and re-pulses the target.
- **Stuck-state escape hatch**: a "Show me" link performs nothing automatic but re-spotlights the exact target; "Skip this bit" advances one step; "Exit coaching" drops to free play instantly and the match continues as a normal practice game.
- Coach state lives in `sessionStorage` so a mid-match reload resumes at the same step.

---

## Build scope

### 1. Shared content module (first)
`src/lib/game/learnContent.ts` — typed topics: id, title, one-line summary, body blocks, audience tag (`new` / `refresher` / `tips`). Covers elements & the 13 Creators, reading a card, placement & adjacency, the turn, disasters, Sky Creator & stealing, Golden Body & Golden Hive, quiz & bonus points, winning & scoring, strategy tips. Coach prompts reference topic ids so a rule edit updates both surfaces.

### 2. Coached first match (priority)
- `src/lib/game/coachScript.ts` — the step list: id, topic ref, prompt copy, target, completion predicate, fallback.
- `src/hooks/useCoach.ts` — script position, completion detection off `guarded`, redirect logic, sessionStorage persistence.
- `src/components/game/CoachBar.tsx` + spotlight styling.
- `Play.tsx` — mount the coach when `?coach=1`, feed it moves, drive existing highlight props. Coached deck stacking behind the same flag.
- Auto-offered to players with no completed practice game (`player_progress.practice_games_played = 0`); always skippable.

### 3. Rules reference
- `LearnPanel.tsx` — three doors: **I'm new** (launches the coached match), **Refresher** (topic grid), **Tips** (strategy cards).
- `RuleBookSheet.tsx` reworked to a topic grid with breadcrumb, rendering the content module (same in-match help icon).
- Permanent "How to play" entry points: Play dashboard, Lobby, match-over dialog.
- Versioned first-visit flag so the panel re-shows after major rule changes; `show_tutorial_overlay` keeps A'Hara's on/off lever.
- Retire the 6-slide `TutorialOverlay`.

## Out of scope
Animated/simulated mini-boards outside the real game; admin-editable rules content; video/voiceover; any engine, database or edge function change.

## Verification
Typecheck + full test suite; coached run-through on iPhone and Galaxy S24 widths and on iPad; deliberate off-script taps at every step to confirm nothing strands.
