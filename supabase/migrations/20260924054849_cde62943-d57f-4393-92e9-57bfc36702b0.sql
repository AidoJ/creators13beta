ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS receives_unassigned_clients boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET receives_unassigned_clients = true WHERE user_id = 'c9469c41-507d-479e-80a7-ed93cb84037b';

-- Members must not flag themselves.
CREATE OR REPLACE FUNCTION public.profiles_guard_unassigned_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.receives_unassigned_clients IS DISTINCT FROM OLD.receives_unassigned_clients
     AND current_setting('app.allow_unassigned_flag', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Use set_unassigned_eligibility';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_guard_unassigned_flag ON public.profiles;
CREATE TRIGGER profiles_guard_unassigned_flag BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_unassigned_flag();

CREATE OR REPLACE FUNCTION public.can_profile_clients(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(_uid,'trainer') OR has_role(_uid,'admin') OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.user_id = _uid
      AND p.practitioner_status = 'certified' AND coalesce(p.certification_level,0) >= 3)
$$;

CREATE OR REPLACE FUNCTION public.list_unassigned_eligibility()
RETURNS TABLE(user_id uuid, name text, email text, is_trainer boolean, certification_level int, eligible boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT p.user_id, coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email), p.email,
         has_role(p.user_id,'trainer'), p.certification_level::int, p.receives_unassigned_clients
  FROM profiles p
  WHERE has_role(p.user_id,'trainer')
     OR (p.practitioner_status='certified' AND coalesce(p.certification_level,0) >= 3)
     OR p.receives_unassigned_clients
  ORDER BY p.receives_unassigned_clients DESC, p.first_name NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.set_unassigned_eligibility(_user_id uuid, _eligible boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _eligible AND NOT (has_role(_user_id,'trainer') OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=_user_id AND p.practitioner_status='certified' AND coalesce(p.certification_level,0)>=3)) THEN
    RAISE EXCEPTION 'Only trainers or Level 3 certified practitioners can receive unassigned clients';
  END IF;
  PERFORM set_config('app.allow_unassigned_flag','on',true);
  UPDATE profiles SET receives_unassigned_clients = _eligible WHERE user_id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.reassign_client_profiler(_client_id uuid, _practitioner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'trainer') OR has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id=_practitioner_id AND receives_unassigned_clients) THEN
    RAISE EXCEPTION 'That practitioner is not flagged to receive clients';
  END IF;
  UPDATE client_practitioner SET active=false WHERE client_id=_client_id AND active AND practitioner_id<>_practitioner_id;
  INSERT INTO client_practitioner(client_id, practitioner_id, active) VALUES (_client_id,_practitioner_id,true)
  ON CONFLICT (client_id, practitioner_id) DO UPDATE SET active=true;
END $$;

