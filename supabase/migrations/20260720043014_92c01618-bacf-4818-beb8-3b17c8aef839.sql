
-- Profiles: recovery-related fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_enrollment_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrollment_reminders_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrollment_reminders_opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrollment_reminders_opt_out_token text,
  ADD COLUMN IF NOT EXISTS enrollment_recovery_resume_token_hash text,
  ADD COLUMN IF NOT EXISTS enrollment_recovery_resume_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_enrollment_reminders_opt_out_token_idx
  ON public.profiles(enrollment_reminders_opt_out_token)
  WHERE enrollment_reminders_opt_out_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_enrollment_recovery_resume_token_hash_idx
  ON public.profiles(enrollment_recovery_resume_token_hash)
  WHERE enrollment_recovery_resume_token_hash IS NOT NULL;

-- Game settings: recovery thresholds
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS enrollment_recovery_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS enrollment_paygate_recovery_hours integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS enrollment_recovery_followup_days integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS enrollment_recovery_followup_enabled boolean NOT NULL DEFAULT true;

-- Episodes: one per abandonment window
CREATE TABLE IF NOT EXISTS public.enrollment_recovery_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_key text NOT NULL,             -- 'plan' | 'practitioner' | 'details' | 'consent' | 'photos' | 'booking' | 'paygate'
  paygate boolean NOT NULL DEFAULT false,
  emails_sent integer NOT NULL DEFAULT 0,
  first_email_sent_at timestamptz,
  last_email_sent_at timestamptz,
  clicked_at timestamptz,
  resumed_at timestamptz,
  completed_at timestamptz,
  closed_reason text,                 -- 'progressed' | 'completed' | 'opted_out' | 'suppressed' | 'cap_reached'
  closed_at timestamptz,
  discount_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one OPEN (not closed) episode per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_recovery_episodes_open_unique
  ON public.enrollment_recovery_episodes(user_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS enrollment_recovery_episodes_user_idx
  ON public.enrollment_recovery_episodes(user_id, created_at DESC);

GRANT SELECT ON public.enrollment_recovery_episodes TO authenticated;
GRANT ALL ON public.enrollment_recovery_episodes TO service_role;
ALTER TABLE public.enrollment_recovery_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own episodes readable"
  ON public.enrollment_recovery_episodes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_enrollment_recovery_episodes_updated_at
  BEFORE UPDATE ON public.enrollment_recovery_episodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Events: append-only audit log
CREATE TABLE IF NOT EXISTS public.enrollment_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid REFERENCES public.enrollment_recovery_episodes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,                -- 'sent' | 'clicked' | 'resumed' | 'completed' | 'unsubscribed' | 'suppressed' | 'skipped'
  step_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollment_recovery_events_episode_idx
  ON public.enrollment_recovery_events(episode_id, created_at);
CREATE INDEX IF NOT EXISTS enrollment_recovery_events_user_idx
  ON public.enrollment_recovery_events(user_id, created_at DESC);

GRANT SELECT ON public.enrollment_recovery_events TO authenticated;
GRANT ALL ON public.enrollment_recovery_events TO service_role;
ALTER TABLE public.enrollment_recovery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own events readable"
  ON public.enrollment_recovery_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- When last_enrollment_activity_at moves forward, close any open episode
-- as 'progressed' and clear reached_checkout_at (staleness guard).
CREATE OR REPLACE FUNCTION public.enrollment_activity_close_episode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_enrollment_activity_at IS DISTINCT FROM OLD.last_enrollment_activity_at
     AND NEW.last_enrollment_activity_at > COALESCE(OLD.last_enrollment_activity_at, 'epoch'::timestamptz) THEN
    -- Close any open episode as forward-progress
    UPDATE public.enrollment_recovery_episodes
       SET closed_at = now(),
           closed_reason = 'progressed',
           updated_at = now()
     WHERE user_id = NEW.user_id AND closed_at IS NULL;

    -- Clear stale paygate timestamp
    NEW.reached_checkout_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_activity_close_episode ON public.profiles;
CREATE TRIGGER trg_enrollment_activity_close_episode
  BEFORE UPDATE OF last_enrollment_activity_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enrollment_activity_close_episode();

-- Helper: called from client on any real enrolment-step write.
CREATE OR REPLACE FUNCTION public.mark_enrollment_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET last_enrollment_activity_at = now()
   WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_enrollment_activity() TO authenticated;

-- Reminder unsubscribe: token-based, no auth required.
CREATE OR REPLACE FUNCTION public.ensure_enrollment_reminders_opt_out_token(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_token text;
BEGIN
  SELECT enrollment_reminders_opt_out_token INTO v_token
    FROM public.profiles WHERE user_id = _user_id;
  IF v_token IS NULL OR length(v_token) < 20 THEN
    v_token := encode(gen_random_bytes(32), 'hex');
    UPDATE public.profiles
       SET enrollment_reminders_opt_out_token = v_token
     WHERE user_id = _user_id;
  END IF;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.enrollment_reminders_unsubscribe(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN RETURN false; END IF;
  SELECT user_id INTO v_user
    FROM public.profiles WHERE enrollment_reminders_opt_out_token = _token;
  IF v_user IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles
     SET enrollment_reminders_opt_out = true,
         enrollment_reminders_opt_out_at = now()
   WHERE user_id = v_user;

  -- Close any open episode with 'opted_out' and log event.
  UPDATE public.enrollment_recovery_episodes
     SET closed_at = now(), closed_reason = 'opted_out', updated_at = now()
   WHERE user_id = v_user AND closed_at IS NULL;

  INSERT INTO public.enrollment_recovery_events(user_id, event, metadata)
    VALUES (v_user, 'unsubscribed', jsonb_build_object('source','link'));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enrollment_reminders_unsubscribe(text) TO anon, authenticated;
