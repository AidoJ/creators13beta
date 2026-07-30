CREATE OR REPLACE FUNCTION public._pick_quiz_question(
  _user_id UUID,
  _creator_types TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _picked UUID;
  _any BOOLEAN := (_creator_types IS NULL
                   OR array_length(_creator_types, 1) IS NULL
                   OR 'ANY' = ANY(_creator_types));
BEGIN
  SELECT q.id INTO _picked
    FROM public.quiz_questions q
   WHERE q.active = true
     AND q.review_status = 'approved'
     AND (_any OR q.creator_type = ANY(_creator_types))
     AND NOT EXISTS (
       SELECT 1 FROM public.quiz_player_mastery m
        WHERE m.user_id = _user_id AND m.question_id = q.id
     )
   ORDER BY random() LIMIT 1;

  IF _picked IS NULL THEN
    SELECT q.id INTO _picked
      FROM public.quiz_questions q
     WHERE q.active = true
       AND q.review_status = 'approved'
       AND (_any OR q.creator_type = ANY(_creator_types))
     ORDER BY random() LIMIT 1;
  END IF;

  RETURN _picked;
END $$;

GRANT EXECUTE ON FUNCTION public._pick_quiz_question(UUID, TEXT[]) TO authenticated, service_role;

ALTER TABLE public.quiz_match_progress
  ADD COLUMN IF NOT EXISTS pending_creator_types text[] NOT NULL DEFAULT '{}';

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
  _prog RECORD;
  _picked UUID;
  _turn INT;
  _cap INT;
  _quiz_on BOOLEAN;
  _tag TEXT;
  _queued INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_match_players
                 WHERE match_id = _match_id AND user_id = _user_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(quiz_enabled, true), COALESCE(quiz_questions_per_match, 4)
    INTO _quiz_on, _cap FROM public.game_settings LIMIT 1;
  IF _quiz_on IS FALSE THEN RETURN NULL; END IF;
  IF _cap IS NULL THEN _cap := 4; END IF;

  INSERT INTO public.quiz_match_progress (match_id, user_id)
    VALUES (_match_id, _user_id)
    ON CONFLICT (match_id, user_id) DO NOTHING;

  SELECT * INTO _prog FROM public.quiz_match_progress
   WHERE match_id = _match_id AND user_id = _user_id;

  IF (_prog.correct_count + _prog.wrong_count) >= _cap THEN
    RETURN NULL;
  END IF;

  _tag := CASE
            WHEN _creator_types IS NULL THEN 'ANY'
            WHEN array_length(_creator_types, 1) IS NULL THEN 'ANY'
            WHEN array_length(_creator_types, 1) > 1 THEN 'ANY'
            ELSE _creator_types[1]
          END;

  IF _prog.open_question_id IS NOT NULL THEN
    _queued := COALESCE(array_length(_prog.pending_creator_types, 1), 0);
    IF (_prog.correct_count + _prog.wrong_count) + 1 + _queued < _cap THEN
      UPDATE public.quiz_match_progress
         SET pending_creator_types = pending_creator_types || _tag,
             updated_at = now()
       WHERE match_id = _match_id AND user_id = _user_id;
    END IF;
    RETURN _prog.open_question_id;
  END IF;

  SELECT COALESCE((state->>'turnNumber')::int, 0) INTO _turn
    FROM public.game_matches WHERE id = _match_id;

  _picked := public._pick_quiz_question(_user_id, ARRAY[_tag]);
  IF _picked IS NULL THEN RETURN NULL; END IF;

  UPDATE public.quiz_match_progress
     SET open_question_id = _picked,
         open_question_turn = _turn,
         last_triggered_turn = _turn,
         updated_at = now()
   WHERE match_id = _match_id AND user_id = _user_id
     AND open_question_id IS NULL;

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
  _bonus_pts INT;
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

  SELECT COALESCE(quiz_bonus_points, 1), COALESCE(quiz_questions_per_match, 4)
    INTO _bonus_pts, _questions_per_match
    FROM public.game_settings LIMIT 1;
  IF _bonus_pts IS NULL THEN _bonus_pts := 1; END IF;
  IF _questions_per_match IS NULL THEN _questions_per_match := 4; END IF;

  _correct := (_chosen_option = _q.correct_option);
  _prev_tiers := _prog.correct_count / 4;

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

    _new_tiers := _prog.correct_count / 4;
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
    'questions_per_match', _questions_per_match,
    'answered', _prog.correct_count + _prog.wrong_count,
    'cap_reached', (_prog.correct_count + _prog.wrong_count) >= _questions_per_match,
    'next_question_id', _prog.open_question_id
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
         pending_creator_types = '{}',
         updated_at = now()
   WHERE match_id = _match_id AND user_id = _user_id;
END $$;

GRANT EXECUTE ON FUNCTION public.close_open_quiz(UUID, UUID) TO authenticated, service_role;