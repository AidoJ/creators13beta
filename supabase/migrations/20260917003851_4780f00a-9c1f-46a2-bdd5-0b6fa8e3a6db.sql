-- 1. Case study subjects: approved only
DROP POLICY IF EXISTS "Subjects can view their own approved case studies" ON public.case_studies;
CREATE POLICY "Subjects can view their own approved case studies"
ON public.case_studies FOR SELECT TO authenticated
USING (auth.uid() = subject_user_id AND status = 'approved');

-- 2. Avatar reads scoped
DROP POLICY IF EXISTS profile_avatars_auth_read ON storage.objects;
CREATE POLICY profile_avatars_auth_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'trainer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_practitioner cp
      WHERE cp.practitioner_id = auth.uid()
        AND cp.client_id::text = (storage.foldername(name))[1]
        AND cp.active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.community_visible = true
        AND p.hide_avatar = false
    )
  )
);

-- 3. Revoke EXECUTE on internal-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_validate_contact_channels() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_case_study_creator_types() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_bookings_bump_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_cp_bump_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_photos_bump_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_profile_details_bump_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_subs_bump_activity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_practitioner_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._bump_enrollment_activity(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pick_quiz_question(uuid, text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acquire_sweep_lease(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_open_quiz(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_quiz_if_needed(uuid, uuid, text[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_quiz_if_needed(uuid, uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalise_ranked_match(uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enrollment_activity_close_episode() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_enrollment_reminders_opt_out_token(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_marketing_unsubscribe_token(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_creator_of_the_month(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invitation_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_match_invite_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_move(uuid, bigint, uuid, jsonb, jsonb, jsonb, uuid, boolean, jsonb, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_community_members(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_community_events(timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_match_state(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_active_matches() FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_game_invite(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_lobby_match(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_lobby_host_roster(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, uuid, quiz_option) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_bot_match_stats(text, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_self_practitioner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_invitation_account_created() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_player_quiz_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_player_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_inviting_practitioners_for_current_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_enrollment_practitioner_options(text) FROM anon;
