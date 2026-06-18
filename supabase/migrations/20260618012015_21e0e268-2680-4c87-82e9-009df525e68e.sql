CREATE OR REPLACE FUNCTION public.list_my_active_matches()
 RETURNS SETOF game_matches
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.*
  FROM public.game_matches m
  WHERE auth.uid() IS NOT NULL
    AND m.status <> 'finished'
    AND (
      m.host_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.game_match_players gmp
        WHERE gmp.match_id = m.id AND gmp.user_id = auth.uid()
      )
    )
    -- Hide matches where the caller has already finished their own play
    -- (conceded / forfeit / finalised). The match may still be live for
    -- other players, but the caller has nothing to resume.
    AND NOT EXISTS (
      SELECT 1 FROM public.game_match_players gmp2
      WHERE gmp2.match_id = m.id
        AND gmp2.user_id  = auth.uid()
        AND gmp2.status IN ('conceded','forfeit','finalised')
    )
  ORDER BY m.updated_at DESC
  LIMIT 10;
$function$;