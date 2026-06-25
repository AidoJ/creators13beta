
-- B fix: atomic lobby trim + start.
--
-- Replaces the roster-full gate with host-start-with-2+. When the host fires
-- `start_lobby_match`, the edge function passes us the trimmed state plus a
-- slot remap. We do all four DB writes in a single transaction:
--   1. Re-index public.game_match_players.slot contiguously 0..N-1
--      (two-pass to dodge the UNIQUE (match_id, slot) constraint).
--   2. Write the trimmed game state + new player_count + status='active'
--      + bumped seq on public.game_matches.
--   3. Upsert per-player redacted states into game_match_player_states.
--   4. Append the move into game_match_moves.
-- A partial trim would corrupt the match from move 1, so this MUST run atomic.

CREATE OR REPLACE FUNCTION public.commit_start_lobby(
  _match_id          uuid,
  _expected_seq      bigint,
  _actor             uuid,
  _move              jsonb,
  _new_state         jsonb,
  _player_states     jsonb,    -- [{user_id, state}, ...]
  _slot_remap        jsonb,    -- [{old_slot:int, new_slot:int}, ...]
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

  -- Caller must be the host (slot 0).
  SELECT EXISTS (
    SELECT 1 FROM public.game_match_players
     WHERE match_id = _match_id
       AND user_id  = _actor
       AND slot     = 0
  ) INTO _is_host;
  IF NOT _is_host THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;

  -- Step 1a — park all remapped rows at negative slots so the UNIQUE
  -- constraint doesn't fire mid-remap.
  IF _slot_remap IS NOT NULL AND jsonb_typeof(_slot_remap) = 'array' THEN
    FOR _r IN SELECT * FROM jsonb_array_elements(_slot_remap) LOOP
      UPDATE public.game_match_players
         SET slot = -1 - (_r ->> 'old_slot')::int
       WHERE match_id = _match_id
         AND slot     = (_r ->> 'old_slot')::int;
    END LOOP;
    -- Step 1b — settle to the new contiguous slots.
    FOR _r IN SELECT * FROM jsonb_array_elements(_slot_remap) LOOP
      UPDATE public.game_match_players
         SET slot = (_r ->> 'new_slot')::int
       WHERE match_id = _match_id
         AND slot     = -1 - (_r ->> 'old_slot')::int;
    END LOOP;
  END IF;

  _next_seq := _current_seq + 1;

  -- Step 4 — move log.
  INSERT INTO public.game_match_moves (match_id, seq, actor, move)
    VALUES (_match_id, _next_seq, _actor, _move);

  -- Step 2 — trimmed state + new player_count + flip to active.
  UPDATE public.game_matches
     SET state          = _new_state,
         seq            = _next_seq,
         player_count   = _new_player_count,
         status         = 'active'::match_status,
         last_action_by = _actor,
         updated_at     = now()
   WHERE id = _match_id;

  -- Step 3 — per-player redacted states.
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

REVOKE ALL ON FUNCTION public.commit_start_lobby(uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_start_lobby(uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, int) TO service_role;
