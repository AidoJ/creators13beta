ALTER TABLE public.player_progress
  ADD COLUMN IF NOT EXISTS practice_games_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practice_completed_at timestamptz;