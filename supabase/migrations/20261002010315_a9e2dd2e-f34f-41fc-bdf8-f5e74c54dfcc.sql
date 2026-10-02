CREATE OR REPLACE FUNCTION public.get_practitioner_badges(_user_ids uuid[])
RETURNS TABLE(user_id uuid, badge text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id,
    CASE
      WHEN bool_or(e.level_key = 'prac_l3_certified') THEN 'l3'
      WHEN bool_or(e.level_key = 'prac_l2_certified') THEN 'l2'
      WHEN bool_or(e.level_key = 'prac_l1_certified') THEN 'l1'
      ELSE 'trainee'
    END
  FROM public.profiles p
  JOIN public.entitlements e
    ON e.user_id = p.user_id AND e.status = 'active'
   AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
   AND e.level_key IN ('prac_l1_certified','prac_l2_certified','prac_l3_certified','prac_l1_trainee','prac_l2_trainee','prac_l3_trainee')
  WHERE auth.uid() IS NOT NULL
    AND p.user_id = ANY(_user_ids[1:500])
    AND (p.user_id = auth.uid() OR (
      p.community_visible = true
      AND EXISTS (SELECT 1 FROM public.creator_type_profiles c WHERE c.user_id = p.user_id)))
  GROUP BY p.user_id;
$$;
REVOKE ALL ON FUNCTION public.get_practitioner_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_practitioner_badges(uuid[]) TO authenticated;