CREATE OR REPLACE FUNCTION public.commit_start_lobby(
  _match_id          uuid,
  _expected_seq      bigint,
  _actor             uuid,
  _move              jsonb,
  _new_state         jsonb,
  _player_states     jsonb,
  _slot_remap        jsonb,
  _new_player_count  int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_seq  bigint;
  _current_stat match_status;
  _is_host      boolean;
  _lobby_mode   boolean;
  _next_seq     bigint;
  _r            jsonb;
  _ps           jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _actor THEN
    RAISE EXCEPTION 'actor must equal authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT seq, status, COALESCE(lobby_mode, false)
    INTO _current_seq, _current_stat, _lobby_mode
  FROM public.game_matches
  WHERE id = _match_id
  FOR UPDATE;

  IF _current_seq IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _lobby_mode THEN
    RAISE EXCEPTION 'not a lobby match' USING ERRCODE = '22023';
  END IF;

  IF _current_stat <> 'waiting' THEN
    RAISE EXCEPTION 'lobby already started or closed' USING ERRCODE = '22023';
  END IF;

  IF _current_seq <> _expected_seq THEN
    RAISE EXCEPTION 'stale seq: expected % got %', _current_seq, _expected_seq
      USING ERRCODE = '40001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_match_players
     WHERE match_id = _match_id AND user_id = _actor AND slot = 0
  ) INTO _is_host;

  IF NOT _is_host THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;

  IF _slot_remap IS NOT NULL AND jsonb_typeof(_slot_remap) = 'array' THEN
    FOR _r IN SELECT * FROM jsonb_array_elements(_slot_remap) LOOP
      UPDATE public.game_match_players
         SET slot = -1 - (_r ->> 'old_slot')::int
       WHERE match_id = _match_id
         AND slot     = (_r ->> 'old_slot')::int;
    END LOOP;

    FOR _r IN SELECT * FROM jsonb_array_elements(_slot_remap) LOOP
      UPDATE public.game_match_players
         SET slot = (_r ->> 'new_slot')::int
       WHERE match_id = _match_id
         AND slot     = -1 - (_r ->> 'old_slot')::int;
    END LOOP;
  END IF;

  _next_seq := _current_seq + 1;

  INSERT INTO public.game_match_moves (match_id, seq, actor, move)
    VALUES (_match_id, _next_seq, _actor, _move);

  UPDATE public.game_matches
     SET state           = _new_state,
         seq             = _next_seq,
         player_count    = _new_player_count,
         status          = 'active'::match_status,
         started_at      = now(),
         turn_started_at = now(),
         last_action_by  = _actor,
         updated_at      = now()
   WHERE id = _match_id;

  UPDATE public.game_match_players
     SET last_seen_at      = now(),
         disconnected_at   = NULL,
         disconnect_reason = NULL
   WHERE match_id = _match_id
     AND status   = 'active';

  IF _player_states IS NOT NULL AND jsonb_typeof(_player_states) = 'array' THEN
    FOR _ps IN SELECT * FROM jsonb_array_elements(_player_states) LOOP
      INSERT INTO public.game_match_player_states (match_id, user_id, state, seq, updated_at)
      VALUES (
        _match_id,
        (_ps ->> 'user_id')::uuid,
        _ps -> 'state',
        _next_seq,
        now()
      )
      ON CONFLICT (match_id, user_id) DO UPDATE
        SET state      = EXCLUDED.state,
            seq        = EXCLUDED.seq,
            updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('seq', _next_seq, 'ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_game_invite(_token text, _guest_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _match_id        uuid;
  _host_id         uuid;
  _existing_guest  uuid;
  _state           jsonb;
  _resolved_name   text;
  _player_count    smallint;
  _next_slot       smallint;
  _existing_slot   smallint;
  _is_lobby        boolean;
  _players         jsonb;
  _np              jsonb;
  _slot_i          int;
  _i               int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a match';
  END IF;

  _resolved_name := COALESCE(NULLIF(_guest_name, ''), 'Guest');

  SELECT id, host_user_id, guest_user_id, state, COALESCE(player_count, 2), COALESCE(lobby_mode, false)
    INTO _match_id, _host_id, _existing_guest, _state, _player_count, _is_lobby
  FROM public.game_matches
  WHERE invite_token = _token
  LIMIT 1;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid';
  END IF;

  IF _host_id = auth.uid() THEN
    RAISE EXCEPTION 'You are signed in as the host of this match. Send this link to a friend, or sign out and use a different account to test joining.';
  END IF;

  SELECT slot INTO _existing_slot
    FROM public.game_match_players
   WHERE match_id = _match_id AND user_id = auth.uid();

  IF _existing_slot IS NOT NULL THEN
    RETURN _match_id;
  END IF;

  SELECT min(s.slot) INTO _next_slot
    FROM generate_series(1, _player_count - 1) AS s(slot)
   WHERE NOT EXISTS (
      SELECT 1 FROM public.game_match_players gmp
       WHERE gmp.match_id = _match_id AND gmp.slot = s.slot
   );

  IF _next_slot IS NULL THEN
    RAISE EXCEPTION 'This match is full';
  END IF;

  IF _next_slot = 1 THEN
    UPDATE public.game_matches
       SET guest_user_id = auth.uid(),
           guest_name    = _resolved_name,
           updated_at    = now()
     WHERE id = _match_id;
  END IF;

  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  VALUES (_match_id, auth.uid(), _next_slot, _resolved_name)
  ON CONFLICT (match_id, user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name;

  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  SELECT _match_id, _host_id, 0, COALESCE(NULLIF(host_name,''), 'Host')
  FROM public.game_matches WHERE id = _match_id
  ON CONFLICT DO NOTHING;

  IF NOT _is_lobby
     AND (SELECT count(*) FROM public.game_match_players WHERE match_id = _match_id) >= _player_count THEN
    UPDATE public.game_matches
       SET status          = 'active',
           started_at      = now(),
           turn_started_at = now(),
           updated_at      = now()
     WHERE id = _match_id AND status <> 'finished';
  END IF;

  IF _state IS NOT NULL THEN
    _players := _state -> 'players';
    IF _players IS NOT NULL AND jsonb_typeof(_players) = 'array' THEN
      FOR _slot_i IN 0..(_player_count - 1) LOOP
        DECLARE _uid uuid;
        BEGIN
          SELECT user_id INTO _uid
            FROM public.game_match_players
           WHERE match_id = _match_id AND slot = _slot_i;

          IF _uid IS NULL THEN CONTINUE; END IF;

          _np := '[]'::jsonb;
          FOR _i IN 0..(jsonb_array_length(_players)-1) LOOP
            IF _i = _slot_i THEN
              _np := _np || jsonb_build_array(_players -> _i);
            ELSE
              _np := _np || jsonb_build_array(
                (_players -> _i) - 'hand'
                || jsonb_build_object(
                  'hand', '[]'::jsonb,
                  'handCount', COALESCE(jsonb_array_length((_players -> _i) -> 'hand'), 0)
                )
              );
            END IF;
          END LOOP;

          INSERT INTO public.game_match_player_states (match_id, user_id, state, seq)
          VALUES (_match_id, _uid, _state || jsonb_build_object('players', _np), 0)
          ON CONFLICT (match_id, user_id) DO UPDATE
            SET state = EXCLUDED.state, updated_at = now();
        END;
      END LOOP;
    END IF;
  END IF;

  RETURN _match_id;
END;
$function$;