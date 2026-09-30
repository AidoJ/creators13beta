CREATE TABLE public.prospectus_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order int NOT NULL DEFAULT 0,
  heading text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prospectus_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.prospectus_sections TO authenticated;
GRANT ALL ON public.prospectus_sections TO service_role;
ALTER TABLE public.prospectus_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read the prospectus" ON public.prospectus_sections FOR SELECT USING (true);
CREATE POLICY "Admins and trainers edit the prospectus" ON public.prospectus_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'trainer'));
CREATE OR REPLACE FUNCTION public.prospectus_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER prospectus_touch BEFORE UPDATE ON public.prospectus_sections FOR EACH ROW EXECUTE FUNCTION public.prospectus_touch();

ALTER TABLE public.practitioner_applications
  ADD COLUMN answers jsonb,
  ADD COLUMN payment_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN payment_link_sent_at timestamptz,
  ADD COLUMN paid_at timestamptz;