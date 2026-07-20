
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribe_token text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_marketing_unsubscribe_token_key
  ON public.profiles(marketing_unsubscribe_token)
  WHERE marketing_unsubscribe_token IS NOT NULL;

-- Public, no-auth unsubscribe. Rotates the token so the link is single-use.
CREATE OR REPLACE FUNCTION public.marketing_unsubscribe(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN
    RETURN false;
  END IF;

  SELECT user_id INTO v_user
  FROM public.profiles
  WHERE marketing_unsubscribe_token = _token;

  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
     SET marketing_opt_in = false,
         marketing_unsubscribed_at = now(),
         marketing_unsubscribe_token = encode(gen_random_bytes(32), 'hex')
   WHERE user_id = v_user;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_unsubscribe(text) FROM public;
GRANT EXECUTE ON FUNCTION public.marketing_unsubscribe(text) TO anon, authenticated;

-- Ensures a token exists for the caller; returns it. Used at signup and by the
-- admin export to mint per-user unsubscribe links.
CREATE OR REPLACE FUNCTION public.ensure_marketing_unsubscribe_token(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT marketing_unsubscribe_token INTO v_token
    FROM public.profiles WHERE user_id = _user_id;

  IF v_token IS NULL OR length(v_token) < 20 THEN
    v_token := encode(gen_random_bytes(32), 'hex');
    UPDATE public.profiles
       SET marketing_unsubscribe_token = v_token
     WHERE user_id = _user_id;
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_marketing_unsubscribe_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_marketing_unsubscribe_token(uuid) TO authenticated, service_role;
