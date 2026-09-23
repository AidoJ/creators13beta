-- RLS already limits invitation updates to trainer/admin roles, but no browser
-- workflow performs them. Remove the table privilege so a future policy change
-- cannot re-expose payment or entitlement fields. SECURITY DEFINER and service-role
-- update paths are unaffected.
REVOKE UPDATE ON public.client_invitations FROM authenticated;
GRANT ALL ON public.client_invitations TO service_role;