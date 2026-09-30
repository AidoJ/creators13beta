DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.get_community_events(timestamptz, timestamptz)'::regprocedure);
  d := replace(d, 'JOIN public.access_levels al ON al.level_key = a2.level_key', 'JOIN public.access_levels al ON al.key = a2.level_key');
  EXECUTE d;
END $$;