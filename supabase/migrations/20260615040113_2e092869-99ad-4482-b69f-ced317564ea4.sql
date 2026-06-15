
-- =========================================================================
-- Batch A.1 — N-player schema foundations
-- =========================================================================

-- ---------- 1. game_match_players ----------------------------------------
CREATE TABLE public.game_match_players (
  match_id          uuid        NOT NULL REFERENCES public.game_matches(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot              smallint    NOT NULL CHECK (slot BETWEEN 0 AND 3),
  display_name      text        NOT NULL,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  -- A.4 columns reserved; unused in A.1.
  last_seen_at      timestamptz,
  disconnected_at   timestamptz,
  disconnect_reason text,
  status            text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','finalised','forfeit','conceded')),
  finalised_at      timestamptz,
  rank              smallint    CHECK (rank IS NULL OR rank BETWEEN 1 AND 4),
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, slot)
);

CREATE INDEX game_match_players_disconnected_idx
  ON public.game_match_players (match_id, disconnected_at)
  WHERE disconnected_at IS NOT NULL;

CREATE INDEX game_match_players_user_idx
  ON public.game_match_players (user_id);

GRANT SELECT ON public.game_match_players TO authenticated;
GRANT ALL    ON public.game_match_players TO service_role;

ALTER TABLE public.game_match_players ENABLE ROW LEVEL SECURITY;

-- A player can see all roster rows of a match they are in.
CREATE POLICY "players see their match roster"
  ON public.game_match_players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_match_players me
      WHERE me.match_id = game_match_players.match_id
        AND me.user_id  = auth.uid()
    )
  );


