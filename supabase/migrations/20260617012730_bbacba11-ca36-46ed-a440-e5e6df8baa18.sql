-- =========================================================================
-- A.3 — Multiplayer integration
-- =========================================================================

-- ---------- 1. accept_game_invite: support slots 1..N-1 -----------------
CREATE OR REPLACE FUNCTION public.accept_game_invite(_token text, _guest_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match_id        uuid;
  _host_id         uuid;
  _existing_guest  uuid;
  _state           jsonb;
  _resolved_name   text;
  _player_count    smallint;
  _next_slot       smallint;
  _existing_slot   smallint;
  _players         jsonb;
  _np              jsonb;
  _slot_i          int;
  _i               int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a match';
  END IF;

  _resolved_name := COALESCE(NULLIF(_guest_name, ''), 'Guest');

  SELECT id, host_user_id, guest_user_id, state, COALESCE(player_count, 2)
    INTO _match_id, _host_id, _existing_guest, _state, _player_count
  FROM public.game_matches
  WHERE invite_token = _token
  LIMIT 1;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid';
  END IF;
  IF _host_id = auth.uid() THEN
    RAISE EXCEPTION 'You are signed in as the host of this match. Send this link to a friend, or sign out and use a different account to test joining.';
  END IF;

  -- If the user is already in the roster (re-opening invite), succeed idempotently.
  SELECT slot INTO _existing_slot
    FROM public.game_match_players
   WHERE match_id = _match_id AND user_id = auth.uid();
  IF _existing_slot IS NOT NULL THEN
    RETURN _match_id;
  END IF;

  -- Find the next free slot (1..player_count-1).
  SELECT min(s.slot) INTO _next_slot
    FROM generate_series(1, _player_count - 1) AS s(slot)
   WHERE NOT EXISTS (
      SELECT 1 FROM public.game_match_players gmp
       WHERE gmp.match_id = _match_id AND gmp.slot = s.slot
   );
  IF _next_slot IS NULL THEN
    RAISE EXCEPTION 'This match is full';
  END IF;

  -- For 2-player matches keep updating the legacy guest_* columns so the
  -- rest of the code path (which still reads them in places) stays sane.
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

  -- Ensure host roster row exists (defensive).
  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  SELECT _match_id, _host_id, 0, COALESCE(NULLIF(host_name,''), 'Host')
  FROM public.game_matches WHERE id = _match_id
  ON CONFLICT DO NOTHING;

  -- Once the final slot is filled, flip the match to 'active'.
  IF (SELECT count(*) FROM public.game_match_players WHERE match_id = _match_id) >= _player_count THEN
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
$$;


-- ---------- 2. commit_move: accept placements snapshot -------------------
DROP FUNCTION IF EXISTS public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean);
DROP FUNCTION IF EXISTS public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.commit_move(
  _match_id      uuid,
  _expected_seq  bigint,
  _actor         uuid,
  _move          jsonb,
  _new_state     jsonb,
  _player_states jsonb,
  _winner        uuid    DEFAULT NULL,
  _finished      boolean DEFAULT false,
  _placements    jsonb   DEFAULT NULL    -- A.3: [{playerId, rank, userId, status}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_seq bigint;
  _is_player   boolean;
  _ps          jsonb;
  _pl          jsonb;
  _next_seq    bigint;
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

  UPDATE public.game_matches
     SET state          = _new_state,
         seq            = _next_seq,
         last_action_by = _actor,
         winner_user_id = CASE WHEN _finished THEN _winner ELSE winner_user_id END,
         status         = CASE WHEN _finished THEN 'finished'::match_status ELSE status END,
         updated_at     = now()
   WHERE id = _match_id;

  -- Per-player redacted states (one row per player).
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
        SET state = EXCLUDED.state,
            seq = EXCLUDED.seq,
            updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;

  -- A.3 — sync placements (rank/status/finalised_at) into roster table.
  -- Idempotent: caller passes the full snapshot every move when a player
  -- has been finalised; rows for still-active players are left alone.
  IF _placements IS NOT NULL AND jsonb_typeof(_placements) = 'array' THEN
    FOR _pl IN SELECT * FROM jsonb_array_elements(_placements) LOOP
      UPDATE public.game_match_players
         SET rank         = (_pl ->> 'rank')::smallint,
             status       = COALESCE(_pl ->> 'status', 'finalised'),
             finalised_at = COALESCE(finalised_at, now())
       WHERE match_id = _match_id
         AND user_id  = (_pl ->> 'user_id')::uuid;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('seq', _next_seq, 'ok', true);
END;
$$;


-- ---------- 3. finalise_ranked_match: N-player ELO + points -------------
DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid, text);
DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid);

