-- 1. Harden commit_move: bind _actor to auth.uid() for end-user calls.
CREATE OR REPLACE FUNCTION public.commit_move(_match_id uuid, _expected_seq bigint, _actor uuid, _move jsonb, _new_state jsonb, _public_state jsonb, _winner uuid DEFAULT NULL::uuid, _finished boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_seq bigint;
  _is_player   boolean;
BEGIN
  -- End-user calls must act as themselves. The trusted server path
  -- (service_role from apply-move edge fn) has auth.uid() = NULL and may
  -- attribute the move to either player after its own validation.
  IF auth.uid() IS NOT NULL AND auth.uid() <> _actor THEN
    RAISE EXCEPTION 'actor must equal authenticated user' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- 2. Belt-and-braces: explicit revokes so these RPCs are only reachable via
-- service_role (edge functions / admin tooling). The in-function auth checks
-- already cover this; the revokes make the threat model self-documenting.
REVOKE EXECUTE ON FUNCTION public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reset_player_progress(uuid) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_player_progress(uuid, integer, text[], boolean, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_player_progress(uuid) TO service_role;