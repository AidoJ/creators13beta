
DROP VIEW IF EXISTS public.v_player_creator_mastery;

CREATE OR REPLACE FUNCTION public.open_quiz_if_needed(
  _match_id UUID,
  _user_id UUID,
  _creator_types TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing UUID;
  _picked UUID;
  _turn INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_match_players
                 WHERE match_id = _match_id AND user_id = _user_id) THEN
    RETURN NULL;
  END IF;

  SELECT open_question_id INTO _existing
    FROM public.quiz_match_progress
   WHERE match_id = _match_id AND user_id = _user_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT COALESCE((state->>'turnNumber')::int, 0) INTO _turn
    FROM public.game_matches WHERE id = _match_id;

  SELECT q.id INTO _picked
    FROM public.quiz_questions q
   WHERE q.active = true
     AND q.review_status = 'approved'
     AND q.creator_type = ANY(_creator_types)
     AND NOT EXISTS (
       SELECT 1 FROM public.quiz_player_mastery m
        WHERE m.user_id = _user_id AND m.question_id = q.id
     )
   ORDER BY random()
   LIMIT 1;

  IF _picked IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.quiz_match_progress (match_id, user_id, open_question_id, open_question_turn, last_triggered_turn)
       VALUES (_match_id, _user_id, _picked, _turn, _turn)
  ON CONFLICT (match_id, user_id) DO UPDATE
     SET open_question_id = EXCLUDED.open_question_id,
         open_question_turn = EXCLUDED.open_question_turn,
         last_triggered_turn = EXCLUDED.last_triggered_turn,
         updated_at = now()
   WHERE public.quiz_match_progress.open_question_id IS NULL;

  RETURN _picked;
END $$;

GRANT EXECUTE ON FUNCTION public.open_quiz_if_needed(UUID, UUID, TEXT[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
  _match_id UUID,
  _question_id UUID,
  _chosen_option quiz_option
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _q RECORD;
  _prog RECORD;
  _correct BOOLEAN;
  _threshold INT;
  _bonus_just BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_match_players
                  WHERE match_id = _match_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'not a match participant';
  END IF;

  SELECT * INTO _q FROM public.quiz_questions WHERE id = _question_id;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'question not found'; END IF;

  SELECT * INTO _prog FROM public.quiz_match_progress
   WHERE match_id = _match_id AND user_id = _uid;
  IF _prog.open_question_id IS NULL OR _prog.open_question_id <> _question_id THEN
    RAISE EXCEPTION 'no open question or mismatch';
  END IF;

  _correct := (_chosen_option = _q.correct_option);

  SELECT COALESCE(quiz_bonus_threshold, 4) INTO _threshold
    FROM public.game_settings LIMIT 1;
  IF _threshold IS NULL THEN _threshold := 4; END IF;

  IF _correct THEN
    INSERT INTO public.quiz_player_mastery (user_id, question_id, match_id)
      VALUES (_uid, _question_id, _match_id)
      ON CONFLICT DO NOTHING;

    UPDATE public.quiz_match_progress
       SET correct_count = correct_count + 1,
           open_question_id = NULL,
           open_question_turn = NULL,
           updated_at = now()
     WHERE match_id = _match_id AND user_id = _uid
     RETURNING * INTO _prog;

    IF _prog.correct_count >= _threshold AND NOT _prog.bonus_awarded THEN
      UPDATE public.quiz_match_progress
         SET bonus_awarded = true, updated_at = now()
       WHERE match_id = _match_id AND user_id = _uid;
      _bonus_just := true;
      _prog.bonus_awarded := true;
    END IF;
  ELSE
    UPDATE public.quiz_match_progress
       SET wrong_count = wrong_count + 1,
           open_question_id = NULL,
           open_question_turn = NULL,
           updated_at = now()
     WHERE match_id = _match_id AND user_id = _uid
     RETURNING * INTO _prog;
  END IF;

  RETURN jsonb_build_object(
    'correct', _correct,
    'correct_option', _q.correct_option,
    'explanation', _q.explanation,
    'correct_count', _prog.correct_count,
    'wrong_count', _prog.wrong_count,
    'bonus_awarded', _prog.bonus_awarded,
    'bonus_just_awarded', _bonus_just,
    'threshold', _threshold
  );
END $$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(UUID, UUID, quiz_option) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_open_quiz(_match_id UUID, _user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quiz_match_progress
     SET open_question_id = NULL,
         open_question_turn = NULL,
         updated_at = now()
   WHERE match_id = _match_id AND user_id = _user_id;
END $$;

GRANT EXECUTE ON FUNCTION public.close_open_quiz(UUID, UUID) TO authenticated, service_role;

CREATE VIEW public.v_player_creator_mastery
WITH (security_invoker = true) AS
SELECT
  m.user_id,
  q.creator_type,
  COUNT(*) AS mastered_count,
  (SELECT COUNT(*) FROM public.quiz_questions q2
    WHERE q2.creator_type = q.creator_type
      AND q2.active AND q2.review_status = 'approved') AS total_count
  FROM public.quiz_player_mastery m
  JOIN public.quiz_questions q ON q.id = m.question_id
 WHERE q.active AND q.review_status = 'approved'
 GROUP BY m.user_id, q.creator_type;

GRANT SELECT ON public.v_player_creator_mastery TO authenticated, service_role;
