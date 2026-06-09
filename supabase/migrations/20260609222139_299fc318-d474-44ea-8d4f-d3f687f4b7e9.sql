
DO $$
DECLARE
  v_uid uuid := '902ce915-d8e5-4f09-86af-46c6c3648fcb';
  v_prac uuid := '9984d71c-5bf8-4942-b9bf-30c43b7702f8';
BEGIN
  UPDATE public.profiles
     SET date_of_birth = COALESCE(date_of_birth, DATE '1985-06-15'),
         gender        = COALESCE(gender, 'female'),
         height_cm     = COALESCE(height_cm, 168),
         case_study_consent_at = COALESCE(case_study_consent_at, now())
   WHERE user_id = v_uid;

  INSERT INTO public.client_practitioner (client_id, practitioner_id, active)
  VALUES (v_uid, v_prac, true)
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.profiling_photos WHERE user_id = v_uid) THEN
    INSERT INTO public.profiling_photos (user_id, photo_type, storage_path)
    VALUES (v_uid, 'front_face', 'placeholder/test1-front_face.jpg');
  END IF;
END $$;