CREATE OR REPLACE FUNCTION public.finalise_ranked_match(
  _match_id   uuid,
  _reason     text  DEFAULT 'normal',
  _placements jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row       public.game_matches;
  _settings  public.game_settings;
  _pts_win   int;
  _elo_k     int;
  _player_count int;
  -- Pairwise ELO state
  _i record;
  _j record;
  _expected numeric;
  _score    numeric;
  _delta    numeric;
  _sum_delta numeric;
  _elo_delta int;
  _points    int;
  _won_bool  boolean;
BEGIN
  PERFORM _reason;  -- 'normal' | 'opponent_forfeit' (treated the same in A.3)

  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'finished' OR _row.is_ranked IS NOT TRUE THEN
    RETURN;
  END IF;
  IF coalesce((_row.state ->> '__finalised')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT * INTO _settings FROM public.game_settings ORDER BY updated_at DESC LIMIT 1;
  _pts_win := coalesce(_settings.points_per_win, 10);
  _elo_k   := coalesce(_settings.elo_win, 16);
  _player_count := coalesce(_row.player_count, 2);

  -- =====================================================================
  -- 2-player path — REGRESSION GATE.
  -- Preserves the prior flat ±elo_win / points_per_win behaviour exactly.
  -- =====================================================================
  IF _player_count <= 2 THEN
    DECLARE
      _host_won boolean := _row.winner_user_id = _row.host_user_id;
      _draw     boolean := _row.winner_user_id IS NULL;
      _pts_draw int     := _pts_win / 2;
      _elo_loss int     := coalesce(_settings.elo_loss, -16);
    BEGIN
      IF _row.host_user_id IS NULL OR _row.guest_user_id IS NULL THEN
        RETURN;
      END IF;
      PERFORM public.bump_player_progress(
        _row.host_user_id,
        CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_win ELSE 0 END,
        '{}'::text[],
        CASE WHEN _draw THEN NULL ELSE _host_won END,
        false,
        CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_k ELSE _elo_loss END
      );
      PERFORM public.bump_player_progress(
        _row.guest_user_id,
        CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN 0 ELSE _pts_win END,
        '{}'::text[],
        CASE WHEN _draw THEN NULL ELSE NOT _host_won END,
        false,
        CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_loss ELSE _elo_k END
      );
      UPDATE public.game_matches
         SET state = state || jsonb_build_object('__finalised', true)
       WHERE id = _match_id;
      RETURN;
    END;
  END IF;

  -- =====================================================================
  -- 3+ player path — averaged pairwise ELO + coupon-economy points.
  --
  --   Points: winner gets 6 (3p) / 8 (4p), every other ranked player gets 1.
  --   ELO:    for each pair (i,j), expected = 1/(1+10^((Rj-Ri)/400));
  --           score = 1 if i ranked above j, 0.5 if tied, 0 if below;
  --           delta_i = K * (S - E); sum across N-1 opponents, then divide
  --           by (N-1) so per-match rating volatility stays comparable
  --           across player counts.
  -- =====================================================================

  -- Prefer the placements payload from apply-move; fall back to the
  -- ranks stored on game_match_players (set by commit_move).
  IF _placements IS NOT NULL AND jsonb_typeof(_placements) = 'array' THEN
    -- Stage placements into a temp table for easy join.
    DROP TABLE IF EXISTS _np_ranks;
    CREATE TEMP TABLE _np_ranks (
      user_id uuid PRIMARY KEY,
      rank    smallint NOT NULL,
      elo     int      NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _np_ranks (user_id, rank, elo)
    SELECT (el ->> 'user_id')::uuid,
           (el ->> 'rank')::smallint,
           coalesce(
             (SELECT pp.elo FROM public.player_progress pp WHERE pp.user_id = (el ->> 'user_id')::uuid),
             1000
           )
    FROM jsonb_array_elements(_placements) el
    WHERE (el ->> 'user_id') IS NOT NULL AND (el ->> 'rank') IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DROP TABLE IF EXISTS _np_ranks;
    CREATE TEMP TABLE _np_ranks (
      user_id uuid PRIMARY KEY,
      rank    smallint NOT NULL,
      elo     int      NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _np_ranks (user_id, rank, elo)
    SELECT gmp.user_id,
           gmp.rank,
           coalesce(
             (SELECT pp.elo FROM public.player_progress pp WHERE pp.user_id = gmp.user_id),
             1000
           )
    FROM public.game_match_players gmp
    WHERE gmp.match_id = _match_id AND gmp.rank IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF (SELECT count(*) FROM _np_ranks) < 2 THEN
    -- Not enough rank info — skip rather than mis-credit.
    UPDATE public.game_matches
       SET state = state || jsonb_build_object('__finalised', true)
     WHERE id = _match_id;
    RETURN;
  END IF;

  FOR _i IN SELECT user_id, rank, elo FROM _np_ranks LOOP
    _sum_delta := 0;
    FOR _j IN SELECT user_id, rank, elo FROM _np_ranks WHERE user_id <> _i.user_id LOOP
      _expected := 1.0 / (1.0 + power(10.0, (_j.elo - _i.elo) / 400.0));
      _score := CASE
        WHEN _i.rank < _j.rank THEN 1.0   -- lower rank number = better finish
        WHEN _i.rank = _j.rank THEN 0.5
        ELSE 0.0
      END;
      _delta := _elo_k * (_score - _expected);
      _sum_delta := _sum_delta + _delta;
    END LOOP;
    _elo_delta := round(_sum_delta / GREATEST(1, _player_count - 1))::int;

    -- Coupon-economy points: winner (rank 1) gets 6/8; everyone else 1.
    IF _i.rank = 1 THEN
      _points := CASE _player_count WHEN 3 THEN 6 WHEN 4 THEN 8 ELSE _pts_win END;
      _won_bool := true;
    ELSE
      _points := 1;
      _won_bool := false;
    END IF;

    PERFORM public.bump_player_progress(
      _i.user_id,
      _points,
      '{}'::text[],
      _won_bool,
      false,
      _elo_delta
    );
  END LOOP;

  UPDATE public.game_matches
     SET state = state || jsonb_build_object('__finalised', true)
   WHERE id = _match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text, jsonb) FROM PUBLIC, authenticated;