
-- Baseline per-turn idle timeout (End-of-Days & Top Score; Beat-the-Clock has its own timer).
-- Adds tunables, a turn-stopwatch column on matches, and a per-player consecutive-strike counter.

ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS idle_turn_seconds INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS idle_turn_strikes_limit SMALLINT NOT NULL DEFAULT 3;

ALTER TABLE public.game_matches
  ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;

ALTER TABLE public.game_match_players
  ADD COLUMN IF NOT EXISTS idle_strikes SMALLINT NOT NULL DEFAULT 0;

-- Backfill: seed turn_started_at for any active matches so the first sweep tick
-- after deploy doesn't instantly count their in-flight turn as expired.
UPDATE public.game_matches
  SET turn_started_at = now()
  WHERE status = 'active' AND turn_started_at IS NULL;
