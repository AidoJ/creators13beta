
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  name text NOT NULL,
  thumbnail_url text,
  location_label text NOT NULL,
  location_lat numeric,
  location_lng numeric,
  proximity text NOT NULL CHECK (proximity IN ('Remote','In-person','Remote + In-person')),
  url text,
  description text NOT NULL,
  start_date date NOT NULL,
  duration_value integer NOT NULL CHECK (duration_value > 0),
  duration_unit text NOT NULL CHECK (duration_unit IN ('weeks','months')),
  funding_status text NOT NULL CHECK (funding_status IN ('Funding','Seeking Funding','Pro Bono')),
  seeking_creator_types text[] NOT NULL DEFAULT '{}',
  seeking_team_roles text[] NOT NULL DEFAULT '{}',
  seeking_skills text,
  other_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_co_creators (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_projects_creator ON public.projects(creator_id);
CREATE INDEX idx_pcc_user ON public.project_co_creators(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_co_creators TO authenticated;
GRANT ALL ON public.project_co_creators TO service_role;

CREATE OR REPLACE FUNCTION public.is_project_editor(_project uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.creator_id = _user)
      OR EXISTS (SELECT 1 FROM public.project_co_creators c WHERE c.project_id = _project AND c.user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.is_project_creator(_project uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.creator_id = _user)
$$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_co_creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members with projects_view can read projects"
ON public.projects FOR SELECT TO authenticated
USING (
  public.has_feature(auth.uid(), 'projects_view')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'trainer')
);

CREATE POLICY "Editors can create projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  AND (public.has_feature(auth.uid(), 'projects_add_edit') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Creator and co-creators can update projects"
ON public.projects FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_project_editor(id, auth.uid()) AND public.has_feature(auth.uid(), 'projects_add_edit'))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_project_editor(id, auth.uid()) AND public.has_feature(auth.uid(), 'projects_add_edit'))
);

CREATE POLICY "Creator or admin can delete projects"
ON public.projects FOR DELETE TO authenticated
USING (creator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members with projects_view can read co-creators"
ON public.project_co_creators FOR SELECT TO authenticated
USING (
  public.has_feature(auth.uid(), 'projects_view')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'trainer')
);

CREATE POLICY "Editors can tag co-creators"
ON public.project_co_creators FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_project_editor(project_id, auth.uid()) AND public.has_feature(auth.uid(), 'projects_add_edit'))
);

CREATE POLICY "Only creator or admin can remove co-creators"
ON public.project_co_creators FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_project_creator(project_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.projects_guard_creator_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN
    IF NOT (auth.uid() = OLD.creator_id OR public.has_role(auth.uid(), 'admin')) THEN
      RAISE EXCEPTION 'Only the project creator can change the Project Creator';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_guard_creator_change
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_guard_creator_change();
