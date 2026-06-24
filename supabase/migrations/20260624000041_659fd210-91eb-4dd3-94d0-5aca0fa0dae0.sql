-- A.4 — Presence & disconnect handling: tunable config + cron sweep.

-- 1. Tunable config columns on game_settings (so debounce/grace can be
--    adjusted from beta evidence without redeploy).
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS presence_debounce_seconds int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS disconnect_grace_seconds  int NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS disconnect_sweep_interval_seconds int NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.game_settings.presence_debounce_seconds IS
  'Seconds of presence silence before a player is considered disconnected. Tunable from beta data — short values cause grace-clock flapping on transient blips; long values delay the indicator.';
COMMENT ON COLUMN public.game_settings.disconnect_grace_seconds IS
  'Seconds a disconnected player remains in the match before being forfeited (ranked by score, NOT routed through the quitter/concede bottom-band).';
COMMENT ON COLUMN public.game_settings.disconnect_sweep_interval_seconds IS
  'Informational: actual cron schedule is fixed at 30s. Update both this value and the cron schedule if changing.';

-- 2. Helpful indexes for the sweep query.
CREATE INDEX IF NOT EXISTS idx_gmp_disconnected_at
  ON public.game_match_players (disconnected_at)
  WHERE disconnected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gmp_last_seen_at_status
  ON public.game_match_players (status, last_seen_at);

-- 3. Schedule the disconnect sweep every 30s. Reuses the existing
--    pg_cron + pg_net pattern (extensions already enabled for other crons).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'forfeit_stale_disconnects') THEN
    PERFORM cron.unschedule('forfeit_stale_disconnects');
  END IF;

  PERFORM cron.schedule(
    'forfeit_stale_disconnects',
    '30 seconds',
    $cron$
      select net.http_post(
        url := 'https://kbcxvycgwtoxqkbpcesi.supabase.co/functions/v1/forfeit-stale-disconnects',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiY3h2eWNnd3RveHFrYnBjZXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjk3NzcsImV4cCI6MjA5NDY0NTc3N30.O_boD6z8BioGJlllVR3uy_7cXWMINDvulbqsb5M0ASM'
        ),
        body := jsonb_build_object('triggered_at', now())
      );
    $cron$
  );
END $$;