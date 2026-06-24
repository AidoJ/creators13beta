
ALTER TABLE public.game_matches
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS lobby_mode boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS game_matches_invite_code_key ON public.game_matches (invite_code) WHERE invite_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_match_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  new_code text;
  i int;
  exists_already boolean;
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS (SELECT 1 FROM public.game_matches WHERE invite_code = new_code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_match_invite_code(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT invite_token
  FROM public.game_matches
  WHERE invite_code = upper(trim(_code))
    AND status <> 'finished'
  LIMIT 1;
$$;

-- accept_game_invite: only auto-flip to active when NOT a lobby-mode match.
-- Lobby-mode matches stay 'waiting' until the host explicitly starts via
-- the start_lobby_match move in apply-move.
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

  -- Auto-flip to 'active' ONLY for legacy (non-lobby) matches when full.
  -- Lobby-mode matches stay 'waiting' until the host triggers start.
  IF NOT _is_lobby
     AND (SELECT count(*) FROM public.game_match_players WHERE match_id = _match_id) >= _player_count THEN
    UPDATE public.game_matches
       SET status = 'active', updated_at = now()
     WHERE id = _match_id AND status <> 'finished';
  END IF;

  -- Seed/refresh per-player redacted state rows from the canonical state.
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

-- Host-only lobby cancel: closes the lobby and marks the match finished
-- (no winner). Used by the lobby UI's "Cancel lobby" button.
CREATE OR REPLACE FUNCTION public.cancel_lobby_match(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host uuid;
  _status text;
  _is_lobby boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  SELECT host_user_id, status::text, COALESCE(lobby_mode, false)
    INTO _host, _status, _is_lobby
    FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF _host <> auth.uid() THEN RAISE EXCEPTION 'host only' USING ERRCODE = '42501'; END IF;
  IF NOT _is_lobby THEN RAISE EXCEPTION 'not a lobby match'; END IF;
  IF _status = 'active' OR _status = 'finished' THEN
    RAISE EXCEPTION 'lobby cannot be cancelled once active';
  END IF;
  UPDATE public.game_matches
     SET status = 'finished',
         updated_at = now()
   WHERE id = _match_id;
END;
$$;
