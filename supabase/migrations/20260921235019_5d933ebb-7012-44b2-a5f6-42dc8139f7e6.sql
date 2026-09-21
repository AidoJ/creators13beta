DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_readonly') THEN CREATE ROLE agent_readonly NOLOGIN NOINHERIT; END IF; END $$;

GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_readonly;
REVOKE SELECT ON public.profiling_photos FROM agent_readonly;
REVOKE SELECT ON public.client_session_images FROM agent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_readonly;

CREATE OR REPLACE FUNCTION public.agent_readonly_query(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  s text := btrim(_sql, E' \t\r\n;');
BEGIN
  IF s !~* '^(select|with)[[:space:]]' THEN
    RAISE EXCEPTION 'Only SELECT/WITH queries are allowed';
  END IF;
  IF position(';' in s) > 0 THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;
  SET LOCAL ROLE agent_readonly;
  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 500) t', s) INTO r;
  RESET ROLE;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_readonly_query(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_readonly_query(text) FROM anon;
REVOKE ALL ON FUNCTION public.agent_readonly_query(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agent_readonly_query(text) TO service_role;