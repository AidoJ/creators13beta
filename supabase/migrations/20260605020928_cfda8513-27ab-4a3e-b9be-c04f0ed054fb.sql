GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_matches TO authenticated;
GRANT ALL ON public.game_matches TO service_role;

GRANT SELECT, INSERT ON public.game_match_moves TO authenticated;
GRANT ALL ON public.game_match_moves TO service_role;

GRANT SELECT ON public.game_settings TO authenticated, anon;
GRANT ALL ON public.game_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.player_progress TO authenticated;
GRANT ALL ON public.player_progress TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.bot_match_stats TO authenticated;
GRANT ALL ON public.bot_match_stats TO service_role;