ALTER TABLE public.game_match_players
  ADD COLUMN IF NOT EXISTS last_presence_gap_at timestamptz;

COMMENT ON COLUMN public.game_match_players.last_presence_gap_at IS
  'Timestamp of the most recent presence ping that arrived after a silence longer than presence_debounce_seconds. Used by the disconnect sweep to avoid penalising flaky-but-present players with idle strikes.';