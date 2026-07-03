
CREATE TABLE public.discord_oauth_states (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_base text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Only edge functions (service_role) read/write this. No end-user access.
GRANT ALL ON public.discord_oauth_states TO service_role;

ALTER TABLE public.discord_oauth_states ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated => fully locked to service_role.
CREATE INDEX idx_discord_oauth_states_expires ON public.discord_oauth_states(expires_at);
