ALTER FUNCTION public.mark_onboarding_visited(text) SECURITY INVOKER;
ALTER FUNCTION public.get_my_onboarding() SECURITY INVOKER;
ALTER FUNCTION public.preview_onboarding_for_levels(text[]) SECURITY INVOKER;