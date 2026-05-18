
-- Fix views to use SECURITY INVOKER so RLS is enforced per querying user
ALTER VIEW public.practitioner_directory SET (security_invoker = on);
ALTER VIEW public.client_subscription_summary SET (security_invoker = on);
