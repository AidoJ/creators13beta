-- ============================================================
-- BATCH 2: Community signup + profile completion
-- ============================================================

-- 1. Schema additions ----------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invitation_code text,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bio_superpower text,
  ADD COLUMN IF NOT EXISTS bio_where_i_live text,
  ADD COLUMN IF NOT EXISTS bio_intriguing text;

-- Length caps (NULL allowed; <=500 when set)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bio_superpower_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT bio_superpower_length CHECK (bio_superpower IS NULL OR length(bio_superpower) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bio_where_i_live_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT bio_where_i_live_length CHECK (bio_where_i_live IS NULL OR length(bio_where_i_live) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bio_intriguing_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT bio_intriguing_length CHECK (bio_intriguing IS NULL OR length(bio_intriguing) <= 500);
  END IF;
END$$;

COMMENT ON COLUMN public.profiles.invitation_code IS
  '8-char Crockford base32 referral code (alphabet excludes 0,1,I,L,O,U). Auto-generated for every member.';
COMMENT ON COLUMN public.profiles.profile_completed_at IS
  'Timestamp the member finished the community profile wizard. NULL = wizard not yet completed; gate redirects to /onboarding/profile.';

-- 2. Invitation code generator + auto-assign trigger ---------

CREATE OR REPLACE FUNCTION public.generate_invitation_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Crockford base32 minus look-alikes (0,1,I,L,O,U).
  alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  new_code text;
  i int;
  exists_already boolean;
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE invitation_code = new_code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_set_invitation_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invitation_code IS NULL THEN
    NEW.invitation_code := public.generate_invitation_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_invitation_code ON public.profiles;
CREATE TRIGGER trg_profiles_set_invitation_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_invitation_code();

-- Backfill existing rows
UPDATE public.profiles
  SET invitation_code = public.generate_invitation_code()
  WHERE invitation_code IS NULL;

ALTER TABLE public.profiles ALTER COLUMN invitation_code SET NOT NULL;

-- Unique index (case-insensitive lookups happen via the RPC which uppercases)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invitation_code_key
  ON public.profiles (invitation_code);

-- 3. resolve_invitation_code RPC -----------------------------

CREATE OR REPLACE FUNCTION public.resolve_invitation_code(_code text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.profiles
  WHERE invitation_code = upper(trim(_code))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_invitation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_invitation_code(text) TO anon, authenticated;

-- 4. complete_profile RPC (atomic wizard submit) -------------

CREATE OR REPLACE FUNCTION public.complete_profile(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _primary text := lower(NULLIF(trim(coalesce(_payload->>'primary_type','')), ''));
  _display_name text := NULLIF(trim(coalesce(_payload->>'display_name','')), '');
  _location_label text := NULLIF(trim(coalesce(_payload->>'location_label','')), '');
  _bio_super text := NULLIF(_payload->>'bio_superpower', '');
  _bio_where text := NULLIF(_payload->>'bio_where_i_live', '');
  _bio_intriguing text := NULLIF(_payload->>'bio_intriguing', '');
  _avatar_url text := NULLIF(_payload->>'avatar_url', '');
  _visible boolean := COALESCE((_payload->>'community_visible')::boolean, false);
  _prefs jsonb := COALESCE(_payload->'member_preferences', '{}'::jsonb);
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _display_name IS NULL OR char_length(_display_name) < 2 OR char_length(_display_name) > 40 THEN
    RAISE EXCEPTION 'display_name must be 2-40 characters';
  END IF;
  IF _location_label IS NULL THEN
    RAISE EXCEPTION 'location_label required';
  END IF;
  IF _bio_super IS NULL OR _bio_where IS NULL OR _bio_intriguing IS NULL THEN
    RAISE EXCEPTION 'all three bio fields required';
  END IF;
  IF char_length(_bio_super) > 500 OR char_length(_bio_where) > 500 OR char_length(_bio_intriguing) > 500 THEN
    RAISE EXCEPTION 'bio fields capped at 500 characters';
  END IF;
  IF _primary IS NULL THEN
    RAISE EXCEPTION 'primary_type required';
  END IF;

  UPDATE public.profiles SET
    display_name         = _display_name,
    location_label       = _location_label,
    avatar_url           = COALESCE(_avatar_url, avatar_url),
    bio_superpower       = _bio_super,
    bio_where_i_live     = _bio_where,
    bio_intriguing       = _bio_intriguing,
    community_visible    = _visible,
    community_joined_at  = CASE
      WHEN _visible THEN COALESCE(community_joined_at, now())
      ELSE community_joined_at
    END,
    member_preferences   = COALESCE(member_preferences,'{}'::jsonb) || _prefs,
    profile_completed_at = COALESCE(profile_completed_at, now())
  WHERE user_id = _uid;

  -- Only insert a self_selected row if the member has no creator_type_profile yet.
  -- A practitioner assignment, if it exists, stays untouched.
  IF NOT public.creator_type_profile_exists_for(_uid) THEN
    INSERT INTO public.creator_type_profiles (user_id, source, primary_type)
    VALUES (_uid, 'self_selected', _primary);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile(jsonb) TO authenticated;

-- 5. Storage RLS for profile-avatars bucket ------------------

DROP POLICY IF EXISTS "profile_avatars_auth_read" ON storage.objects;
DROP POLICY IF EXISTS "profile_avatars_owner_write" ON storage.objects;
DROP POLICY IF EXISTS "profile_avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "profile_avatars_owner_delete" ON storage.objects;

CREATE POLICY "profile_avatars_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "profile_avatars_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );