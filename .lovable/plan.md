# Coaching v2 — full step plan, off-script handling, content/mechanics split

All four confirmations up front:

1. **Constrain-don't-correct on every step** — enforced by one shared mechanism, not per-step handwriting (detail below).
2. **The bot's plays are scripted, not improvised** — a scripted move list feeds the real engine during the coached match.
3. **Skip / collapse / exit available on every step**, plus "I've done this — free play" for returning players.
4. **Real engine, scripted inputs only.** Deck order and bot moves are inputs; no engine branch, no `if (coached)` inside rules.

---

## Off-script handling — by step *type*, not per step

Every step declares a `gate` (what's allowed) and a `done` predicate over the live turn snapshot. Four step types cover all 26:

| Type | Allowed while live | Anything else | Wrongly advance? |
|---|---|---|---|
| **ACK** (read-only) | Tap "Got it". Board stays fully playable | Nothing to get wrong; a legal move is absorbed silently and re-narrated | No — `done` is the tap |
| **DO** (player action) | The taught action's targets stay lit; all other legal moves stay legal | Move goes through, coach shows a one-line nudge ("that's legal — we'll get to it; right now: tap the Draw Pile") and stays put | No — `done` is a snapshot predicate (e.g. `actionsUsed >= 2`), so an unrelated move can't satisfy it |
| **WATCH** (bot turn) | No player action required; Next appears when the bot's scripted move lands | Player pokes their own board (rotate/reposition are legal off-turn) — allowed, no nudge | No |
| **CHOOSE** (optional mechanic) | The taught action, or Skip | Any other move → step self-skips forward rather than nagging | No |

Hard rules that make 26 steps safe:
- **The look-ahead auto-complete is deleted.** Today a first placement silently ticks off the "second card" lesson — that bug is exactly why steps vanish. Lessons are only completed by being lived.
- **`done` is a predicate over state**, never a move-event count, so a duplicate/replayed event can't double-advance.
- **Nudges are rate-limited** (one per 4s) and never modal.
- **Nothing stalls**: every DO step has a 25s escalation, a "Show me" re-spotlight, and Skip. If a required card is unreachable the step degrades to an explainer and advances itself.
- **Illegal moves** keep the engine's own toast; the coach adds a plain-English reason.

## The 26 steps

**Round 1 — heavily coached (bot's turn scripted end to end)**
1. Welcome + goal (ACK)
2. Draw 5 opening hand (DO · deck)
3. Read a card: halves, glyph, ⓘ flip (ACK)
4. The 13 Creators, 4 elements + Sky wildcard (ACK)
5. Where everything lives: your board, hand, Draw/Used piles (ACK, spotlight tour)
6. Where the *opponents* live: rail on desktop, **dots at the top on mobile** (ACK, spotlights the dots)
7. Place card 1 — anchor, goes anywhere (DO · board)
8. "Action 1 of 2 used — one left" (DO · place or discard, live counter)
9. Turn over → **watch the bot draw** (WATCH)
10. **Watch the bot place a matching card** — narration names the shared colour the scripted move used (WATCH)

**Round 2 — the turn rhythm**
11. Pick up 2 — Draw pile, Used pile, or one of each; live 1-of-2 counter (DO)
12. Adjacency for real: valid hexes pulse, "one shared Creator Type is enough" (DO · board)
13. Discard as your second action — the escape hatch (DO · Used pile)
14. Free actions: rotate a placed hex 60° (CHOOSE)
15. Free actions: reposition a placed hex (CHOOSE)
16. Watch the bot's second turn — read its board without narration (WATCH)

**Round 3 — the live mechanics, each actually played**
17. Hand limit and what "no legal play" looks like (muted cards) (ACK)
18. **Golden Body** dealt → place it against a hex it shares nothing with (DO)
19. **Golden Hive** dealt → can't be placed or discarded; it sits and waits (ACK)
20. Get your 4th Creator down — coverage check, live "Creators 4/4" readout (DO)
21. **Disaster**: fire a spare Creator (DO · hand → Disaster button)
22. Disaster aftermath — point at the rail: those Animals left the bot's board and landed on yours (ACK)
23. **Sky Creature steal**, taught as its three taps: open the bot's board (dots on mobile) → pick an Animal → pick your hex (DO)
24. Golden Hive in action — narrated when a Disaster is blocked, else explained (CHOOSE)
25. Quizzes: not in bot practice; in live matches the badge wakes once your actions are done, limit per match, bonus per correct set (ACK)
26. Winning: 4 Creators / 12 Animals / no Creators in hand — with a live readout of your own board — then "over to you" (ACK)

Steps 18–24 depend on the scripted deck dealing the right card at the right time; each also has a text-only fallback.

## Scripted bot

`coachBotScript.ts` holds an ordered list of bot moves for the coached match (draw source, card, target hex, rotation). During a coached practice match the bot's move provider returns the next scripted move instead of calling the bot AI; the move is then applied through the **normal engine path**, so it obeys every rule. If a scripted move is somehow illegal against the live state (defensive case), it falls back to the live bot AI and the coach switches that WATCH step to generic narration. Bot think-time is slowed while coached so the play is readable.

## Content editable by A'Hara / mechanics fixed in code

**Editable (content):** per step — title, prompt, success message, optional extra tip, and the "Tell me more" topic link label. Stored in a new `coach_step_content` table keyed by `step_id` (public read, admin write), fetched at match start with the in-code copy as the fallback, so the tutorial always works even before anything is edited.

**Not editable (mechanics), fixed in code:** the step list and its order, what action each step waits for (`done`), the gate/spotlight/constrain logic, what the deck deals, and what the bot does.

**Admin panel** (new tab beside the Quiz Bank): a list of the 26 steps with a read-only mechanics summary ("waits for: two actions used"), editable text fields, live preview rendered in the real CoachBar, and Reset-to-default per step. Guardrails: no add, no delete, no reorder; title/prompt/success required and non-empty; length caps so the bar can't overflow on a phone; save is per-step and validated server-side too.

## Technical notes

- New: `src/lib/game/coachBotScript.ts`, `src/components/admin/CoachContentPanel.tsx`, `src/hooks/useCoachContent.ts`, migration for `coach_step_content` (+ GRANTs, RLS: read for all, write admin-only).
- Rewritten: `coachScript.ts` (26 steps, `gate`/`done`/`type`), `useCoach.ts` (snapshot-driven, look-ahead removed, live counters, per-step skip/exit), `CoachBar.tsx` (counter line, WATCH state, "free play" exit).
- `Play.tsx`: builds the turn snapshot, adds `opponent-rail` / `opponent-dots` spotlight zones, routes the bot through the scripted provider, slows coached bot think-time.
- No engine, rules, or edge-function change. Practice-only.

## Verification

Typecheck + tests, then a full 26-step run on desktop, iPhone and Galaxy S24 widths; a deliberate off-script tap at every DO step to confirm nothing strands or wrongly advances; an admin content edit round-trip with preview and empty-field rejection.
