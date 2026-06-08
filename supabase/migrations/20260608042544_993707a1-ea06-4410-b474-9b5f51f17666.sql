ALTER TABLE public.profiles
  ALTER COLUMN invitation_code SET DEFAULT public.generate_invitation_code();