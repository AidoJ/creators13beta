
-- Extend game_settings with groups 4 (bots/matchmaking), 5 (UI/UX), 7 (live ops).
-- Group 6 (content / deck composition) is intentionally NOT schema-driven here —
-- the card library is already managed via game_cards + admin import.
ALTER TABLE public.game_settings
  -- Bots & matchmaking
  ADD COLUMN IF NOT EXISTS bot_difficulty text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS bot_think_ms integer NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS allow_guest_play boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_solo_vs_bot boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_players_per_match integer NOT NULL DEFAULT 2,
  -- UI / UX toggles
  ADD COLUMN IF NOT EXISTS show_tutorial_overlay boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_discord_chat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_review_boards boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prompt_player_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_score_panel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured_mode text,
  -- Live operations
  ADD COLUMN IF NOT EXISTS maintenance_banner_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_banner_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS play_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS play_disabled_message text NOT NULL DEFAULT 'The game is briefly offline for maintenance. Please check back soon.';

-- Bot-difficulty / default-mode sanity constraints
ALTER TABLE public.game_settings
  DROP CONSTRAINT IF EXISTS game_settings_bot_difficulty_check;
ALTER TABLE public.game_settings
  ADD CONSTRAINT game_settings_bot_difficulty_check
  CHECK (bot_difficulty IN ('easy','medium','hard'));

-- Admin-only RPC: reset one player's game progress (live-ops).
CREATE OR REPLACE FUNCTION public.admin_reset_player_progress(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'trainer'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.player_progress
     SET points = 0,
         types_seen = '{}',
         elo = 1000,
         current_streak = 0,
         longest_streak = 0,
         perfect_ecosystems = 0,
         badges = '{}',
         last_played_at = NULL,
         updated_at = now()
   WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_player_progress(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_player_progress(uuid) TO authenticated;
