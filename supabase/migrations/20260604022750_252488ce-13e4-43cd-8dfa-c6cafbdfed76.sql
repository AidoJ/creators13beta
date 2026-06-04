-- Revoke broad SELECT on game_matches and re-grant only non-sensitive columns.
-- The `state` column (which contains both players' full hands) is no longer
-- directly readable by clients; they must go through get_match_state().
REVOKE SELECT ON public.game_matches FROM authenticated;
REVOKE SELECT ON public.game_matches FROM anon;

GRANT SELECT (
  id, mode, status,
  host_user_id, host_name,
  guest_user_id, guest_name,
  invite_token,
  seq, is_ranked,
  public_state,
  winner_user_id, last_action_by,
  created_at, updated_at
) ON public.game_matches TO authenticated;

-- Per-caller redacted state read. Solo (non-ranked) matches are
-- client-authoritative and return the full state. Ranked PvP matches return
-- a copy of `state` with every non-caller player's `hand` stripped to [] and
-- a `handCount` left in its place.
CREATE OR REPLACE FUNCTION public.get_match_state(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row         public.game_matches;
  _caller_slot int;
  _players     jsonb;
  _new_players jsonb := '[]'::jsonb;
  _p           jsonb;
  _i           int;
BEGIN
  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found';
  END IF;

  IF auth.uid() IS NULL
     OR (_row.host_user_id <> auth.uid() AND coalesce(_row.guest_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()) THEN
    RAISE EXCEPTION 'not a player in this match';
  END IF;

  -- Solo bot / non-ranked: trust the client, return full state.
  IF _row.is_ranked IS NOT TRUE THEN
    RETURN _row.state;
  END IF;

  _caller_slot := CASE WHEN _row.host_user_id = auth.uid() THEN 0 ELSE 1 END;
  _players := _row.state -> 'players';
  IF _players IS NULL OR jsonb_typeof(_players) <> 'array' THEN
    RETURN _row.state;
  END IF;

  FOR _i IN 0..(jsonb_array_length(_players) - 1) LOOP
    _p := _players -> _i;
    IF _i = _caller_slot THEN
      _new_players := _new_players || jsonb_build_array(_p);
    ELSE
      _new_players := _new_players || jsonb_build_array(
        (_p - 'hand')
        || jsonb_build_object(
             'hand', '[]'::jsonb,
             'handCount', coalesce(jsonb_array_length(_p -> 'hand'), 0)
           )
      );
    END IF;
  END LOOP;

  RETURN _row.state || jsonb_build_object('players', _new_players);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_state(uuid) TO authenticated;