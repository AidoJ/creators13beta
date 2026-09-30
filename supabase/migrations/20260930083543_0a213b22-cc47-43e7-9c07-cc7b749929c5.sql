ALTER TABLE public.prospectus_sections
ADD COLUMN IF NOT EXISTS canvas_layout jsonb;

CREATE TABLE public.staff_guide_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  route text NOT NULL DEFAULT '',
  audience text[] NOT NULL DEFAULT ARRAY['admin','trainer']::text[],
  sort_order integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_guide_steps TO authenticated;
GRANT ALL ON public.staff_guide_steps TO service_role;
ALTER TABLE public.staff_guide_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read the staff guide"
ON public.staff_guide_steps FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer')
);
CREATE POLICY "Admins can add staff guide steps"
ON public.staff_guide_steps FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update staff guide steps"
ON public.staff_guide_steps FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete staff guide steps"
ON public.staff_guide_steps FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER staff_guide_steps_touch_updated_at
BEFORE UPDATE ON public.staff_guide_steps
FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch_updated_at();

INSERT INTO public.staff_guide_steps (title, body, route, audience, sort_order) VALUES
('Review profiling work', 'Open the current profiling and case-study queues, then continue the next item requiring your role.', '/trainer', ARRAY['trainer'], 10),
('Manage practitioner work', 'Open clients, invitations, case studies and profiling tools available to your practitioner access.', '/practitioner', ARRAY['trainer'], 20),
('Manage member access', 'Review memberships and access grants without changing a member’s role.', '/admin?tab=access', ARRAY['admin'], 30),
('Edit Getting Started', 'Update checklist wording and preview the merged guide for selected access levels.', '/admin?tab=onboarding', ARRAY['admin'], 40),
('Review payments', 'Open test-mode payment reporting, refunds, cancellations and fee status.', '/admin?tab=payments', ARRAY['admin'], 50),
('Edit the practitioner prospectus', 'Open the prospectus visual page editor and publish updated wording and pictures.', '/admin?tab=prospectus', ARRAY['admin'], 60)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.reset_onboarding_tour()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.onboarding_state (user_id, visited)
  VALUES (auth.uid(), '{}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE
  SET visited = COALESCE(public.onboarding_state.visited, '{}'::jsonb) - 'welcome_tour_complete' - 'hint_community' - 'hint_events' - 'hint_projects' - 'hint_practitioner',
      updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.reset_onboarding_tour() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_onboarding_tour() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_access_catalog()
RETURNS TABLE(level_key text, level_name text, level_order integer, feature_key text, feature_name text, feature_category text, held boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH held_levels AS (
    SELECT DISTINCT e.level_key
    FROM public.entitlements e
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
    UNION SELECT 'free'
  ), highest_membership AS (
    SELECT COALESCE(MAX(al.sort_order) FILTER (WHERE al.key IN ('free','taster','creator','co_creator','owl')), 10) AS n
    FROM public.access_levels al JOIN held_levels hl ON hl.level_key = al.key
  )
  SELECT al.key, al.display_name, al.sort_order, f.key, f.display_name, f.category,
         EXISTS (SELECT 1 FROM held_levels hl WHERE hl.level_key = ag.level_key)
  FROM public.access_grid ag
  JOIN public.access_levels al ON al.key = ag.level_key
  JOIN public.features f ON f.key = ag.feature_key
  CROSS JOIN highest_membership hm
  WHERE auth.uid() IS NOT NULL
    AND (ag.level_key IN (SELECT level_key FROM held_levels)
      OR (al.key IN ('taster','creator','co_creator','owl') AND al.sort_order = (
        SELECT MIN(al2.sort_order) FROM public.access_levels al2
        WHERE al2.key IN ('taster','creator','co_creator','owl') AND al2.sort_order > hm.n
      )))
  ORDER BY al.sort_order, f.category, f.display_name;
$$;
REVOKE ALL ON FUNCTION public.get_my_access_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access_catalog() TO authenticated;