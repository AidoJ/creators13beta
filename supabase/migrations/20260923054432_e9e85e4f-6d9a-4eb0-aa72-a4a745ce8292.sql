
CREATE OR REPLACE FUNCTION public.projects_guard_creator_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id AND auth.uid() IS NOT NULL THEN
    IF NOT (auth.uid() = OLD.creator_id OR public.has_role(auth.uid(), 'admin')) THEN
      RAISE EXCEPTION 'Only the project creator can change the Project Creator';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
