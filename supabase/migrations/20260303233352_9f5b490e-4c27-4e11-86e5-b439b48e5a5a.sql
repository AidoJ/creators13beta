-- Separate table for client-level zoom recordings (independent of case studies)
CREATE TABLE public.client_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  url text NOT NULL,
  label text,
  expires_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_recordings_client ON public.client_recordings(client_id);
CREATE INDEX idx_client_recordings_expires ON public.client_recordings(expires_at);

ALTER TABLE public.client_recordings ENABLE ROW LEVEL SECURITY;

-- Practitioners manage their own
CREATE POLICY "Practitioners can view own client recordings"
  ON public.client_recordings FOR SELECT
  USING (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can insert own client recordings"
  ON public.client_recordings FOR INSERT
  WITH CHECK (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can update own client recordings"
  ON public.client_recordings FOR UPDATE
  USING (auth.uid() = practitioner_id);

CREATE POLICY "Practitioners can delete own client recordings"
  ON public.client_recordings FOR DELETE
  USING (auth.uid() = practitioner_id);

-- Clients can view their own
CREATE POLICY "Clients can view own recordings"
  ON public.client_recordings FOR SELECT
  USING (auth.uid() = client_id);

-- Trainers can manage all
CREATE POLICY "Trainers can manage all client recordings"
  ON public.client_recordings FOR ALL
  USING (has_role(auth.uid(), 'trainer'::app_role));