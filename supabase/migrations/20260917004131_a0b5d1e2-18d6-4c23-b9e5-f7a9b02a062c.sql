CREATE OR REPLACE FUNCTION public.avatar_publicly_visible(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _owner AND p.community_visible = true AND p.hide_avatar = false
  )
$$;
REVOKE EXECUTE ON FUNCTION public.avatar_publicly_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avatar_publicly_visible(uuid) TO authenticated, service_role;

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
    OR public.avatar_publicly_visible(((storage.foldername(name))[1])::uuid)
  )
);