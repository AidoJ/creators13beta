
-- Add multi-day event support and event typing to training_calls
ALTER TABLE public.training_calls
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'training_call',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_multi_day boolean NOT NULL DEFAULT false;

-- Backfill starts_at / ends_at from scheduled_at + duration_minutes
UPDATE public.training_calls
SET starts_at = COALESCE(starts_at, scheduled_at),
    ends_at   = COALESCE(ends_at, scheduled_at + make_interval(mins => COALESCE(duration_minutes, 60)))
WHERE starts_at IS NULL OR ends_at IS NULL;

-- Sanity: ends_at must be >= starts_at when both present
ALTER TABLE public.training_calls
  DROP CONSTRAINT IF EXISTS training_calls_time_range_chk;
ALTER TABLE public.training_calls
  ADD CONSTRAINT training_calls_time_range_chk
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at);

-- Track bulk tier invites separately from per-email invitees and from the visibility grid
CREATE TABLE IF NOT EXISTS public.training_call_tier_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_call_id uuid NOT NULL REFERENCES public.training_calls(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('wren','robin','cockatoo','owl')),
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_call_id, tier)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_call_tier_invites TO authenticated;
GRANT ALL ON public.training_call_tier_invites TO service_role;

ALTER TABLE public.training_call_tier_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers manage tier invites"
ON public.training_call_tier_invites
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'trainer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'trainer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
