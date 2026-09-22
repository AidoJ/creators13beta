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
  IF s ~* '\m(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|refresh|comment|set|reset|listen|notify|lock|prepare|execute|begin|commit|rollback|savepoint)\M' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;
  IF s ~* '\m(profiling_photos|client_session_images|pg_authid|pg_shadow|vault|secrets|pgsodium)\M' THEN
    RAISE EXCEPTION 'That table is not available to read-only agents';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 500) t', s) INTO r;
  RETURN r;
END;
$$;