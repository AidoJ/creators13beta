# Quiz bonuses, caps, and mastery dashboards

## 1. Admin-tunable rules (Game Settings)

Two new controls on the Admin → Game Settings panel:

- **Questions per match**: 4, 8, or 12 (max questions the game will serve any single player).
- **Bonus points per 4 correct**: 1–5 (points added to match score each time a player accumulates another 4 correct answers).

Example: `Questions per match = 8`, `Bonus = 2` ⇒ a player who gets 8/8 correct earns +4 bonus points (2 at the 4-correct mark, 2 more at 8-correct).

## 2. Bonus accrual becomes tiered / repeating

Server-side change to `submit_quiz_answer`:

- Track `bonus_points_awarded` (integer) instead of a single `bonus_awarded` flag.
- Each time `correct_count` crosses a multiple of 4 (4, 8, 12…), add another `bonus_points` to the player's ledger.
- Stop offering new questions once `correct_count + wrong_count` reaches `questions_per_match`.

Match finalisation (`apply-move`) reads `bonus_points_awarded` and adds it to the winner/finisher's score, instead of the current one-shot flag.

## 3. Player Dashboard – new "Game & Quiz" card

Shows for the signed-in player, lifetime across all matches:

- **Wins** (from `game_matches` where they are the winner).
- **Quiz bonus points earned** (sum of `bonus_points_awarded`).
- **Questions answered** (correct + wrong).
- **Overall accuracy** (%).
- **Mastery by Creator Type** — one row per of the 13 types in canonical order, showing `correct ÷ answered` as a % and a coloured bar in that Creator's palette colour.

Types with zero answered show a muted "—".

## 4. Admin per-user view

On the Admin → Users page, each user's detail drawer/panel gets the same "Game & Quiz" card, powered by a security-definer RPC `get_player_quiz_stats(_user_id)` so admins can read any user's numbers without loosening RLS on `quiz_player_mastery`.

## Technical details

**Migration:**

- `ALTER TABLE game_settings ADD COLUMN quiz_questions_per_match int NOT NULL DEFAULT 4 CHECK (quiz_questions_per_match IN (4,8,12))`.
- Widen `quiz_bonus_points` CHECK to `BETWEEN 1 AND 5` (already in place).
- `ALTER TABLE quiz_match_progress ADD COLUMN bonus_points_awarded int NOT NULL DEFAULT 0`.
- Rewrite `submit_quiz_answer` to award tiered bonuses and refuse to answer past the cap.
- Update `open_quiz_if_needed` to no-op once `correct + wrong >= questions_per_match`.
- New RPC `get_player_quiz_stats(_user_id uuid)` returning JSONB `{ wins, bonus_points, correct, wrong, accuracy, by_type: [{ type, correct, wrong, pct }] }`. Callable by the user themselves or by any user with the `admin` role via `has_role`.

**Frontend:**

- `src/lib/game/settings.ts` — add `quiz_questions_per_match`, extend defaults.
- `src/components/admin/GameSettingsPanel.tsx` — add the two selects under a "Creator Quiz" subsection (or extend if already present).
- `src/hooks/useQuizProgress.ts` — surface `bonus_points_awarded` and `questions_per_match`, hide the question card once cap reached.
- `src/components/game/QuizBadge.tsx` — show `correct/total` and running bonus.
- `src/components/dashboard/QuizStatsCard.tsx` — new component using `get_player_quiz_stats` RPC; used on both player dashboard and admin per-user drawer.

**Data left in place:** `quiz_bonus_threshold` column is deprecated but retained (defaults to 4) to keep existing rows valid; new logic uses fixed block size of 4 with `quiz_bonus_points` controlling the reward, per the requested UX.

## Out of scope

- No leaderboard page (can add later).
- No changes to question bank UI (Lava/Fire dropdown fix already shipped).
