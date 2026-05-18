
-- 1. Create a safe practitioner directory view (no PII)
CREATE OR REPLACE VIEW public.practitioner_directory AS
SELECT
  p.user_id,
  p.first_name,
  p.last_name,
  p.display_name,
  p.practitioner_code,
  p.practitioner_status,
  p.avatar_url
FROM profiles p
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = p.user_id
    AND ur.role IN ('practitioner'::app_role, 'trainee'::app_role)
);

-- 2. Replace broad practitioner profile access with the safe view
DROP POLICY IF EXISTS "Authenticated users can view practitioner profiles" ON profiles;

-- 3. Fix storage: scope body drawing SELECT to folder owner (practitioner who uploaded)
DROP POLICY IF EXISTS "Practitioners can view body drawings" ON storage.objects;
CREATE POLICY "Practitioners can view body drawings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'body-drawings'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- 4. Fix storage: scope body drawing INSERT to folder owner
DROP POLICY IF EXISTS "Practitioners can upload body drawings" ON storage.objects;
CREATE POLICY "Practitioners can upload body drawings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'body-drawings'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- 5. Fix storage: scope body drawing UPDATE to folder owner
DROP POLICY IF EXISTS "Practitioners can update body drawings" ON storage.objects;
CREATE POLICY "Practitioners can update body drawings"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'body-drawings'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'body-drawings'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- 6. Fix storage: scope case study attachment SELECT to owning practitioner
DROP POLICY IF EXISTS "Practitioners can view case study attachments" ON storage.objects;
CREATE POLICY "Practitioners can view case study attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'case-study-attachments'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR EXISTS (
        SELECT 1 FROM case_studies cs
        WHERE cs.id::text = (storage.foldername(name))[2]
          AND cs.practitioner_id = auth.uid()
      )
    )
  );

-- 7. Fix storage: scope case study attachment INSERT to owning practitioner
DROP POLICY IF EXISTS "Practitioners can upload case study attachments" ON storage.objects;
CREATE POLICY "Practitioners can upload case study attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'case-study-attachments'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR EXISTS (
        SELECT 1 FROM case_studies cs
        WHERE cs.id::text = (storage.foldername(name))[2]
          AND cs.practitioner_id = auth.uid()
      )
    )
  );

-- 8. Fix storage: scope case study attachment UPDATE to owning practitioner
DROP POLICY IF EXISTS "Practitioners can update case study attachments" ON storage.objects;
CREATE POLICY "Practitioners can update case study attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'case-study-attachments'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR EXISTS (
        SELECT 1 FROM case_studies cs
        WHERE cs.id::text = (storage.foldername(name))[2]
          AND cs.practitioner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'profiling-photos'
    AND (storage.foldername(name))[1] = 'case-study-attachments'
    AND (
      has_role(auth.uid(), 'trainer'::app_role)
      OR EXISTS (
        SELECT 1 FROM case_studies cs
        WHERE cs.id::text = (storage.foldername(name))[2]
          AND cs.practitioner_id = auth.uid()
      )
    )
  );

-- 9. Restrict practitioner subscription access to non-sensitive columns via a view
CREATE OR REPLACE VIEW public.client_subscription_summary AS
SELECT
  s.user_id,
  s.tier,
  s.status,
  s.billing_period,
  s.current_period_start,
  s.current_period_end
FROM subscriptions s;

-- Drop the old broad practitioner subscription policy
DROP POLICY IF EXISTS "Practitioners can view assigned client subscriptions" ON subscriptions;
