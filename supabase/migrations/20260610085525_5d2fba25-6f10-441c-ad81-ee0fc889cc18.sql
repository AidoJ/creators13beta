-- ============================================================================
-- Batch C: Contact Preferences & Per-Pair Connection Requests
-- ============================================================================

-- 1) profiles: contact prefs ------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS open_to_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_channels jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.contact_channels IS
  'Private contact handles, never returned by public profile RPCs.
   Allowed keys: email, phone_number, phone_call_ok (bool), phone_sms_ok (bool),
   whatsapp, messenger, telegram, other. Keys omitted/null = channel not enabled.';

-- Shape-check trigger: reject unknown keys, enforce phone permission rule.
CREATE OR REPLACE FUNCTION public.profiles_validate_contact_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed text[] := ARRAY[
    'email','phone_number','phone_call_ok','phone_sms_ok',
    'whatsapp','messenger','telegram','other'
  ];
  _key text;
  _has_phone boolean;
  _call_ok boolean;
  _sms_ok boolean;
BEGIN
  IF NEW.contact_channels IS NULL THEN
    NEW.contact_channels := '{}'::jsonb;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.contact_channels) <> 'object' THEN
    RAISE EXCEPTION 'contact_channels must be a JSON object';
  END IF;

  FOR _key IN SELECT jsonb_object_keys(NEW.contact_channels) LOOP
    IF NOT (_key = ANY(_allowed)) THEN
      RAISE EXCEPTION 'contact_channels: unknown key "%". Allowed: %', _key, _allowed;
    END IF;
  END LOOP;

  -- If phone_number set & non-empty, at least one of call_ok / sms_ok must be true.
  _has_phone := NULLIF(trim(coalesce(NEW.contact_channels->>'phone_number','')), '') IS NOT NULL;
  IF _has_phone THEN
    _call_ok := COALESCE((NEW.contact_channels->>'phone_call_ok')::boolean, false);
    _sms_ok  := COALESCE((NEW.contact_channels->>'phone_sms_ok')::boolean,  false);
    IF NOT (_call_ok OR _sms_ok) THEN
      RAISE EXCEPTION 'phone_number is set but neither phone_call_ok nor phone_sms_ok is true';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_contact_channels_trg ON public.profiles;
CREATE TRIGGER profiles_validate_contact_channels_trg
  BEFORE INSERT OR UPDATE OF contact_channels ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_contact_channels();

-- 2) contact_requests table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  decline_comment text CHECK (decline_comment IS NULL OR length(decline_comment) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','declined','withdrawn','revoked'
  )),
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

GRANT SELECT ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_requests_select_participant" ON public.contact_requests;
CREATE POLICY "contact_requests_select_participant" ON public.contact_requests
  FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_unique_active_pair
  ON public.contact_requests (
    LEAST(from_user_id, to_user_id),
    GREATEST(from_user_id, to_user_id)
  )
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS contact_requests_to_pending_idx
  ON public.contact_requests (to_user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS contact_requests_approved_idx
  ON public.contact_requests (from_user_id, to_user_id)
  WHERE status = 'approved';

-- 3) RPCs -------------------------------------------------------------------

