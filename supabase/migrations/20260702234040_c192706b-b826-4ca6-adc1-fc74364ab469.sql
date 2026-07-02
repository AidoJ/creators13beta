
-- Cap questions per match (admin-tunable)
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS quiz_questions_per_match integer NOT NULL DEFAULT 4;

DO $$ BEGIN
  ALTER TABLE public.game_settings
    ADD CONSTRAINT quiz_questions_per_match_allowed CHECK (quiz_questions_per_match IN (4,8,12));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Track cumulative bonus points earned per match (tiered / repeating)
ALTER TABLE public.quiz_match_progress
  ADD COLUMN IF NOT EXISTS bonus_points_awarded integer NOT NULL DEFAULT 0;

-- Tiered / repeating bonus + cap enforcement
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
    'cap_reached', (_prog.correct_count + _prog.wrong_count) >= _questions_per_match
  );
END $$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(UUID, UUID, quiz_option) TO authenticated;

-- Cap-aware open helper
CREATE OR REPLACE FUNCTION public.open_quiz_if_needed(
  _match_id UUID,
  _user_id UUID,
  _creator_type TEXT,
  _turn INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prog RECORD;
  _qid UUID;
  _cap INT;
  _quiz_on BOOLEAN;
BEGIN
  SELECT COALESCE(quiz_enabled, true), COALESCE(quiz_questions_per_match, 4)
    INTO _quiz_on, _cap FROM public.game_settings LIMIT 1;
  IF _quiz_on IS NULL OR _quiz_on = false THEN RETURN NULL; END IF;
  IF _cap IS NULL THEN _cap := 4; END IF;

  INSERT INTO public.quiz_match_progress (match_id, user_id)
    VALUES (_match_id, _user_id)
    ON CONFLICT DO NOTHING;

  SELECT * INTO _prog FROM public.quiz_match_progress
    WHERE match_id = _match_id AND user_id = _user_id;

  IF _prog.open_question_id IS NOT NULL THEN
    RETURN _prog.open_question_id;
  END IF;

  IF (_prog.correct_count + _prog.wrong_count) >= _cap THEN
    RETURN NULL;
  END IF;

  -- Pick a random approved+active question the user hasn't mastered yet.
  SELECT q.id INTO _qid
    FROM public.quiz_questions q
   WHERE q.is_active = true
     AND q.review_status = 'approved'
     AND (q.creator_type = _creator_type OR q.creator_type = 'ALL')
     AND NOT EXISTS (
       SELECT 1 FROM public.quiz_player_mastery m
        WHERE m.user_id = _user_id AND m.question_id = q.id
     )
   ORDER BY random() LIMIT 1;

  IF _qid IS NULL THEN
    -- Fallback: any approved+active question of that type/ALL, ignoring mastery.
    SELECT q.id INTO _qid
      FROM public.quiz_questions q
     WHERE q.is_active = true
       AND q.review_status = 'approved'
       AND (q.creator_type = _creator_type OR q.creator_type = 'ALL')
     ORDER BY random() LIMIT 1;
  END IF;

  IF _qid IS NULL THEN RETURN NULL; END IF;

  UPDATE public.quiz_match_progress
     SET open_question_id = _qid, open_question_turn = _turn, updated_at = now()
   WHERE match_id = _match_id AND user_id = _user_id;

  RETURN _qid;
END $$;

GRANT EXECUTE ON FUNCTION public.open_quiz_if_needed(UUID, UUID, TEXT, INT) TO authenticated, service_role;

-- Player + admin stats RPC
CREATE OR REPLACE FUNCTION public.get_player_quiz_stats(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    FROM public.game_matches
   WHERE winner_user_id = _user_id;

  SELECT
      COALESCE(SUM(bonus_points_awarded), 0),
      COALESCE(SUM(correct_count), 0),
      COALESCE(SUM(wrong_count), 0)
    INTO _bonus, _correct, _wrong
    FROM public.quiz_match_progress
   WHERE user_id = _user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.creator_type), '[]'::jsonb) INTO _by_type
    FROM (
      SELECT q.creator_type,
             COUNT(*) FILTER (WHERE q.correct_option = m_answers.chosen)::int AS correct,
             COUNT(*)::int AS answered
      FROM public.quiz_player_mastery m
      JOIN public.quiz_questions q ON q.id = m.question_id
      -- mastery table only holds correct answers; join to progress to include wrongs by type
      LEFT JOIN LATERAL (SELECT q.correct_option AS chosen) m_answers ON true
      WHERE m.user_id = _user_id
      GROUP BY q.creator_type
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
END $$;

GRANT EXECUTE ON FUNCTION public.get_player_quiz_stats(UUID) TO authenticated;
