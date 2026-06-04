-- Step 1: schema scaffolding for server-authoritative moves.
-- Backward compatible: existing matches keep working with their JSONB state.

ALTER TABLE public.game_matches
  ADD COLUMN IF NOT EXISTS seq          bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rng_seed     bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_state jsonb,
  ADD COLUMN IF NOT EXISTS is_ranked    boolean NOT NULL DEFAULT true;

-- Bot/solo matches are never ranked (per design decision #3).
UPDATE public.game_matches
   SET is_ranked = false
 WHERE mode = 'solo';

CREATE TABLE IF NOT EXISTS public.game_match_moves (
  match_id   uuid        NOT NULL REFERENCES public.game_matches(id) ON DELETE CASCADE,
  seq        bigint      NOT NULL,
  actor      uuid        NOT NULL,
  move       jsonb       NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, seq)
);

CREATE INDEX IF NOT EXISTS game_match_moves_match_idx
  ON public.game_match_moves (match_id, seq);

GRANT SELECT ON public.game_match_moves TO authenticated;
GRANT ALL    ON public.game_match_moves TO service_role;

ALTER TABLE public.game_match_moves ENABLE ROW LEVEL SECURITY;

-- Host & guest can read the move log for their match.
CREATE POLICY "Players can view their match moves"
  ON public.game_match_moves
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_matches m
       WHERE m.id = game_match_moves.match_id
         AND (m.host_user_id = auth.uid() OR m.guest_user_id = auth.uid())
    )
  );

-- No client INSERT/UPDATE/DELETE policies — writes happen via SECURITY DEFINER RPC only.
