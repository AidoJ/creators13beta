-- Enums
DO $$ BEGIN
  CREATE TYPE public.match_status AS ENUM ('waiting', 'active', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.match_mode AS ENUM ('solo', 'pvp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.game_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode public.match_mode NOT NULL DEFAULT 'solo',
  status public.match_status NOT NULL DEFAULT 'active',
  host_user_id uuid NOT NULL,
  host_name text NOT NULL,
  guest_user_id uuid,
  guest_name text,
  invite_token text UNIQUE,
  state jsonb NOT NULL,
  winner_user_id uuid,
  last_action_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_matches_host ON public.game_matches(host_user_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_guest ON public.game_matches(guest_user_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_token ON public.game_matches(invite_token);
CREATE INDEX IF NOT EXISTS idx_game_matches_updated_at ON public.game_matches(updated_at DESC);

ALTER TABLE public.game_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view their matches"
  ON public.game_matches FOR SELECT
  TO authenticated
  USING (auth.uid() = host_user_id OR auth.uid() = guest_user_id);

CREATE POLICY "Hosts can create matches"
  ON public.game_matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Players can update their matches"
  ON public.game_matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_user_id OR auth.uid() = guest_user_id)
  WITH CHECK (auth.uid() = host_user_id OR auth.uid() = guest_user_id);

CREATE POLICY "Hosts can delete their matches"
  ON public.game_matches FOR DELETE
  TO authenticated
  USING (auth.uid() = host_user_id);

DROP TRIGGER IF EXISTS update_game_matches_updated_at ON public.game_matches;
CREATE TRIGGER update_game_matches_updated_at
  BEFORE UPDATE ON public.game_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.game_matches REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_matches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Accept invite RPC
CREATE OR REPLACE FUNCTION public.accept_game_invite(_token text, _guest_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match_id uuid;
  _host_id uuid;
  _existing_guest uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a match';
  END IF;

  SELECT id, host_user_id, guest_user_id
  INTO _match_id, _host_id, _existing_guest
  FROM public.game_matches
  WHERE invite_token = _token
  LIMIT 1;

  IF _match_id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid';
  END IF;

  IF _host_id = auth.uid() THEN
    -- Host re-opened their own link; just return the match id.
    RETURN _match_id;
  END IF;

  IF _existing_guest IS NOT NULL AND _existing_guest <> auth.uid() THEN
    RAISE EXCEPTION 'This invite has already been accepted by someone else';
  END IF;

  UPDATE public.game_matches
  SET guest_user_id = auth.uid(),
      guest_name = COALESCE(NULLIF(_guest_name, ''), 'Guest'),
      status = 'active',
      updated_at = now()
  WHERE id = _match_id;

  RETURN _match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_game_invite(text, text) TO authenticated;