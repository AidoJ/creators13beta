
-- Creator Types reference table for the 13 archetypes
CREATE TABLE public.creator_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL,
  element TEXT NOT NULL,
  team_role TEXT,
  creative_power TEXT,
  natural_power TEXT,
  disaster_state TEXT,
  energy_pattern TEXT,
  description TEXT,
  body_markers JSONB DEFAULT '[]'::jsonb,
  color_hex TEXT,
  icon_name TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Public read access for all authenticated users
ALTER TABLE public.creator_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view creator types"
ON public.creator_types
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only trainers can manage the reference data
CREATE POLICY "Trainers can manage creator types"
ON public.creator_types
FOR ALL
USING (has_role(auth.uid(), 'trainer'::app_role));
