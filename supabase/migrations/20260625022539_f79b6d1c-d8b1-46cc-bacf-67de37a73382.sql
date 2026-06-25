ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS beat_clock_draw_seconds integer NOT NULL DEFAULT 10;