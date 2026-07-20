
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profiling_prompt_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS profiling_prompt_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS profiling_prompt_tapped_at timestamptz,
  ADD COLUMN IF NOT EXISTS profiling_prompt_reached_checkout_at timestamptz,
  ADD COLUMN IF NOT EXISTS profiling_prompt_trigger text;

ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS profiling_prompt_quiz_mastery_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS profiling_prompt_games_threshold integer NOT NULL DEFAULT 6;
