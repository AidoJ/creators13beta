# Coaching v2 — a turn-by-turn instructor, not a checklist

## What's wrong today (from reading the code, not guessing)

The coach is a **list of 15 lessons advanced by move events**. Three consequences produce exactly what you saw:

1. **The "play your second card" prompt gets silently deleted.** In `useCoach.notifyMove`, after any move the hook scans *later* steps and marks any whose `completedBy` includes that move type as already done. Placing your first card therefore ticks off `place-adjacent` before it's ever taught. The lesson you expected ("now your second card") is skipped, not shown.
2. **The coach has no idea where you are in the turn.** It only receives a move *type* string. It never sees actions used (1 of 2), whose turn it is, or that the turn just ended. So it cannot say "one action left", "your turn is over", or "the bot is playing now".
3. **The bot doesn't exist in the script.** No step mentions the opponent rail (desktop) or the peek dots (mobile), so a new player never learns to read anyone else's ecosystem — which is also why Disaster and Steal feel abstract.

Plus: Disaster, Steal, Rotate and Golden are `optional` or `ack`-only, so on most runs they're read-about, never done.

## The change in one line

Stop advancing on move events alone. Feed the coach a **turn snapshot** every render (whose turn, phase, actions used/remaining, hand contents, board counts) and let each lesson declare a **predicate over that snapshot**. Lessons then match the actual rhythm of a turn and can never be pre-ticked out of existence.

---

## 1. Snapshot-driven coach core

`useCoach` gains a `snapshot` argument from `Play.tsx`:

```
{ isMyTurn, phase, actionsUsed, actionsMax, cardsPickedThisTurn,
  handKinds, myPlacedCount, myCreatorsDown, oppPlacedCount, turnNumber }
```

- A step completes when its `done(snapshot, lastMove)` returns true — so "second action" is `actionsUsed >= 2`, regardless of place/discard mix, and cannot be satisfied early.
- Remove the "mark later steps complete" look-ahead entirely. A lesson is only completed by being lived.
- Add `waitFor: "my-turn" | "opponent-turn" | "any"` so a step can hold quietly until the right moment instead of nagging.
- Live counters in the bar: **"Action 1 of 2 used"**, **"2 cards to pick up — 1 done"**.

## 2. The full turn cycle is taught, twice

Script restructured around **coached turns** rather than isolated topics:

**Turn 1 (heavy scaffolding)**
1. Draw 5 — opening hand
2. Read a card (ⓘ flip, halves, glyph)
3. The 13 Creators / 4 elements + Sky wildcard
4. Place card 1 — anywhere (anchor)
5. **Action 1 of 2 done → "one action left. Place a second card, or discard one."** — holds until `actionsUsed === 2`
6. **"Your turn's over — watch the bot."** Spotlights the opponent rail on desktop; on mobile explicitly says *tap the dots at the top to open the bot's ecosystem*, and waits for the panel to be opened (or Next). Bot think-time slowed while coached.
7. Bot's move narrated: "the bot placed a card — see the colour it matched."

**Turn 2 (medium)**
8. Pick up 2 (Draw or Used pile), with a live 1-of-2 counter
9. Adjacency taught for real: valid hexes pulse, "at least one neighbour must share a Creator Type"
10. Second action → discard onto the Used Pile (taught as the escape hatch)
11. Rotate/reposition as free actions — still offered, but now shown as part of the turn, not a footnote

**Turns 3+ (contextual, light)** — the coach stops narrating every beat and only fires when a teachable card is in hand.

## 3. The special mechanics get *played*, not just read

The draw pile is already deterministically stackable (`stackForWant`). Extend it so each of these is guaranteed reachable, and each becomes a real do-it step with a worked example:

- **Golden Body** — stacked into hand; step: "place it against a hex that shares nothing — it matches anything."
- **Golden Hive** — stacked; explained as unplayable/undiscardable, and the coach waits for the Hive prompt when a Disaster hits you, narrating the block.
- **Disaster** — coach first ensures all 4 of your Creators are down (stacking Creators as needed), then prompts the Disaster, and *after* it fires points at the opponent rail: "those Animals just left the bot's board and landed on yours."
- **Sky Creature steal** — stacked; on mobile the coach first tells you to open the bot's board via the dots, then pick the animal, then pick your own hex. Currently this is one prompt for a three-tap flow.
- **Quiz** — copy stays accurate (not in bot practice), but the badge is spotlit and the muting rule is explained: it wakes up once your actions are done.
- **Winning** — recap plus a live readout of your own board against the target (Creators 2/4, Animals 5/12).

If a stacked card genuinely can't arrive (deck exhausted), the step degrades to a one-card explainer and moves on — never a stall.

## 4. Off-script handling, unchanged in spirit, better in words

Still constrain-don't-correct: every legal move stays legal. But redirects become snapshot-aware — "you've used both actions, the turn's ending" instead of a generic "place or discard one more card".

## Technical notes

- `src/lib/game/coachScript.ts` — steps gain `done(snapshot, move)`, `waitFor`, `narrate`; step list rewritten to the turn-cycle order above; `stackForWant` extended with `golden_body`, `golden_hive`, `creator_set`.
- `src/hooks/useCoach.ts` — snapshot prop, predicate evaluation, look-ahead completion removed, per-step live counters exposed.
- `src/pages/Play.tsx` — build and pass the snapshot; add `opponent` / `opponent-dots` to the spotlight zones; slow bot think-time while coached.
- `src/components/game/CoachBar.tsx` — counter line and bot-turn ("watching") state.
- `src/lib/game/learnContent.ts` — Golden Hive block, Sky steal step-by-step, quiz muting rule.
- No engine, database or edge-function change. Practice-only; live matches untouched.

## Verification

Typecheck + test suite, then a full coached run on desktop and at iPhone/Galaxy S24 widths: confirm the second-action prompt appears every turn, the bot-turn step fires, and Disaster, Steal, Golden Body and Golden Hive are each actually performed once.
