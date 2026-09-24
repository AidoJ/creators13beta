CREATE OR REPLACE FUNCTION public._sync_practitioner_certification(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status practitioner_status;
  v_level smallint;
  v_key text;
BEGIN
  SELECT practitioner_status, certification_level INTO v_status, v_level
    FROM public.profiles WHERE user_id = _user_id;

  IF v_status = 'certified' THEN
    v_key := 'prac_l' || COALESCE(v_level, 1) || '_certified';
    -- end any other certified-level access
    UPDATE public.entitlements SET status = 'cancelled', ends_at = now(), updated_at = now()
     WHERE user_id = _user_id AND status = 'active'
       AND level_key IN ('prac_l1_certified','prac_l2_certified','prac_l3_certified')
       AND level_key <> v_key;
    IF NOT EXISTS (SELECT 1 FROM public.entitlements WHERE user_id = _user_id AND status = 'active' AND level_key = v_key) THEN
      INSERT INTO public.entitlements (user_id, level_key, source, status) VALUES (_user_id, v_key, 'admin', 'active');
    END IF;
    -- role transition: trainee -> practitioner
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'practitioner') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'trainee';
  ELSE
    UPDATE public.entitlements SET status = 'cancelled', ends_at = now(), updated_at = now()
     WHERE user_id = _user_id AND status = 'active'
       AND level_key IN ('prac_l1_certified','prac_l2_certified','prac_l3_certified');
    IF v_status IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'practitioner') THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'trainee') ON CONFLICT (user_id, role) DO NOTHING;
      DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'practitioner'
        AND NOT public.has_role(_user_id, 'trainer');
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._sync_practitioner_certification(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_practitioner_certification(_user_id uuid, _status practitioner_status DEFAULT NULL, _certification_level smallint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'trainer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Trainer or admin access required' USING ERRCODE = '42501';
  END IF;

  IF _certification_level IS NOT NULL AND _certification_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Certification level must be between 1 and 3' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET practitioner_status = COALESCE(_status, practitioner_status),
         certification_level = COALESCE(_certification_level, certification_level)
   WHERE user_id = _user_id;

  PERFORM public._sync_practitioner_certification(_user_id);
END;
$$;

-- Retroactive: everyone already certified
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE practitioner_status = 'certified' LOOP
    PERFORM public._sync_practitioner_certification(r.user_id);
  END LOOP;
END $$;