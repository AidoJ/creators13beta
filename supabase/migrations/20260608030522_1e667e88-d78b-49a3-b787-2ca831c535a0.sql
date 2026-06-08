
-- ============================================================
-- BATCH 1: Community Foundation Schema
-- ============================================================

-- ---------- 1. profiles: location + referral + visibility ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_label    text,
  ADD COLUMN IF NOT EXISTS location_lat      numeric(8,6),
  ADD COLUMN IF NOT EXISTS location_lng      numeric(9,6),
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS community_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_invited_by  ON public.profiles(invited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_community_visible ON public.profiles(community_visible) WHERE community_visible = true;

-- Lat/lng are server-written only. Block client updates via a trigger.
CREATE OR REPLACE FUNCTION public.profiles_guard_location_coords()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses this (auth.uid() is null AND role is service_role),
  -- but ordinary authenticated users cannot change coords directly.
  IF auth.uid() IS NOT NULL
     AND (NEW.location_lat IS DISTINCT FROM OLD.location_lat
       OR NEW.location_lng IS DISTINCT FROM OLD.location_lng) THEN
    RAISE EXCEPTION 'location coordinates are server-managed; update location_label only';
  END IF;

  -- invited_by_user_id is write-once
  IF auth.uid() IS NOT NULL
     AND OLD.invited_by_user_id IS NOT NULL
     AND NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
    RAISE EXCEPTION 'invited_by_user_id is immutable once set';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_location_coords ON public.profiles;
CREATE TRIGGER trg_profiles_guard_location_coords
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_location_coords();


-- ---------- 2. creator_type_profiles: source + lock trigger + check ----------
ALTER TABLE public.creator_type_profiles
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'practitioner';

ALTER TABLE public.creator_type_profiles
  DROP CONSTRAINT IF EXISTS creator_type_profiles_source_check;
ALTER TABLE public.creator_type_profiles
  ADD CONSTRAINT creator_type_profiles_source_check
  CHECK (source IN ('practitioner','case_study','self_selected'));

-- Self-selected rows must have exactly one type (primary only).
ALTER TABLE public.creator_type_profiles
  DROP CONSTRAINT IF EXISTS creator_type_profiles_self_selected_single_type;
ALTER TABLE public.creator_type_profiles
  ADD CONSTRAINT creator_type_profiles_self_selected_single_type
  CHECK (
    source <> 'self_selected'
    OR (
      primary_type IS NOT NULL
      AND secondary_type IS NULL
      AND type_3 IS NULL
      AND type_4 IS NULL
    )
  );

-- Lock rule: once source = 'practitioner' or 'case_study', the row cannot be
-- downgraded to 'self_selected', and self-selected rows cannot mutate types
-- via the member's own auth context once a practitioner assignment exists.
CREATE OR REPLACE FUNCTION public.creator_type_profiles_lock_practitioner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / trainer / admin bypass: allow any transition.
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'trainer'::app_role)
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Practitioner / case_study assignments are locked from downgrade.
  IF OLD.source IN ('practitioner','case_study')
     AND NEW.source = 'self_selected' THEN
    RAISE EXCEPTION 'cannot downgrade a practitioner/case_study assignment to self_selected';
  END IF;

  -- A practitioner (not the subject) edits via the existing RLS path; we only
  -- block the subject from overwriting a practitioner-assigned row with their
  -- own self-selection.
  IF OLD.source IN ('practitioner','case_study')
     AND NEW.user_id = auth.uid()
     AND NOT (public.has_role(auth.uid(), 'practitioner'::app_role)
              OR public.has_role(auth.uid(), 'trainee'::app_role)) THEN
    RAISE EXCEPTION 'creator type is locked by a practitioner assignment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creator_type_profiles_lock ON public.creator_type_profiles;
CREATE TRIGGER trg_creator_type_profiles_lock
  BEFORE UPDATE ON public.creator_type_profiles
  FOR EACH ROW EXECUTE FUNCTION public.creator_type_profiles_lock_practitioner_assignment();

-- Allow members to self-insert ONLY a self_selected row, and only when no
-- prior assignment exists.
CREATE POLICY "Members can self-select their creator type"
ON public.creator_type_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND source = 'self_selected'
  AND NOT EXISTS (
    SELECT 1 FROM public.creator_type_profiles existing
    WHERE existing.user_id = auth.uid()
  )
);


-- ---------- 3. member_animals (schema only; population deferred) ----------
CREATE TABLE IF NOT EXISTS public.member_animals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_slug       text NOT NULL REFERENCES public.game_cards(slug) ON DELETE CASCADE,
  pinned          boolean NOT NULL DEFAULT false,
  hidden          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_slug)
);

COMMENT ON TABLE public.member_animals IS
  'Reserved for Phase 2.2 — population strategy TBD. Do not auto-derive in Batch 1.';

CREATE INDEX IF NOT EXISTS idx_member_animals_user ON public.member_animals(user_id);
CREATE INDEX IF NOT EXISTS idx_member_animals_card ON public.member_animals(card_slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_animals TO authenticated;
GRANT ALL ON public.member_animals TO service_role;

ALTER TABLE public.member_animals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own animals"
ON public.member_animals
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Trainers and admins view all member animals"
ON public.member_animals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'trainer'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_member_animals_updated_at
  BEFORE UPDATE ON public.member_animals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- 4. system_settings (key/value site config) ----------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins and trainers manage system settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'trainer'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'trainer'::app_role));

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Creator of the Month placeholder
INSERT INTO public.system_settings (key, value)
VALUES ('current_creator_of_the_month',
        jsonb_build_object('creator_type', 'lava', 'set_at', now()))
ON CONFLICT (key) DO NOTHING;
