
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS active_turn_skip_grace_seconds integer NOT NULL DEFAULT 45;

ALTER TABLE public.game_match_players
  ADD COLUMN IF NOT EXISTS disconnect_stamped_at timestamptz;
