
-- =========================================================================
-- Creator Quiz — Q1 Schema
-- =========================================================================

-- Category enum
DO $$ BEGIN
  CREATE TYPE public.quiz_category AS ENUM (
    'family','element','team_role','signature','at_the_table',
    'shadow_side','you_might_be_if','animal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quiz_review_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quiz_option AS ENUM ('a','b','c','d');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------------------------
-- 1. quiz_questions — the bank
-- -------------------------------------------------------------------------
CREATE TABLE public.quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_type    text NOT NULL,            -- lowercase canonical ('lava','sky',...)
  category        public.quiz_category NOT NULL,
  prompt          text NOT NULL,
  option_a        text NOT NULL,
  option_b        text NOT NULL,
  option_c        text NOT NULL,
  option_d        text NOT NULL,
  correct_option  public.quiz_option NOT NULL,
  explanation     text,
  source_field    text,                     -- audit: which CT field this came from
  active          boolean NOT NULL DEFAULT true,
  review_status   public.quiz_review_status NOT NULL DEFAULT 'pending',
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quiz_questions_active_type_idx
  ON public.quiz_questions (creator_type, active, review_status);
CREATE INDEX quiz_questions_review_idx
  ON public.quiz_questions (review_status, created_at);

-- Grants: admins/trainers full via service_role; regular users read the
-- redacted view (below). We still grant SELECT on the base table to
-- authenticated so the view (which is SECURITY INVOKER by default) works,
-- but we revoke the sensitive columns explicitly.
GRANT SELECT ON public.quiz_questions TO authenticated;
REVOKE SELECT (correct_option, explanation) ON public.quiz_questions FROM authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Players can only see active + approved questions (correct option hidden by column grants).
CREATE POLICY "Players read active approved questions"
  ON public.quiz_questions FOR SELECT
  TO authenticated
  USING (active = true AND review_status = 'approved');

-- Admins/trainers manage everything.
CREATE POLICY "Admins manage quiz bank"
  ON public.quiz_questions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'trainer'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'trainer'::app_role));

CREATE TRIGGER quiz_questions_set_updated_at
  BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 2. quiz_player_mastery — permanent per-user mastery
-- -------------------------------------------------------------------------
CREATE TABLE public.quiz_player_mastery (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  mastered_at timestamptz NOT NULL DEFAULT now(),
  match_id    uuid,   -- audit: which match granted mastery
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX quiz_player_mastery_user_idx ON public.quiz_player_mastery (user_id);

GRANT SELECT, INSERT ON public.quiz_player_mastery TO authenticated;
GRANT ALL ON public.quiz_player_mastery TO service_role;

ALTER TABLE public.quiz_player_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mastery"
  ON public.quiz_player_mastery FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own mastery"
  ON public.quiz_player_mastery FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- 3. quiz_match_progress — per-match, per-player run state
-- -------------------------------------------------------------------------
CREATE TABLE public.quiz_match_progress (
  match_id             uuid NOT NULL REFERENCES public.game_matches(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  open_question_id     uuid REFERENCES public.quiz_questions(id) ON DELETE SET NULL,
  open_question_turn   integer,        -- turn number when opened
  correct_count        integer NOT NULL DEFAULT 0,
  wrong_count          integer NOT NULL DEFAULT 0,
  bonus_awarded        boolean NOT NULL DEFAULT false,
  last_triggered_turn  integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX quiz_match_progress_user_idx ON public.quiz_match_progress (user_id);

GRANT SELECT ON public.quiz_match_progress TO authenticated;
GRANT ALL ON public.quiz_match_progress TO service_role;

ALTER TABLE public.quiz_match_progress ENABLE ROW LEVEL SECURITY;

-- Opponents can see each other's progress (bonus is public per the design spec).
CREATE POLICY "Match participants read progress"
  ON public.quiz_match_progress FOR SELECT
  TO authenticated
  USING (public.is_match_participant(match_id));

CREATE TRIGGER quiz_match_progress_set_updated_at
  BEFORE UPDATE ON public.quiz_match_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 4. game_settings — quiz feature flag + tunables
-- -------------------------------------------------------------------------
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS quiz_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiz_bonus_threshold integer NOT NULL DEFAULT 4
    CHECK (quiz_bonus_threshold IN (4,8,12)),
  ADD COLUMN IF NOT EXISTS quiz_bonus_points integer NOT NULL DEFAULT 1
    CHECK (quiz_bonus_points BETWEEN 1 AND 5);

-- -------------------------------------------------------------------------
-- 5. v_player_creator_mastery — "learned X of N" per user per creator
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_player_creator_mastery
WITH (security_invoker = true)
AS
SELECT
  m.user_id,
  q.creator_type,
  count(*)::int AS mastered_count,
  (SELECT count(*) FROM public.quiz_questions q2
    WHERE q2.creator_type = q.creator_type
      AND q2.active = true AND q2.review_status = 'approved')::int AS total_count
FROM public.quiz_player_mastery m
JOIN public.quiz_questions q ON q.id = m.question_id
WHERE q.active = true AND q.review_status = 'approved'
GROUP BY m.user_id, q.creator_type;

GRANT SELECT ON public.v_player_creator_mastery TO authenticated;
