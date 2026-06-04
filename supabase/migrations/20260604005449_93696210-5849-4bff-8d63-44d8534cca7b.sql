-- Step 2: thin commit RPC. Edge function does validation; this just persists
-- with optimistic concurrency on (match_id, seq).

CREATE OR REPLACE FUNCTION public.commit_move(
  _match_id      uuid,
  _expected_seq  bigint,
  _actor         uuid,
  _move          jsonb,
  _new_state     jsonb,
  _public_state  jsonb,
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
BEGIN
  -- Lock the match row.
  SELECT seq,
         (host_user_id = _actor OR guest_user_id = _actor)
    INTO _current_seq, _is_player
    FROM public.game_matches
   WHERE id = _match_id
   FOR UPDATE;

  IF _current_seq IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _is_player THEN
    RAISE EXCEPTION 'actor is not a player in this match' USING ERRCODE = '42501';
  END IF;

  IF _current_seq <> _expected_seq THEN
    -- Stale client. Caller should refetch.
    RAISE EXCEPTION 'stale seq: expected % got %', _current_seq, _expected_seq
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.game_match_moves (match_id, seq, actor, move)
    VALUES (_match_id, _current_seq + 1, _actor, _move);

  UPDATE public.game_matches
     SET state          = _new_state,
         public_state   = _public_state,
         seq            = _current_seq + 1,
         last_action_by = _actor,
         winner_user_id = CASE WHEN _finished THEN _winner ELSE winner_user_id END,
         status         = CASE WHEN _finished THEN 'finished'::match_status ELSE status END,
         updated_at     = now()
   WHERE id = _match_id;

  RETURN jsonb_build_object('seq', _current_seq + 1, 'ok', true);
END;
$$;

-- Only the service role (edge functions) may call this.
REVOKE ALL ON FUNCTION public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean) TO service_role;
