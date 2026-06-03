-- 1. Bot match stats (lifetime totals per user per difficulty)
CREATE TABLE public.bot_match_stats (
  user_id uuid NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  perfect_ecos integer NOT NULL DEFAULT 0,
  last_played_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

GRANT SELECT, INSERT, UPDATE ON public.bot_match_stats TO authenticated;
GRANT ALL ON public.bot_match_stats TO service_role;

ALTER TABLE public.bot_match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bot stats"
  ON public.bot_match_stats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and trainers view all bot stats"
  ON public.bot_match_stats FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role));

-- 2. Bump RPC — security definer, called after a bot match finishes
CREATE OR REPLACE FUNCTION public.bump_bot_match_stats(
  _difficulty text,
  _won boolean,
  _perfect_eco boolean DEFAULT false
) RETURNS public.bot_match_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.bot_match_stats;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _difficulty NOT IN ('easy','medium','hard') THEN
    RAISE EXCEPTION 'invalid difficulty: %', _difficulty;
  END IF;

  INSERT INTO public.bot_match_stats(user_id, difficulty)
  VALUES (_uid, _difficulty)
  ON CONFLICT (user_id, difficulty) DO NOTHING;

  UPDATE public.bot_match_stats SET
    wins = wins + CASE WHEN _won IS TRUE THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN _won IS FALSE THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN _won IS NULL THEN 1 ELSE 0 END,
    perfect_ecos = perfect_ecos + CASE WHEN _perfect_eco THEN 1 ELSE 0 END,
    last_played_at = now(),
    updated_at = now()
  WHERE user_id = _uid AND difficulty = _difficulty
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- 3. Public player stats RPC — for showing opponent ELO + bot wins in PvP
CREATE OR REPLACE FUNCTION public.get_public_player_stats(_user_id uuid)
RETURNS TABLE(
  elo integer,
  points integer,
  current_streak integer,
  longest_streak integer,
  total_bot_wins bigint,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(pp.elo, 1000) AS elo,
    COALESCE(pp.points, 0) AS points,
    COALESCE(pp.current_streak, 0) AS current_streak,
    COALESCE(pp.longest_streak, 0) AS longest_streak,
    COALESCE((SELECT SUM(wins) FROM public.bot_match_stats WHERE user_id = _user_id), 0)::bigint AS total_bot_wins,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''), pr.display_name, 'Player') AS display_name
  FROM public.profiles pr
  LEFT JOIN public.player_progress pp ON pp.user_id = pr.user_id
  WHERE pr.user_id = _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.bump_bot_match_stats(text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_player_stats(uuid) TO authenticated;

-- 4. Admin enable flags for difficulty tiers
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS bot_easy_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_medium_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_hard_enabled boolean NOT NULL DEFAULT true;