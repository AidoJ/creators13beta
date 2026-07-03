CREATE OR REPLACE FUNCTION public.get_player_quiz_stats(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller UUID := auth.uid();
  _wins INT := 0;
  _bonus INT := 0;
  _correct INT := 0;
  _wrong INT := 0;
  _by_type JSONB;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _caller <> _user_id AND NOT public.has_role(_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT COUNT(*) INTO _wins
    FROM public.game_matches WHERE winner_user_id = _user_id;

  SELECT
      COALESCE(SUM(bonus_points_awarded), 0),
      COALESCE(SUM(correct_count), 0),
      COALESCE(SUM(wrong_count), 0)
    INTO _bonus, _correct, _wrong
    FROM public.quiz_match_progress
   WHERE user_id = _user_id;

  WITH bank AS (
    SELECT creator_type, COUNT(*)::int AS total
      FROM public.quiz_questions
     WHERE active = true AND review_status = 'approved' AND creator_type <> 'ALL'
     GROUP BY creator_type
  ),
  mastered AS (
    SELECT q.creator_type, COUNT(DISTINCT m.question_id)::int AS mastered
      FROM public.quiz_player_mastery m
      JOIN public.quiz_questions q ON q.id = m.question_id
     WHERE m.user_id = _user_id AND q.creator_type <> 'ALL'
     GROUP BY q.creator_type
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.creator_type), '[]'::jsonb) INTO _by_type
    FROM (
      SELECT b.creator_type,
             COALESCE(m.mastered, 0) AS correct,
             b.total AS answered
      FROM bank b
      LEFT JOIN mastered m ON m.creator_type = b.creator_type
    ) t;

  RETURN jsonb_build_object(
    'wins', _wins,
    'bonus_points', _bonus,
    'correct', _correct,
    'wrong', _wrong,
    'answered', _correct + _wrong,
    'accuracy', CASE WHEN (_correct + _wrong) = 0 THEN 0
                     ELSE round((_correct::numeric / (_correct + _wrong)) * 100, 1) END,
    'by_type', COALESCE(_by_type, '[]'::jsonb)
  );
END $function$;