-- A.2 — extend finalise_ranked_match RPC to accept N-player placements.
-- Adds `_placements jsonb DEFAULT NULL` so future N>2 callers can pass the
-- full ranked-placement payload (array of {playerId, rank}). When NULL,
-- the function behaves EXACTLY as the existing 2-player implementation
-- (using game_matches.winner_user_id). The `_reason` parameter remains
-- reserved for A.4 (e.g. 'opponent_forfeit').
--
-- N>2 ELO math is STUBBED in this batch: when _placements is provided we
-- log the payload and fall through to the legacy 2-player path. Full
-- N-player ELO will be refined in A.3 once apply-move is wired to emit
-- the placements array. The signature extension is what A.2 ships so
-- A.3/A.4 can target a stable RPC contract without re-signing.

DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid, text);
DROP FUNCTION IF EXISTS public.finalise_ranked_match(uuid);

CREATE OR REPLACE FUNCTION public.finalise_ranked_match(
  _match_id   uuid,
  _reason     text  DEFAULT 'normal',     -- reserved (A.4 forfeit handling)
  _placements jsonb DEFAULT NULL          -- A.2: optional N-player ranks
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
  PERFORM _reason;       -- reserved for A.4
  PERFORM _placements;   -- A.2 stub: N>2 path refined in A.3

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

GRANT EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text, jsonb) FROM PUBLIC, authenticated;