-- ---------- 2. game_match_player_states ----------------------------------
CREATE TABLE public.game_match_player_states (
  match_id   uuid        NOT NULL REFERENCES public.game_matches(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state      jsonb       NOT NULL,
  seq        bigint      NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX game_match_player_states_user_idx
  ON public.game_match_player_states (user_id);

GRANT SELECT ON public.game_match_player_states TO authenticated;
GRANT ALL    ON public.game_match_player_states TO service_role;

ALTER TABLE public.game_match_player_states ENABLE ROW LEVEL SECURITY;

-- A player can see only their own redacted state row.
CREATE POLICY "see only my redacted state"
  ON public.game_match_player_states
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_match_player_states;
ALTER TABLE public.game_match_player_states REPLICA IDENTITY FULL;


-- ---------- 3. game_matches additive/deprecation -------------------------
ALTER TABLE public.game_matches
  ADD COLUMN player_count smallint NOT NULL DEFAULT 2
    CHECK (player_count BETWEEN 2 AND 4);

COMMENT ON COLUMN public.game_matches.host_user_id  IS
  'DEPRECATED (A.1). Use public.game_match_players. Scheduled for removal in A.3 or later.';
COMMENT ON COLUMN public.game_matches.guest_user_id IS
  'DEPRECATED (A.1). Use public.game_match_players. Scheduled for removal in A.3 or later.';
COMMENT ON COLUMN public.game_matches.host_name     IS
  'DEPRECATED (A.1). Use public.game_match_players.display_name.';
COMMENT ON COLUMN public.game_matches.guest_name    IS
  'DEPRECATED (A.1). Use public.game_match_players.display_name.';


-- ---------- 4. Backfill --------------------------------------------------
DO $backfill$
DECLARE
  m record;
  _host_redacted  jsonb;
  _guest_redacted jsonb;
  _players        jsonb;
  _i              int;
  _np             jsonb;
BEGIN
  FOR m IN SELECT * FROM public.game_matches LOOP
    -- Roster rows
    IF m.host_user_id IS NOT NULL THEN
      INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
      VALUES (m.id, m.host_user_id, 0, COALESCE(NULLIF(m.host_name,''), 'Host'))
      ON CONFLICT DO NOTHING;
    END IF;
    IF m.guest_user_id IS NOT NULL THEN
      INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
      VALUES (m.id, m.guest_user_id, 1, COALESCE(NULLIF(m.guest_name,''), 'Guest'))
      ON CONFLICT DO NOTHING;
    END IF;

    -- Seed per-player state. For ranked matches we derive each player's
    -- redacted view from the canonical `state`; for solo we copy as-is.
    IF m.state IS NOT NULL THEN
      _players := m.state -> 'players';
      IF _players IS NOT NULL AND jsonb_typeof(_players) = 'array'
         AND jsonb_array_length(_players) >= 1 THEN
        -- Build per-slot redacted player arrays.
        -- Slot 0 = host visible, slot 1 redacted; and vice versa.
        IF m.host_user_id IS NOT NULL THEN
          _np := '[]'::jsonb;
          FOR _i IN 0..(jsonb_array_length(_players)-1) LOOP
            IF _i = 0 THEN
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
          _host_redacted := m.state || jsonb_build_object('players', _np);
          INSERT INTO public.game_match_player_states (match_id, user_id, state, seq)
          VALUES (m.id, m.host_user_id, _host_redacted, COALESCE(m.seq, 0))
          ON CONFLICT DO NOTHING;
        END IF;

        IF m.guest_user_id IS NOT NULL AND jsonb_array_length(_players) >= 2 THEN
          _np := '[]'::jsonb;
          FOR _i IN 0..(jsonb_array_length(_players)-1) LOOP
            IF _i = 1 THEN
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
          _guest_redacted := m.state || jsonb_build_object('players', _np);
          INSERT INTO public.game_match_player_states (match_id, user_id, state, seq)
          VALUES (m.id, m.guest_user_id, _guest_redacted, COALESCE(m.seq, 0))
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$backfill$;


-- ---------- 5. Drop public_state column ---------------------------------
ALTER TABLE public.game_matches DROP COLUMN IF EXISTS public_state;


-- ---------- 6. RPC: get_match_state (new body) --------------------------
CREATE OR REPLACE FUNCTION public.get_match_state(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row       public.game_matches;
  _is_player boolean;
  _state     jsonb;
BEGIN
  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Solo bot / non-ranked: trust the client; return the canonical state.
  IF _row.is_ranked IS NOT TRUE THEN
    IF _row.host_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'not a player in this match';
    END IF;
    RETURN _row.state;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_match_players
    WHERE match_id = _match_id AND user_id = auth.uid()
  ) INTO _is_player;
  IF NOT _is_player THEN
    RAISE EXCEPTION 'not a player in this match';
  END IF;

  SELECT state INTO _state
  FROM public.game_match_player_states
  WHERE match_id = _match_id AND user_id = auth.uid();

  -- Fallback: if a per-player row doesn't exist yet (race after a fresh
  -- accept_game_invite, before the first move), return the canonical state
  -- so the client can render.
  IF _state IS NULL THEN
    RETURN _row.state;
  END IF;
  RETURN _state;
END;
$$;


-- ---------- 7. RPC: accept_game_invite (now seeds new tables) -----------
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
  _players         jsonb;
  _np_host         jsonb;
  _np_guest        jsonb;
  _i               int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a match';
  END IF;

  _resolved_name := COALESCE(NULLIF(_guest_name, ''), 'Guest');

  SELECT id, host_user_id, guest_user_id, state
  INTO _match_id, _host_id, _existing_guest, _state
  FROM public.game_matches
  WHERE invite_token = _token
  LIMIT 1;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid';
  END IF;
  IF _host_id = auth.uid() THEN
    RAISE EXCEPTION 'You are signed in as the host of this match. Send this link to your friend, or sign out and use a different account to test joining.';
  END IF;
  IF _existing_guest IS NOT NULL AND _existing_guest <> auth.uid() THEN
    RAISE EXCEPTION 'This invite has already been accepted by someone else';
  END IF;

  UPDATE public.game_matches
    SET guest_user_id = auth.uid(),
        guest_name    = _resolved_name,
        status        = 'active',
        updated_at    = now()
  WHERE id = _match_id;

  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  VALUES (_match_id, auth.uid(), 1, _resolved_name)
  ON CONFLICT (match_id, user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name;

  -- Make sure the host row exists too (older matches may not have one yet
  -- if backfill hasn't run for any reason).
  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  SELECT _match_id, _host_id, 0, COALESCE(NULLIF(host_name,''), 'Host')
  FROM public.game_matches WHERE id = _match_id
  ON CONFLICT DO NOTHING;

  -- Seed per-player state rows from the current canonical state.
  IF _state IS NOT NULL THEN
    _players := _state -> 'players';
    IF _players IS NOT NULL AND jsonb_typeof(_players) = 'array' THEN
      _np_host := '[]'::jsonb;
      _np_guest := '[]'::jsonb;
      FOR _i IN 0..(jsonb_array_length(_players)-1) LOOP
        IF _i = 0 THEN
          _np_host  := _np_host  || jsonb_build_array(_players -> _i);
          _np_guest := _np_guest || jsonb_build_array(
            (_players -> _i) - 'hand'
            || jsonb_build_object(
              'hand', '[]'::jsonb,
              'handCount', COALESCE(jsonb_array_length((_players -> _i) -> 'hand'), 0)
            )
          );
        ELSE
          _np_guest := _np_guest || jsonb_build_array(_players -> _i);
          _np_host  := _np_host  || jsonb_build_array(
            (_players -> _i) - 'hand'
            || jsonb_build_object(
              'hand', '[]'::jsonb,
              'handCount', COALESCE(jsonb_array_length((_players -> _i) -> 'hand'), 0)
            )
          );
        END IF;
      END LOOP;

      INSERT INTO public.game_match_player_states (match_id, user_id, state, seq)
      VALUES (_match_id, _host_id,   _state || jsonb_build_object('players', _np_host),  0)
      ON CONFLICT (match_id, user_id) DO UPDATE
        SET state = EXCLUDED.state, updated_at = now();
      INSERT INTO public.game_match_player_states (match_id, user_id, state, seq)
      VALUES (_match_id, auth.uid(),_state || jsonb_build_object('players', _np_guest), 0)
      ON CONFLICT (match_id, user_id) DO UPDATE
        SET state = EXCLUDED.state, updated_at = now();
    END IF;
  END IF;

  RETURN _match_id;
END;
$$;


-- ---------- 8. RPC: commit_move (new signature; per-player states) ------
-- Drop the old 8-arg signature; create the new 7-arg form.
DROP FUNCTION IF EXISTS public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean);

CREATE OR REPLACE FUNCTION public.commit_move(
  _match_id      uuid,
  _expected_seq  bigint,
  _actor         uuid,
  _move          jsonb,
  _new_state     jsonb,
  _player_states jsonb,             -- [{user_id, state}, ...]
  _winner        uuid DEFAULT NULL,
  _finished      boolean DEFAULT false
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

  -- Per-player redacted states (one row per element).
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

  RETURN jsonb_build_object('seq', _next_seq, 'ok', true);
END;
$$;


-- ---------- 9. RPC: finalise_ranked_match — reserved _reason param ------
DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid);

CREATE OR REPLACE FUNCTION public.finalise_ranked_match(
  _match_id uuid,
  _reason   text DEFAULT 'normal'   -- A.4 will pass 'opponent_forfeit'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- _reason is reserved for A.4 (forfeit handling). Currently unused.
  PERFORM _reason;

  SELECT * INTO _row FROM public.game_matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'finished' OR _row.is_ranked IS NOT TRUE THEN
    RETURN;
  END IF;
  IF _row.guest_user_id IS NULL OR _row.host_user_id IS NULL THEN
    RETURN;
  END IF;
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

  PERFORM public.bump_player_progress(
    _row.host_user_id,
    CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN _pts_win ELSE 0 END,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_win ELSE _elo_loss END
  );
  PERFORM public.bump_player_progress(
    _row.guest_user_id,
    CASE WHEN _draw THEN _pts_draw WHEN _host_won THEN 0 ELSE _pts_win END,
    '{}'::text[],
    CASE WHEN _draw THEN NULL ELSE NOT _host_won END,
    false,
    CASE WHEN _draw THEN 0 WHEN _host_won THEN _elo_loss ELSE _elo_win END
  );

  UPDATE public.game_matches
     SET state = state || jsonb_build_object('__finalised', true)
   WHERE id = _match_id;
END;
$$;


-- ---------- 10. RPC: list_my_active_matches -----------------------------
CREATE OR REPLACE FUNCTION public.list_my_active_matches()
RETURNS SETOF public.game_matches
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.game_matches m
  WHERE auth.uid() IS NOT NULL
    AND m.status <> 'finished'
    AND (
      m.host_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.game_match_players gmp
        WHERE gmp.match_id = m.id AND gmp.user_id = auth.uid()
      )
    )
  ORDER BY m.updated_at DESC
  LIMIT 10;
$$;
