ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS highlight_playable_cards boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS highlight_valid_placements boolean NOT NULL DEFAULT true;