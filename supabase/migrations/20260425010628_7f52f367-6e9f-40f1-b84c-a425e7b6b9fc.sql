CREATE OR REPLACE FUNCTION public.mark_invitation_link_clicked(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.client_invitations
  SET status = 'link_clicked'
  WHERE invite_token = _token
    AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.mark_invitation_link_clicked(text) TO anon, authenticated;