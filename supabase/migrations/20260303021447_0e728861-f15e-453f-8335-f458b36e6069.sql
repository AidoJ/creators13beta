
-- Table for zoom recording links attached to case studies
CREATE TABLE public.zoom_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id uuid NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL,
  url text NOT NULL,
  label text,
  expires_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zoom_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can insert own recordings"
ON public.zoom_recordings FOR INSERT
WITH CHECK (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can view own recordings"
ON public.zoom_recordings FOR SELECT
USING (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can update own recordings"
ON public.zoom_recordings FOR UPDATE
USING (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can delete own recordings"
ON public.zoom_recordings FOR DELETE
USING (auth.uid() = practitioner_id);

CREATE POLICY "Trainers can manage all recordings"
ON public.zoom_recordings FOR ALL
USING (has_role(auth.uid(), 'trainer'::app_role));

CREATE INDEX idx_zoom_recordings_case_study ON public.zoom_recordings(case_study_id);
CREATE INDEX idx_zoom_recordings_expires ON public.zoom_recordings(expires_at);
