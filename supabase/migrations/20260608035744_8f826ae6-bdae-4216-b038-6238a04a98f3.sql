-- Helper that bypasses RLS to check if the caller already has a creator type row.
CREATE OR REPLACE FUNCTION public.creator_type_profile_exists_for(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_type_profiles WHERE user_id = _user_id
  );
$$;

-- Replace the recursive policy.
DROP POLICY IF EXISTS "Members can self-select their creator type" ON public.creator_type_profiles;

CREATE POLICY "Members can self-select their creator type"
ON public.creator_type_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND source = 'self_selected'
  AND NOT public.creator_type_profile_exists_for(auth.uid())
);