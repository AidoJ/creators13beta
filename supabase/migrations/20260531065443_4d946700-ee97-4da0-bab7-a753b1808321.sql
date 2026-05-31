
-- Single-row global game settings (id = 'global')
CREATE TABLE public.game_settings (
  id text NOT NULL PRIMARY KEY DEFAULT 'global',
  -- Scoring & Progression
  points_per_win integer NOT NULL DEFAULT 3,
  elo_win integer NOT NULL DEFAULT 20,
  elo_loss integer NOT NULL DEFAULT -15,
  perfect_eco_bonus integer NOT NULL DEFAULT 0,
  -- Game Mode defaults
  top_score_default integer NOT NULL DEFAULT 50,
  beat_clock_match_minutes integer NOT NULL DEFAULT 20,
  beat_clock_turn_seconds integer NOT NULL DEFAULT 20,
  mode_end_of_days_enabled boolean NOT NULL DEFAULT true,
  mode_top_score_enabled boolean NOT NULL DEFAULT true,
  mode_beat_clock_enabled boolean NOT NULL DEFAULT true,
  default_mode text NOT NULL DEFAULT 'end_of_days',
  -- Match Rules
  hand_size integer NOT NULL DEFAULT 5,
  hand_limit integer NOT NULL DEFAULT 10,
  ecosystem_target integer NOT NULL DEFAULT 16,
  creators_needed integer NOT NULL DEFAULT 4,
  animals_per_creator integer NOT NULL DEFAULT 3,
  enable_disasters boolean NOT NULL DEFAULT true,
  enable_golden_hive boolean NOT NULL DEFAULT true,
  enable_sky_creator boolean NOT NULL DEFAULT true,
  enable_golden_body boolean NOT NULL DEFAULT true,
  enable_sky_creature_steal boolean NOT NULL DEFAULT true,
  -- Meta
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.game_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.game_settings TO authenticated;
GRANT ALL ON public.game_settings TO service_role;

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game settings"
  ON public.game_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins/trainers can insert game settings"
  ON public.game_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role));

CREATE POLICY "Admins/trainers can update game settings"
  ON public.game_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role));

CREATE TRIGGER game_settings_set_updated_at
BEFORE UPDATE ON public.game_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the single global row
INSERT INTO public.game_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;
