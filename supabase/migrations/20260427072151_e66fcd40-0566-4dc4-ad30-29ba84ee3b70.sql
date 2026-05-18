CREATE OR REPLACE FUNCTION public.get_enrollment_practitioner_options(_practitioner_code text DEFAULT NULL)
RETURNS TABLE(
  user_id uuid,
  first_name text,
  last_name text,
  practitioner_code text,
  practitioner_status practitioner_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_user_email AS (
    SELECT lower(trim(coalesce(auth.jwt() ->> 'email', ''))) AS email
  ), eligible_practitioners AS (
    SELECT p.user_id
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND ur.role IN ('practitioner'::app_role, 'trainee'::app_role)
      )
      AND p.user_id <> auth.uid()
      AND (
        p.practitioner_status = 'certified'::practitioner_status
        OR (
          nullif(trim(coalesce(_practitioner_code, '')), '') IS NOT NULL
          AND p.practitioner_code = trim(_practitioner_code)
        )
        OR EXISTS (
          SELECT 1
          FROM public.client_practitioner cp
          WHERE cp.client_id = auth.uid()
            AND cp.practitioner_id = p.user_id
            AND cp.active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.client_invitations ci
          CROSS JOIN current_user_email cue
          WHERE ci.practitioner_id = p.user_id
            AND cue.email <> ''
            AND lower(trim(ci.email)) = cue.email
        )
      )
  )
  SELECT p.user_id, p.first_name, p.last_name, p.practitioner_code, p.practitioner_status
  FROM public.profiles p
  JOIN eligible_practitioners ep ON ep.user_id = p.user_id
  ORDER BY
    CASE
      WHEN nullif(trim(coalesce(_practitioner_code, '')), '') IS NOT NULL
        AND p.practitioner_code = trim(_practitioner_code) THEN 0
      WHEN EXISTS (
        SELECT 1
        FROM public.client_practitioner cp
        WHERE cp.client_id = auth.uid()
          AND cp.practitioner_id = p.user_id
          AND cp.active = true
      ) THEN 1
      WHEN EXISTS (
        SELECT 1
        FROM public.client_invitations ci
        CROSS JOIN current_user_email cue
        WHERE ci.practitioner_id = p.user_id
          AND cue.email <> ''
          AND lower(trim(ci.email)) = cue.email
      ) THEN 2
      ELSE 3
    END,
    p.first_name NULLS LAST,
    p.last_name NULLS LAST;
$$;