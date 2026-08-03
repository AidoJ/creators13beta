DROP POLICY IF EXISTS "Approved case studies visible to practitioners" ON public.case_studies;

CREATE POLICY "Subjects can view their own approved case studies"
ON public.case_studies
FOR SELECT
TO authenticated
USING (auth.uid() = subject_user_id);

CREATE POLICY "Admins can view all case studies"
ON public.case_studies
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));