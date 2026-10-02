DO $$ DECLARE r record; BEGIN
FOR r IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='generate_match_invite_code' LOOP
EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END LOOP; END $$;