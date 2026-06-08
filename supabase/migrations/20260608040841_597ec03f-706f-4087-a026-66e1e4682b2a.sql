ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS community_joined_at timestamptz;

COMMENT ON COLUMN public.profiles.member_preferences IS
  'Per-member preferences: match visibility, contact prefs, notification opt-ins, etc. Free-shape jsonb; document keys as they are added.';
COMMENT ON COLUMN public.profiles.community_joined_at IS
  'Timestamp the member first opted into community discoverability. NULL = never opted in. Distinct from profile creation: not every authenticated user is a community member.';

REVOKE EXECUTE ON FUNCTION public.profiles_guard_location_coords()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.creator_type_profiles_lock_practitioner_assignment()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.creator_type_profile_exists_for(uuid)
  FROM PUBLIC, anon, authenticated;