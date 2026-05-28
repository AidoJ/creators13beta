CREATE TABLE public.player_progress (
  user_id uuid PRIMARY KEY,
  points integer NOT NULL DEFAULT 0,
  types_seen text[] NOT NULL DEFAULT '{}',
  elo integer NOT NULL DEFAULT 1000,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  perfect_ecosystems integer NOT NULL DEFAULT 0,
  badges text[] NOT NULL DEFAULT '{}',
  last_played_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_progress TO authenticated;
GRANT ALL ON public.player_progress TO service_role;

ALTER TABLE public.player_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own progress" ON public.player_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own progress" ON public.player_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own progress" ON public.player_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins and trainers view all progress" ON public.player_progress
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role)
  );

CREATE TRIGGER update_player_progress_updated_at
  BEFORE UPDATE ON public.player_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic merge: bump points, union new types_seen, update streak/elo/badges
CREATE OR REPLACE FUNCTION public.bump_player_progress(
  _user_id uuid,
  _points_delta integer DEFAULT 0,
  _types_seen text[] DEFAULT '{}',
  _won boolean DEFAULT NULL,
  _perfect_eco boolean DEFAULT false,
  _elo_delta integer DEFAULT 0
) RETURNS public.player_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.player_progress;
  _new_streak integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  INSERT INTO public.player_progress(user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _row FROM public.player_progress WHERE user_id = _user_id FOR UPDATE;

  IF _won IS TRUE THEN
    _new_streak := COALESCE(_row.current_streak,0) + 1;
  ELSIF _won IS FALSE THEN
    _new_streak := 0;
  ELSE
    _new_streak := _row.current_streak;
  END IF;

  UPDATE public.player_progress SET
    points = GREATEST(0, points + COALESCE(_points_delta,0)),
    types_seen = (
      SELECT array_agg(DISTINCT t) FROM unnest(
        COALESCE(types_seen,'{}') || COALESCE(_types_seen,'{}')
      ) AS t WHERE t IS NOT NULL AND t <> ''
    ),
    elo = GREATEST(0, elo + COALESCE(_elo_delta,0)),
    current_streak = _new_streak,
    longest_streak = GREATEST(longest_streak, _new_streak),
    perfect_ecosystems = perfect_ecosystems + CASE WHEN _perfect_eco THEN 1 ELSE 0 END,
    last_played_at = now()
  WHERE user_id = _user_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;