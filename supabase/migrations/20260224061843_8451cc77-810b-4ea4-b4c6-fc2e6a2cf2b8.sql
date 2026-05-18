
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  subject text NOT NULL DEFAULT '',
  html_body text NOT NULL DEFAULT '',
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and trainers can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can read templates"
  ON public.email_templates FOR SELECT
  USING (true);