-- Picker: direct profile buyers (Stripe-bought body profile, no code / invite) only see flagged practitioners.
CREATE OR REPLACE FUNCTION public.get_enrollment_practitioner_options(_practitioner_code text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, practitioner_code text, practitioner_status practitioner_status)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH current_user_email AS (
    SELECT lower(trim(coalesce(auth.jwt() ->> 'email', ''))) AS email
  ), ctx AS (
    SELECT EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = auth.uid() AND e.status = 'active' AND e.source = 'stripe'
        AND e.level_key IN ('profile_body','profile_adv_body')
    )
    AND nullif(trim(coalesce(_practitioner_code, '')), '') IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.client_invitations ci CROSS JOIN current_user_email cue
      WHERE cue.email <> '' AND lower(trim(ci.email)) = cue.email
    ) AS direct_buyer
  ), eligible_practitioners AS (
    SELECT p.user_id
    FROM public.profiles p CROSS JOIN ctx
    WHERE auth.uid() IS NOT NULL
      AND p.user_id <> auth.uid()
      AND (
        (ctx.direct_buyer AND p.receives_unassigned_clients)
        OR (
          EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
                    AND ur.role IN ('practitioner'::app_role, 'trainee'::app_role))
          AND (
            (NOT ctx.direct_buyer AND p.practitioner_status = 'certified'::practitioner_status)
            OR (nullif(trim(coalesce(_practitioner_code, '')), '') IS NOT NULL AND p.practitioner_code = trim(_practitioner_code))
            OR EXISTS (SELECT 1 FROM public.client_practitioner cp WHERE cp.client_id = auth.uid() AND cp.practitioner_id = p.user_id AND cp.active = true)
            OR EXISTS (SELECT 1 FROM public.client_invitations ci CROSS JOIN current_user_email cue
                       WHERE ci.practitioner_id = p.user_id AND cue.email <> '' AND lower(trim(ci.email)) = cue.email)
          )
        )
      )
  )
  SELECT p.user_id, p.first_name, p.last_name, p.practitioner_code, p.practitioner_status
  FROM public.profiles p
  JOIN eligible_practitioners ep ON ep.user_id = p.user_id
  ORDER BY
    CASE
      WHEN nullif(trim(coalesce(_practitioner_code, '')), '') IS NOT NULL AND p.practitioner_code = trim(_practitioner_code) THEN 0
      WHEN EXISTS (SELECT 1 FROM public.client_practitioner cp WHERE cp.client_id = auth.uid() AND cp.practitioner_id = p.user_id AND cp.active = true) THEN 1
      ELSE 3
    END,
    p.first_name NULLS LAST, p.last_name NULLS LAST;
$function$;

-- Queue: clinic referrals + handoffs (client's practitioner can't assign Creator Types).
DROP FUNCTION IF EXISTS public.get_clinic_profile_queue();
CREATE FUNCTION public.get_clinic_profile_queue()
 RETURNS TABLE(entry_kind text, invitation_id uuid, client_name text, client_email text, client_phone text, client_user_id uuid, practitioner_id uuid, practitioner_name text, paid_at timestamptz, redeemed_at timestamptz, signup_status text, photos_uploaded integer, creator_types_assigned integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'trainer') OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT 'clinic'::text, ci.id, ci.name, ci.email, ci.phone, cp.user_id, ci.practitioner_id,
         coalesce(nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''), pp.email),
         ci.paid_at, ci.redeemed_at, ci.status,
         (SELECT count(*)::int FROM profiling_photos ph WHERE ph.user_id = cp.user_id),
         (SELECT count(*)::int FROM creator_type_profiles ctp WHERE ctp.user_id = cp.user_id)
    FROM client_invitations ci
    LEFT JOIN profiles cp ON lower(trim(cp.email)) = lower(trim(ci.email))
    LEFT JOIN profiles pp ON pp.user_id = ci.practitioner_id
   WHERE ci.kind = 'clinic_profile' AND ci.paid_at IS NOT NULL
  UNION ALL
  SELECT 'handoff'::text, NULL::uuid,
         nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email, c.phone, c.user_id, a.practitioner_id,
         coalesce(nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''), pp.email),
         (SELECT max(ph.created_at) FROM profiling_photos ph WHERE ph.user_id = c.user_id), NULL::timestamptz, 'handoff'::text,
         (SELECT count(*)::int FROM profiling_photos ph WHERE ph.user_id = c.user_id),
         (SELECT count(*)::int FROM creator_type_profiles ctp WHERE ctp.user_id = c.user_id)
    FROM client_practitioner a
    JOIN profiles c ON c.user_id = a.client_id
    LEFT JOIN profiles pp ON pp.user_id = a.practitioner_id
   WHERE a.active
     AND NOT can_profile_clients(a.practitioner_id)
     AND EXISTS (SELECT 1 FROM profiling_photos ph WHERE ph.user_id = c.user_id)
     AND NOT EXISTS (SELECT 1 FROM client_invitations ci WHERE ci.kind='clinic_profile' AND ci.paid_at IS NOT NULL AND lower(trim(ci.email)) = lower(trim(c.email)))
  ORDER BY 9 DESC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_unassigned_eligibility() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_unassigned_eligibility(uuid,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reassign_client_profiler(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinic_profile_queue() FROM anon;