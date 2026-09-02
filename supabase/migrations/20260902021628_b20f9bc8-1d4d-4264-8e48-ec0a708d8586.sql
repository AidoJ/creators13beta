-- ============================================================================
-- BACKPORT: Live-only practitioner schema -> Beta (canonical)
-- ============================================================================

-- 1. client_session_images  (Live migration 20260525105105)

CREATE TABLE IF NOT EXISTS public.client_session_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  storage_path text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.client_session_images TO authenticated;
GRANT ALL ON public.client_session_images TO service_role;

CREATE INDEX IF NOT EXISTS idx_client_session_images_client
  ON public.client_session_images(client_id);

ALTER TABLE public.client_session_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can view own session images" ON public.client_session_images;
CREATE POLICY "Clients can view own session images"
  ON public.client_session_images FOR SELECT TO authenticated
  USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Practitioners can view own uploads" ON public.client_session_images;
CREATE POLICY "Practitioners can view own uploads"
  ON public.client_session_images FOR SELECT TO authenticated
  USING (auth.uid() = practitioner_id);

DROP POLICY IF EXISTS "Assigned practitioners can view client session images" ON public.client_session_images;
CREATE POLICY "Assigned practitioners can view client session images"
  ON public.client_session_images FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_practitioner cp
    WHERE cp.client_id = client_session_images.client_id
      AND cp.practitioner_id = auth.uid()
      AND cp.active = true
  ));

DROP POLICY IF EXISTS "Practitioners can insert own session images" ON public.client_session_images;
CREATE POLICY "Practitioners can insert own session images"
  ON public.client_session_images FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = practitioner_id);

DROP POLICY IF EXISTS "Practitioners can delete own session images" ON public.client_session_images;
CREATE POLICY "Practitioners can delete own session images"
  ON public.client_session_images FOR DELETE TO authenticated
  USING (auth.uid() = practitioner_id);

DROP POLICY IF EXISTS "Trainers and admins can manage all session images" ON public.client_session_images;
CREATE POLICY "Trainers and admins can manage all session images"
  ON public.client_session_images FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'trainer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for session-images/{client_id}/... in the profiling-photos bucket

DROP POLICY IF EXISTS "Practitioners can upload client session images" ON storage.objects;
CREATE POLICY "Practitioners can upload client session images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'session-images'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR (
        (has_role(auth.uid(), 'practitioner'::app_role) OR has_role(auth.uid(), 'trainee'::app_role))
        AND EXISTS (
          SELECT 1 FROM public.client_practitioner cp
          WHERE cp.practitioner_id = auth.uid()
            AND cp.active = true
            AND cp.client_id::text = (storage.foldername(name))[2]
        )
      )
    )
  );

DROP POLICY IF EXISTS "Practitioners and clients can view client session images" ON storage.objects;
CREATE POLICY "Practitioners and clients can view client session images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'session-images'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[2]
      OR EXISTS (
        SELECT 1 FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  );

DROP POLICY IF EXISTS "Practitioners can delete client session images" ON storage.objects;
CREATE POLICY "Practitioners can delete client session images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'session-images'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.client_practitioner cp
        WHERE cp.practitioner_id = auth.uid()
          AND cp.active = true
          AND cp.client_id::text = (storage.foldername(name))[2]
      )
    )
  );

-- 2. profiles guardian-consent columns  (Live migration 20260621092016)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guardian_consent boolean,
  ADD COLUMN IF NOT EXISTS guardian_first_name text,
  ADD COLUMN IF NOT EXISTS guardian_last_name text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS guardian_email text,
  ADD COLUMN IF NOT EXISTS guardian_consent_at timestamptz;

-- 3. profiles.certification_level  (Live migration 20260814013359)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS certification_level smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_certification_level_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_certification_level_check
      CHECK (certification_level BETWEEN 1 AND 3);
  END IF;
END $$;