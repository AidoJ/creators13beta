DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname IN
    ('_bump_enrollment_activity','acquire_sweep_lease','close_open_quiz','commit_move',
     'ensure_enrollment_reminders_opt_out_token','finalise_ranked_match','open_quiz_if_needed',
     'generate_practitioner_code','generate_match_invite_code')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname <> 'generate_match_invite_code' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;