-- send_contact_request
CREATE OR REPLACE FUNCTION public.send_contact_request(_to_user_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _open boolean;
  _visible boolean;
  _completed timestamptz;
  _pending_count int;
  _exists int;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF _to_user_id IS NULL OR _to_user_id = _uid THEN
    RAISE EXCEPTION 'invalid target user';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'reason must be 1-500 characters';
  END IF;

  SELECT open_to_contact, community_visible, profile_completed_at
    INTO _open, _visible, _completed
  FROM public.profiles WHERE user_id = _to_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'target not found'; END IF;
  IF NOT (COALESCE(_open,false) AND COALESCE(_visible,false) AND _completed IS NOT NULL) THEN
    RAISE EXCEPTION 'this Creator is not accepting connection requests';
  END IF;

  -- Rate limit: 10 pending outgoing in past 24h.
  SELECT COUNT(*) INTO _pending_count
  FROM public.contact_requests
  WHERE from_user_id = _uid
    AND status = 'pending'
    AND created_at > now() - interval '24 hours';
  IF _pending_count >= 10 THEN
    RAISE EXCEPTION 'You''ve reached your daily limit of 10 pending connection requests. Wait for some to be approved or declined before sending more.';
  END IF;

  -- No active (pending/approved) row between this pair, either direction.
  SELECT 1 INTO _exists
  FROM public.contact_requests
  WHERE status IN ('pending','approved')
    AND ((from_user_id = _uid AND to_user_id = _to_user_id)
      OR (from_user_id = _to_user_id AND to_user_id = _uid))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'an active connection request already exists between you';
  END IF;

  INSERT INTO public.contact_requests (from_user_id, to_user_id, reason)
  VALUES (_uid, _to_user_id, trim(_reason))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- approve_contact_request
CREATE OR REPLACE FUNCTION public.approve_contact_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _to uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  SELECT to_user_id, status INTO _to, _status FROM public.contact_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _to <> _uid THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'request is not pending'; END IF;
  UPDATE public.contact_requests
    SET status = 'approved', responded_at = now()
   WHERE id = _request_id;
END;
$$;

-- decline_contact_request
CREATE OR REPLACE FUNCTION public.decline_contact_request(_request_id uuid, _comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _to uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  IF _comment IS NOT NULL AND length(_comment) > 500 THEN
    RAISE EXCEPTION 'comment capped at 500 characters';
  END IF;
  SELECT to_user_id, status INTO _to, _status FROM public.contact_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _to <> _uid THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'request is not pending'; END IF;
  UPDATE public.contact_requests
    SET status = 'declined',
        responded_at = now(),
        decline_comment = NULLIF(trim(coalesce(_comment,'')), '')
   WHERE id = _request_id;
END;
$$;

-- withdraw_contact_request
CREATE OR REPLACE FUNCTION public.withdraw_contact_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _from uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  SELECT from_user_id, status INTO _from, _status FROM public.contact_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _from <> _uid THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'request is not pending'; END IF;
  UPDATE public.contact_requests SET status = 'withdrawn' WHERE id = _request_id;
END;
$$;

-- revoke_contact_request
CREATE OR REPLACE FUNCTION public.revoke_contact_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _from uuid; _to uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE = '42501'; END IF;
  SELECT from_user_id, to_user_id, status INTO _from, _to, _status
    FROM public.contact_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _uid NOT IN (_from, _to) THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF _status <> 'approved' THEN RAISE EXCEPTION 'request is not approved'; END IF;
  UPDATE public.contact_requests
    SET status = 'revoked', revoked_at = now()
   WHERE id = _request_id;
END;
$$;

-- get_incoming_contact_requests
CREATE OR REPLACE FUNCTION public.get_incoming_contact_requests()
RETURNS TABLE (
  id uuid,
  from_user_id uuid,
  from_display_name text,
  from_avatar_url text,
  reason text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id, cr.from_user_id, p.display_name, p.avatar_url,
         cr.reason, cr.status, cr.created_at
  FROM public.contact_requests cr
  LEFT JOIN public.profiles p ON p.user_id = cr.from_user_id
  WHERE auth.uid() IS NOT NULL AND cr.to_user_id = auth.uid()
  ORDER BY cr.created_at DESC;
$$;

-- get_outgoing_contact_requests
CREATE OR REPLACE FUNCTION public.get_outgoing_contact_requests()
RETURNS TABLE (
  id uuid,
  to_user_id uuid,
  to_display_name text,
  to_avatar_url text,
  reason text,
  status text,
  decline_comment text,
  created_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id, cr.to_user_id, p.display_name, p.avatar_url,
         cr.reason, cr.status, cr.decline_comment,
         cr.created_at, cr.responded_at, cr.revoked_at
  FROM public.contact_requests cr
  LEFT JOIN public.profiles p ON p.user_id = cr.to_user_id
  WHERE auth.uid() IS NOT NULL AND cr.from_user_id = auth.uid()
  ORDER BY cr.created_at DESC;
$$;

-- get_my_approved_contacts
-- Each party's own phone_call_ok / phone_sms_ok flags govern what the OTHER
-- party sees about their phone. The viewer's permissions do not gate the
-- other party's number.
CREATE OR REPLACE FUNCTION public.get_my_approved_contacts()
RETURNS TABLE (
  other_user_id uuid,
  other_display_name text,
  other_avatar_url text,
  approved_at timestamptz,
  channels jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      cr.id,
      CASE WHEN cr.from_user_id = _uid THEN cr.to_user_id ELSE cr.from_user_id END AS other_id,
      cr.responded_at AS approved_at
    FROM public.contact_requests cr
    WHERE cr.status = 'approved'
      AND (cr.from_user_id = _uid OR cr.to_user_id = _uid)
  ),
  joined AS (
    SELECT
      b.other_id,
      b.approved_at,
      po.display_name AS other_display_name,
      po.avatar_url   AS other_avatar_url,
      pme.contact_channels AS my_ch,
      po.contact_channels  AS their_ch,
      pme.open_to_contact AS my_open,
      po.open_to_contact  AS their_open
    FROM base b
    JOIN public.profiles po  ON po.user_id  = b.other_id
    JOIN public.profiles pme ON pme.user_id = _uid
  )
  SELECT
    j.other_id,
    j.other_display_name,
    j.other_avatar_url,
    j.approved_at,
    -- Build channels object containing only overlapping channels with
    -- the OTHER party's handle. Each side must currently be open_to_contact.
    (
      SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
      FROM (
        -- email
        SELECT 'email'::text AS k, to_jsonb(j.their_ch->>'email') AS v
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'email','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'email','')), '') IS NOT NULL
        UNION ALL
        -- whatsapp
        SELECT 'whatsapp', to_jsonb(j.their_ch->>'whatsapp')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'whatsapp','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'whatsapp','')), '') IS NOT NULL
        UNION ALL
        -- messenger
        SELECT 'messenger', to_jsonb(j.their_ch->>'messenger')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'messenger','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'messenger','')), '') IS NOT NULL
        UNION ALL
        -- telegram
        SELECT 'telegram', to_jsonb(j.their_ch->>'telegram')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'telegram','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'telegram','')), '') IS NOT NULL
        UNION ALL
        -- other
        SELECT 'other', to_jsonb(j.their_ch->>'other')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'other','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'other','')), '') IS NOT NULL
        UNION ALL
        -- phone_call: surface their number IF both have phone_number AND THEIR call_ok flag is true
        SELECT 'phone_call', to_jsonb(j.their_ch->>'phone_number')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'phone_number','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'phone_number','')), '') IS NOT NULL
          AND COALESCE((j.their_ch->>'phone_call_ok')::boolean, false) = true
        UNION ALL
        -- phone_sms: surface their number IF both have phone_number AND THEIR sms_ok flag is true
        SELECT 'phone_sms', to_jsonb(j.their_ch->>'phone_number')
        WHERE j.my_open AND j.their_open
          AND NULLIF(trim(coalesce(j.my_ch->>'phone_number','')), '') IS NOT NULL
          AND NULLIF(trim(coalesce(j.their_ch->>'phone_number','')), '') IS NOT NULL
          AND COALESCE((j.their_ch->>'phone_sms_ok')::boolean, false) = true
      ) sub
    ) AS channels
  FROM joined j
  ORDER BY j.approved_at DESC NULLS LAST;
END;
$$;

-- get_pending_request_count
CREATE OR REPLACE FUNCTION public.get_pending_request_count()
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COUNT(*)::int FROM public.contact_requests
    WHERE auth.uid() IS NOT NULL
      AND to_user_id = auth.uid()
      AND status = 'pending'
  ), 0);
$$;

-- 4) Extend get_public_member_profile to include open_to_contact + enabled_channels
DROP FUNCTION IF EXISTS public.get_public_member_profile(uuid);
CREATE OR REPLACE FUNCTION public.get_public_member_profile(_target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  location_label text,
  bio_superpower text,
  bio_where_i_live text,
  bio_intriguing text,
  tier subscription_tier,
  community_joined_at timestamp with time zone,
  creator_types jsonb,
  open_to_contact boolean,
  enabled_channels text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.location_label,
    p.bio_superpower,
    p.bio_where_i_live,
    p.bio_intriguing,
    (SELECT s.tier FROM public.subscriptions s WHERE s.user_id = p.user_id LIMIT 1) AS tier,
    p.community_joined_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('type', t.ct, 'source', ctp.source))
        FROM public.creator_type_profiles ctp,
             LATERAL (VALUES (ctp.primary_type),(ctp.secondary_type),(ctp.type_3),(ctp.type_4)) AS t(ct)
        WHERE ctp.user_id = p.user_id AND t.ct IS NOT NULL
      ),
      '[]'::jsonb
    ) AS creator_types,
    COALESCE(p.open_to_contact, false) AS open_to_contact,
    -- Only channel keys (no handles, no permission flags). Phone is a single key.
    ARRAY(
      SELECT k FROM (
        SELECT 'email'::text AS k
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'email','')), '') IS NOT NULL
        UNION ALL SELECT 'phone'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'phone_number','')), '') IS NOT NULL
        UNION ALL SELECT 'whatsapp'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'whatsapp','')), '') IS NOT NULL
        UNION ALL SELECT 'messenger'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'messenger','')), '') IS NOT NULL
        UNION ALL SELECT 'telegram'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'telegram','')), '') IS NOT NULL
        UNION ALL SELECT 'other'
          WHERE NULLIF(trim(coalesce(p.contact_channels->>'other','')), '') IS NOT NULL
      ) ch
    ) AS enabled_channels
  FROM public.profiles p
  WHERE p.user_id = _target_user_id
    AND p.community_visible = true
    AND p.profile_completed_at IS NOT NULL
    AND auth.uid() IS NOT NULL;
$$;

-- 5) Privileges -------------------------------------------------------------
REVOKE ALL ON FUNCTION public.send_contact_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_contact_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_contact_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_contact_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_contact_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_incoming_contact_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_outgoing_contact_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_approved_contacts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pending_request_count() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.send_contact_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_contact_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_contact_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_contact_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_contact_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incoming_contact_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outgoing_contact_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_approved_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_request_count() TO authenticated;

-- get_public_member_profile already existed; re-grant after DROP/CREATE.
REVOKE ALL ON FUNCTION public.get_public_member_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_member_profile(uuid) TO authenticated;
