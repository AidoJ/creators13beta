
-- ============================================================================
-- Server-authoritative lockdown (Steps 5 & 6 of the design doc)
--
-- Step 5: revoke client UPDATE on the columns the server now owns.
-- Step 6: server-vouched match finalisation (ELO + points + types_seen).
-- ============================================================================

-- ---------- Step 5: column-level UPDATE lockdown -----------------------------
-- The existing RLS policy "Players can update their matches" still applies for
-- WHO can update, but column GRANTs now limit WHAT they can update.
-- The state, public_state, seq, winner_user_id, status, last_action_by columns
-- are owned exclusively by the service role (via apply-move + commit_move).
-- Players keep the ability to touch host_name and guest_name (cosmetic display
-- names; accept_game_invite uses SECURITY DEFINER so it bypasses these anyway).

REVOKE UPDATE ON public.game_matches FROM authenticated;
GRANT UPDATE (host_name, guest_name, updated_at) ON public.game_matches TO authenticated;
GRANT ALL ON public.game_matches TO service_role;

-- ---------- Step 6: server-vouched finaliser --------------------------------

-- Tighten bump_player_progress so clients can't call it directly any more.
-- The edge function (service_role) is the only legitimate caller for ranked
-- match progress. Bot-only stats live in bump_bot_match_stats (still client
-- callable: solo bot wins never affect ELO and the per-call clamp limits abuse).
REVOKE EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) TO service_role;

-- Server-only RPC: called by apply-move when a ranked PvP match finishes.
-- Reads winner_user_id from the row (which the server just committed) and
-- splits points / ELO between both players using game_settings, so the
-- outcome the client claims can no longer drive the ladder.
CREATE OR REPLACE FUNCTION public.finalise_ranked_match(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row       public.game_matches;
  _settings  public.game_settings;
  _host_won  boolean;
  _draw      boolean;
  _pts_win   int;
  _pts_draw  int;
  _bonus_eco int;
  _elo_win   int;
  _elo_loss  int;
BEGIN
  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'finished' OR _row.is_ranked IS NOT TRUE THEN
    RETURN;
  END IF;
  IF _row.guest_user_id IS NULL OR _row.host_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Defensive idempotency: only run once per finished match. We tag the
  -- match state with a marker key on first finalisation.
  IF coalesce((_row.state ->> '__finalised')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT * INTO _settings FROM public.game_settings ORDER BY updated_at DESC LIMIT 1;
  _pts_win   := coalesce(_settings.points_per_win, 10);
  _bonus_eco := coalesce(_settings.perfect_eco_bonus, 5);
  _elo_win   := coalesce(_settings.elo_win, 16);
  _elo_loss  := coalesce(_settings.elo_loss, -16);
  _pts_draw  := _pts_win / 2;

  _draw     := _row.winner_user_id IS NULL;
  _host_won := _row.winner_user_id = _row.host_user_id;

  -- Bump host
  PERFORM public.bump_player_progress(
    _row.host_user_id,
    CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_win ELSE 0 END,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_win ELSE _elo_loss END
  );
  -- Bump guest
  PERFORM public.bump_player_progress(
    _row.guest_user_id,
    CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN 0 ELSE _pts_win END,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE NOT _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_loss ELSE _elo_win END
  );

  -- Mark the row so we never double-bump.
  UPDATE public.game_matches
     SET state = state || jsonb_build_object('__finalised', true)
   WHERE id = _match_id;
END;
$$;

-- bump_player_progress runs as security-definer using auth.uid(), but our
-- finaliser passes a user_id and we want the function to ATTRIBUTE the bump
-- to that specific user. The existing bump_player_progress already prefers
-- auth.uid() over the parameter, which won't work from a service-role caller
-- (auth.uid() is null). Patch it so when the caller is service_role and
-- auth.uid() is null we honour the _user_id parameter.
CREATE OR REPLACE FUNCTION public.bump_player_progress(_user_id uuid, _points_delta integer DEFAULT 0, _types_seen text[] DEFAULT '{}'::text[], _won boolean DEFAULT NULL::boolean, _perfect_eco boolean DEFAULT false, _elo_delta integer DEFAULT 0)
 RETURNS public.player_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.player_progress;
  _new_streak integer;
  _caller uuid := COALESCE(auth.uid(), _user_id);
BEGIN
  -- If a real end user is calling, attribute writes to them and ignore the
  -- supplied parameter (prevents one player crediting another).
  -- If there's no auth context (service_role from the apply-move edge fn),
  -- honour the supplied _user_id — that's the trusted finaliser path.
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF _points_delta IS NOT NULL THEN
    _points_delta := GREATEST(-500, LEAST(500, _points_delta));
  END IF;
  IF _elo_delta IS NOT NULL THEN
    _elo_delta := GREATEST(-100, LEAST(100, _elo_delta));
  END IF;

  INSERT INTO public.player_progress(user_id) VALUES (_caller)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO _row FROM public.player_progress WHERE user_id = _caller FOR UPDATE;

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
  WHERE user_id = _caller
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

-- Re-tighten EXECUTE after redefinition (CREATE OR REPLACE keeps grants, but
-- belt-and-braces in case of a future drop-and-recreate).
REVOKE EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.finalise_ranked_match(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalise_ranked_match(uuid) FROM PUBLIC, authenticated;
