-- 1. commit_move: terminal error for finished matches (non-retryable)
CREATE OR REPLACE FUNCTION public.commit_move(_match_id uuid, _expected_seq bigint, _actor uuid, _move jsonb, _new_state jsonb, _player_states jsonb, _winner uuid DEFAULT NULL::uuid, _finished boolean DEFAULT false, _placements jsonb DEFAULT NULL::jsonb, _bump_turn boolean DEFAULT false, _activate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_seq bigint;
  _status      match_status;
  _is_player   boolean;
  _ps          jsonb;
  _pl          jsonb;
  _next_seq    bigint;
  _now         timestamptz := now();
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _actor THEN
    RAISE EXCEPTION 'actor must equal authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT seq, status INTO _current_seq, _status
  FROM public.game_matches
  WHERE id = _match_id
  FOR UPDATE;

  IF _current_seq IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  -- TERMINAL: a finished match can never accept another move. This must NOT
  -- be a retryable "stale seq" error — a retry loop against a finished match
  -- previously hammered the database indefinitely.
  IF _status = 'finished' THEN
    RAISE EXCEPTION 'match already finished' USING ERRCODE = 'P0004';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_match_players
    WHERE match_id = _match_id AND user_id = _actor
  ) INTO _is_player;
  IF NOT _is_player THEN
    RAISE EXCEPTION 'actor is not a player in this match' USING ERRCODE = '42501';
  END IF;

  IF _current_seq <> _expected_seq THEN
    RAISE EXCEPTION 'stale seq: expected % got %', _current_seq, _expected_seq
      USING ERRCODE = '40001';
  END IF;

  _next_seq := _current_seq + 1;

  INSERT INTO public.game_match_moves (match_id, seq, actor, move)
    VALUES (_match_id, _next_seq, _actor, _move);

  UPDATE public.game_matches
     SET state          = _new_state,
         seq            = _next_seq,
         last_action_by = _actor,
         winner_user_id = CASE WHEN _finished THEN _winner ELSE winner_user_id END,
         status         = CASE
                            WHEN _finished THEN 'finished'::match_status
                            WHEN _activate AND status = 'waiting' THEN 'active'::match_status
                            ELSE status
                          END,
         turn_started_at = CASE
                             WHEN _finished THEN turn_started_at
                             WHEN _bump_turn OR _activate THEN _now
                             ELSE turn_started_at
                           END,
         started_at     = CASE
                            WHEN _activate AND started_at IS NULL THEN _now
                            ELSE started_at
                          END,
         updated_at     = _now
   WHERE id = _match_id;

  IF _bump_turn AND NOT _finished THEN
    UPDATE public.game_match_players
       SET idle_strikes = 0
     WHERE match_id = _match_id
       AND user_id = _actor
       AND idle_strikes > 0;
  END IF;

  IF _player_states IS NOT NULL AND jsonb_typeof(_player_states) = 'array' THEN
    FOR _ps IN SELECT * FROM jsonb_array_elements(_player_states) LOOP
      INSERT INTO public.game_match_player_states (match_id, user_id, state, seq, updated_at)
      VALUES (
        _match_id,
        (_ps ->> 'user_id')::uuid,
        _ps -> 'state',
        _next_seq,
        _now
      )
      ON CONFLICT (match_id, user_id) DO UPDATE
        SET state = EXCLUDED.state,
            seq = EXCLUDED.seq,
            updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;

  IF _placements IS NOT NULL AND jsonb_typeof(_placements) = 'array' THEN
    FOR _pl IN SELECT * FROM jsonb_array_elements(_placements) LOOP
      UPDATE public.game_match_players
         SET rank         = (_pl ->> 'rank')::smallint,
             status       = COALESCE(_pl ->> 'status', 'finalised'),
             finalised_at = COALESCE(finalised_at, _now)
       WHERE match_id = _match_id
         AND user_id = (_pl ->> 'user_id')::uuid;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('seq', _next_seq, 'turn_started_at', _now);
END;
$function$;

-- 2. Abandoned-match reaper.
CREATE OR REPLACE FUNCTION public.reap_abandoned_matches(
  _lobby_idle_minutes integer DEFAULT 15,
  _active_idle_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
  _m record;
  _lobbies int := 0;
  _actives int := 0;
BEGIN
  FOR _m IN
    SELECT id, seq, status, host_user_id
    FROM public.game_matches
    WHERE status IN ('waiting','active')
      AND updated_at < _now - make_interval(mins =>
            CASE WHEN status = 'waiting' THEN _lobby_idle_minutes ELSE _active_idle_minutes END)
    ORDER BY updated_at
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.game_matches
       SET status = 'finished',
           winner_user_id = NULL,
           seq = _m.seq + 1,
           updated_at = _now
     WHERE id = _m.id;

    UPDATE public.game_match_players
       SET status = 'finalised',
           finalised_at = COALESCE(finalised_at, _now)
     WHERE match_id = _m.id
       AND finalised_at IS NULL;

    -- Audit trail so an auto-closed match doesn't just vanish.
    INSERT INTO public.game_match_moves (match_id, seq, actor, move)
    VALUES (
      _m.id,
      _m.seq + 1,
      _m.host_user_id,
      jsonb_build_object(
        'type', 'auto_abandon',
        'prior_status', _m.status,
        'reason', CASE WHEN _m.status = 'waiting' THEN 'lobby_idle' ELSE 'match_idle' END,
        'at', _now
      )
    )
    ON CONFLICT DO NOTHING;

    IF _m.status = 'waiting' THEN _lobbies := _lobbies + 1; ELSE _actives := _actives + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('lobbies_closed', _lobbies, 'matches_closed', _actives);
END;
$function$;

REVOKE ALL ON FUNCTION public.reap_abandoned_matches(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_abandoned_matches(integer, integer) TO service_role;