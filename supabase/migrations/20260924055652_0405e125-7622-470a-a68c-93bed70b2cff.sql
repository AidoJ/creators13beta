CREATE OR REPLACE FUNCTION public.get_clinic_profile_queue()
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
         (SELECT max(ph.uploaded_at) FROM profiling_photos ph WHERE ph.user_id = c.user_id), NULL::timestamptz, 'handoff'::text,
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