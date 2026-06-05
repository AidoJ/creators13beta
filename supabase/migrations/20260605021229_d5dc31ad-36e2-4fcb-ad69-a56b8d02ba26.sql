DROP FUNCTION IF EXISTS public.get_public_player_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_public_player_stats(_user_id uuid)
 RETURNS TABLE(elo integer, points integer, current_streak integer, longest_streak integer, total_bot_wins bigint, total_bot_losses bigint, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(pp.elo, 1000) AS elo,
    COALESCE(pp.points, 0) AS points,
    COALESCE(pp.current_streak, 0) AS current_streak,
    COALESCE(pp.longest_streak, 0) AS longest_streak,
    COALESCE((SELECT SUM(wins) FROM public.bot_match_stats WHERE user_id = _user_id), 0)::bigint AS total_bot_wins,
    COALESCE((SELECT SUM(losses) FROM public.bot_match_stats WHERE user_id = _user_id), 0)::bigint AS total_bot_losses,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''), pr.display_name, 'Player') AS display_name
  FROM public.profiles pr
  LEFT JOIN public.player_progress pp ON pp.user_id = pr.user_id
  WHERE pr.user_id = _user_id
  LIMIT 1;
$function$;