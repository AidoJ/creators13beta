CREATE OR REPLACE FUNCTION public.commit_move(
  _match_id uuid,
  _expected_seq bigint,
  _actor uuid,
  _move jsonb,
  _new_state jsonb,
  _player_states jsonb,
  _winner uuid DEFAULT NULL::uuid,
  _finished boolean DEFAULT false,
  _placements jsonb DEFAULT NULL::jsonb,
  _bump_turn boolean DEFAULT false,
  _activate boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_seq bigint;
  _is_player   boolean;
  _ps          jsonb;
  _pl          jsonb;
  _next_seq    bigint;
  _now         timestamptz := now();
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _actor THEN
    RAISE EXCEPTION 'actor must equal authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT seq INTO _current_seq
  FROM public.game_matches
  WHERE id = _match_id
  FOR UPDATE;

  IF _current_seq IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
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

  -- Atomic: state + seq + turn stopwatch + lobby activation in ONE write.
  -- A turn can therefore never begin with a stale/absent turn_started_at.
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

  -- Consecutive idle strikes reset on any real action by the actor.
  IF _bump_turn AND NOT _finished THEN
    UPDATE public.game_match_players
       SET idle_strikes = 0
     WHERE match_id = _match_id
       AND user_id = _actor
       AND idle_strikes > 0;
  END IF;

  -- Per-player redacted states (one row per player).
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

  -- A.3 — sync placements (rank/status/finalised_at) into roster table.
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

-- Single-flight lease for background sweeps. Returns true only to the caller
-- that wins the lease; expired leases are reclaimable.
CREATE OR REPLACE FUNCTION public.acquire_sweep_lease(_key text, _ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _acquired boolean := false;
BEGIN
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES (
    'sweep_lease:' || _key,
    jsonb_build_object('expires_at', (now() + make_interval(secs => _ttl_seconds))),
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('expires_at', (now() + make_interval(secs => _ttl_seconds))),
        updated_at = now()
    WHERE (public.system_settings.value ->> 'expires_at')::timestamptz < now()
  RETURNING true INTO _acquired;

  RETURN COALESCE(_acquired, false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.acquire_sweep_lease(text, integer) TO service_role;