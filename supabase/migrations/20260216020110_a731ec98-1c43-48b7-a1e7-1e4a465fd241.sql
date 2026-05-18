
-- Create training resources table
CREATE TABLE public.training_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL DEFAULT 'document', -- video, audio, document, image
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.training_resources ENABLE ROW LEVEL SECURITY;

-- Trainers can do everything
CREATE POLICY "Trainers can manage resources"
  ON public.training_resources FOR ALL
  USING (has_role(auth.uid(), 'trainer'::app_role));

-- Practitioners/trainees can view
CREATE POLICY "Practitioners can view resources"
  ON public.training_resources FOR SELECT
  USING (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('training-resources', 'training-resources', true);

-- Storage policies
CREATE POLICY "Trainers can upload resources"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'training-resources' AND has_role(auth.uid(), 'trainer'::app_role));

CREATE POLICY "Trainers can delete resources"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'training-resources' AND has_role(auth.uid(), 'trainer'::app_role));

CREATE POLICY "Authenticated users can view resources"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-resources' AND auth.uid() IS NOT NULL);
