REVOKE SELECT ON public.quiz_questions FROM authenticated, anon;

GRANT SELECT (id, creator_type, category, prompt, option_a, option_b, option_c, option_d, source_field, active, review_status, version, created_at, updated_at)
  ON public.quiz_questions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
REVOKE SELECT ON public.quiz_questions FROM authenticated;
GRANT SELECT (id, creator_type, category, prompt, option_a, option_b, option_c, option_d, source_field, active, review_status, version, created_at, updated_at)
  ON public.quiz_questions TO authenticated;

GRANT ALL ON public.quiz_questions TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_quiz_questions()
RETURNS SETOF public.quiz_questions
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.* FROM public.quiz_questions q
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'trainer'::app_role)
  ORDER BY q.creator_type, q.category, q.updated_at DESC
$$;

REVOKE ALL ON FUNCTION public.admin_list_quiz_questions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_quiz_questions() TO authenticated, service_role;