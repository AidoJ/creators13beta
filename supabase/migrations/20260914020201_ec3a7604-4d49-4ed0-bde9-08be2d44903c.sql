-- ============ enums ============
CREATE TYPE public.entitlement_source AS ENUM ('stripe','admin','code','backfill');
CREATE TYPE public.entitlement_status AS ENUM ('active','cancelled','expired');

-- ============ access_levels ============
CREATE TABLE public.access_levels (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.access_levels TO authenticated;
GRANT ALL ON public.access_levels TO service_role;
ALTER TABLE public.access_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read access levels" ON public.access_levels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage access levels" ON public.access_levels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.access_levels (key, display_name, sort_order) VALUES
  ('free','Free',10),
  ('taster','Taster',20),
  ('creator','Creator',30),
  ('co_creator','Co-Creator',40),
  ('prac_l1_trainee','Practitioner L1 Trainee',50),
  ('prac_l1_certified','Practitioner L1 Certified',60),
  ('prac_l2_trainee','Practitioner L2 Trainee',70),
  ('prac_l2_certified','Practitioner L2 Certified',80),
  ('prac_l3_trainee','Practitioner L3 Trainee',90),
  ('prac_l3_certified','Practitioner L3 Certified',100),
  ('case_study','Case Study',110),
  ('profile_face','Face Profile',120),
  ('profile_body','Body Profile',130),
  ('profile_adv_body','Advanced Body Profile',140),
  ('existing_profiled','Existing Profiled',150);

-- ============ features ============
CREATE TABLE public.features (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.features TO authenticated;
GRANT ALL ON public.features TO service_role;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read features" ON public.features
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage features" ON public.features
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.features (key, display_name, category) VALUES
  ('game_bot_player','Play against the bot','GAME'),
  ('game_1v1_player','Play 1 v 1','GAME'),
  ('game_multiplayer','Multiplayer matches','GAME'),
  ('community_view_members_map','View members map','COMMUNITY'),
  ('community_view_member_profiles','View member profiles','COMMUNITY'),
  ('community_create_profile_general','Create general community profile','COMMUNITY'),
  ('community_message_members','Message members','COMMUNITY'),
  ('community_matching_filters','Matching filters','COMMUNITY'),
  ('community_create_profile_project','Create project profile','COMMUNITY'),
  ('dashboard_view_creator_profiles','View Creator profiles','DASHBOARD'),
  ('dashboard_upload_photos','Upload photos','DASHBOARD'),
  ('dashboard_settings','Dashboard settings','DASHBOARD'),
  ('projects_view','View projects','PROJECTS'),
  ('projects_add_edit','Add and edit projects','PROJECTS'),
  ('shop_view_purchase','View and purchase in shop','SHOP'),
  ('shop_manage_subscription','Manage subscription','SHOP'),
  ('events_view','View events','EVENTS'),
  ('events_create','Create events','EVENTS'),
  ('prac_case_study_creation','Create case studies','PRACTITIONER'),
  ('prac_code_assigned','Practitioner code assigned','PRACTITIONER'),
  ('prac_profiling_tools','Profiling tools','PRACTITIONER'),
  ('prac_assign_ct_client','Assign Creator Types to clients','PRACTITIONER'),
  ('prac_assign_ct_case_study','Assign Creator Types via case study','PRACTITIONER'),
  ('prac_upload_client_files','Upload client files','PRACTITIONER');

-- ============ access_grid (intentionally empty) ============
CREATE TABLE public.access_grid (
  feature_key text NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  level_key text NOT NULL REFERENCES public.access_levels(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_key, level_key)
);
GRANT SELECT ON public.access_grid TO authenticated;
GRANT ALL ON public.access_grid TO service_role;
ALTER TABLE public.access_grid ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read access grid" ON public.access_grid
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage access grid" ON public.access_grid
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ entitlements ============
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_key text NOT NULL REFERENCES public.access_levels(key),
  source public.entitlement_source NOT NULL,
  stripe_ref text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status public.entitlement_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlements_user_status_idx ON public.entitlements (user_id, status);

GRANT SELECT ON public.entitlements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Users: read own only. No client write policy of any kind for plain members.
CREATE POLICY "Users read own entitlements" ON public.entitlements
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Staff read all entitlements" ON public.entitlements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'trainer'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Staff insert entitlements" ON public.entitlements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'trainer'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Staff update entitlements" ON public.entitlements
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'trainer'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'trainer'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Staff delete entitlements" ON public.entitlements
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'trainer'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ functions ============
CREATE OR REPLACE FUNCTION public.has_feature(_uid uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.access_grid g
    WHERE g.feature_key = _feature_key
      AND (
        g.level_key = 'free'
        OR g.level_key IN (
          SELECT e.level_key FROM public.entitlements e
          WHERE e.user_id = _uid
            AND e.status = 'active'
            AND e.starts_at <= now()
            AND (e.ends_at IS NULL OR e.ends_at > now())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.my_features()
RETURNS SETOF text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT g.feature_key FROM public.access_grid g
  WHERE g.level_key = 'free'
     OR g.level_key IN (
       SELECT e.level_key FROM public.entitlements e
       WHERE e.user_id = auth.uid()
         AND e.status = 'active'
         AND e.starts_at <= now()
         AND (e.ends_at IS NULL OR e.ends_at > now())
     );
$$;

REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_features() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_features() TO authenticated, service_role;