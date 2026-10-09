DROP POLICY IF EXISTS "Practitioners can read case study invite template" ON public.email_templates;
CREATE POLICY "Practitioners can read case study invite template" ON public.email_templates FOR SELECT TO authenticated
USING (template_key = 'case_study_invite' AND (public.has_role(auth.uid(),'practitioner') OR public.has_role(auth.uid(),'trainee') OR public.has_role(auth.uid(),'trainer')));