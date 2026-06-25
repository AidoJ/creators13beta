CREATE OR REPLACE FUNCTION public.register_lobby_host_roster(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_name text;
  v_lobby boolean;
  v_status text;
BEGIN
  SELECT host_user_id, host_name, lobby_mode, status
    INTO v_host, v_name, v_lobby, v_status
    FROM public.game_matches
   WHERE id = _match_id;

  IF v_host IS NULL THEN
    RAISE EXCEPTION 'match not found';
  END IF;
  IF v_host <> auth.uid() THEN
    RAISE EXCEPTION 'only the host can register the host roster';
  END IF;
  IF v_lobby IS NOT TRUE THEN
    RAISE EXCEPTION 'not a lobby match';
  END IF;
  IF v_status <> 'waiting' THEN
    RAISE EXCEPTION 'lobby is not in waiting state';
  END IF;

  INSERT INTO public.game_match_players (match_id, user_id, slot, display_name)
  VALUES (_match_id, v_host, 0, COALESCE(v_name, 'Host'))
  ON CONFLICT (match_id, slot) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_lobby_host_roster(uuid) TO authenticated;