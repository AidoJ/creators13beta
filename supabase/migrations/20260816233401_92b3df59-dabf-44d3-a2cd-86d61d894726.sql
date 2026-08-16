ALTER TABLE public.game_settings
  DROP CONSTRAINT IF EXISTS quiz_questions_per_match_allowed,
  DROP CONSTRAINT IF EXISTS game_settings_quiz_bonus_threshold_check,
  DROP CONSTRAINT IF EXISTS game_settings_quiz_bonus_points_check;

ALTER TABLE public.game_settings
  ADD CONSTRAINT quiz_questions_per_match_range CHECK (quiz_questions_per_match BETWEEN 1 AND 20),
  ADD CONSTRAINT quiz_bonus_threshold_range CHECK (quiz_bonus_threshold BETWEEN 1 AND 20),
  ADD CONSTRAINT quiz_bonus_points_range CHECK (quiz_bonus_points BETWEEN 1 AND 20);

CREATE OR REPLACE FUNCTION public.submit_quiz_answer(_match_id uuid, _question_id uuid, _chosen_option quiz_option)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _q RECORD;
  _prog RECORD;
  _correct BOOLEAN;
  _bonus_pts INT;
  _tier_size INT;
  _questions_per_match INT;
  _bonus_gained INT := 0;
  _prev_tiers INT;
  _new_tiers INT;
  _next_tag TEXT;
  _next_qid UUID;
  _turn INT;
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

  SELECT COALESCE(quiz_bonus_points, 1), COALESCE(quiz_questions_per_match, 4), COALESCE(quiz_bonus_threshold, 4)
    INTO _bonus_pts, _questions_per_match, _tier_size
    FROM public.game_settings LIMIT 1;
  IF _bonus_pts IS NULL THEN _bonus_pts := 1; END IF;
  IF _questions_per_match IS NULL THEN _questions_per_match := 4; END IF;
  IF _tier_size IS NULL OR _tier_size < 1 THEN _tier_size := 4; END IF;

  _correct := (_chosen_option = _q.correct_option);
  _prev_tiers := _prog.correct_count / _tier_size;

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

    _new_tiers := _prog.correct_count / _tier_size;
    IF _new_tiers > _prev_tiers THEN
      _bonus_gained := (_new_tiers - _prev_tiers) * _bonus_pts;
      UPDATE public.quiz_match_progress
         SET bonus_points_awarded = bonus_points_awarded + _bonus_gained,
             bonus_awarded = true,
             updated_at = now()
       WHERE match_id = _match_id AND user_id = _uid
       RETURNING * INTO _prog;
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

  WHILE COALESCE(array_length(_prog.pending_creator_types, 1), 0) > 0
        AND _prog.open_question_id IS NULL
        AND (_prog.correct_count + _prog.wrong_count) < _questions_per_match LOOP
    _next_tag := _prog.pending_creator_types[1];
    _next_qid := public._pick_quiz_question(_uid, ARRAY[_next_tag]);

    SELECT COALESCE((state->>'turnNumber')::int, 0) INTO _turn
      FROM public.game_matches WHERE id = _match_id;

    UPDATE public.quiz_match_progress
       SET pending_creator_types = pending_creator_types[2:],
           open_question_id = _next_qid,
           open_question_turn = CASE WHEN _next_qid IS NULL THEN NULL ELSE _turn END,
           updated_at = now()
     WHERE match_id = _match_id AND user_id = _uid
     RETURNING * INTO _prog;
  END LOOP;

  RETURN jsonb_build_object(
    'correct', _correct,
    'correct_option', _q.correct_option,
    'explanation', _q.explanation,
    'correct_count', _prog.correct_count,
    'wrong_count', _prog.wrong_count,
    'bonus_awarded', _prog.bonus_awarded,
    'bonus_points_awarded', _prog.bonus_points_awarded,
    'bonus_just_awarded', _bonus_gained > 0,
    'bonus_gained', _bonus_gained,
    'bonus_points_per_tier', _bonus_pts,
    'bonus_tier_size', _tier_size,
    'questions_per_match', _questions_per_match,
    'answered', _prog.correct_count + _prog.wrong_count,
    'cap_reached', (_prog.correct_count + _prog.wrong_count) >= _questions_per_match,
    'next_question_id', _prog.open_question_id
  );
END $function$;