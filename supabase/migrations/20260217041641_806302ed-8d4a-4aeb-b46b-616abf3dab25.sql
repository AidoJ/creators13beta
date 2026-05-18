
-- Create FAQs table for practitioner course FAQs
CREATE TABLE public.faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can read FAQs"
  ON public.faqs FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only trainers can insert
CREATE POLICY "Trainers can insert FAQs"
  ON public.faqs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'trainer'));

-- Only trainers can update
CREATE POLICY "Trainers can update FAQs"
  ON public.faqs FOR UPDATE
  USING (public.has_role(auth.uid(), 'trainer'));

-- Only trainers can delete
CREATE POLICY "Trainers can delete FAQs"
  ON public.faqs FOR DELETE
  USING (public.has_role(auth.uid(), 'trainer'));

-- Trigger for updated_at
CREATE TRIGGER update_faqs_updated_at
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
