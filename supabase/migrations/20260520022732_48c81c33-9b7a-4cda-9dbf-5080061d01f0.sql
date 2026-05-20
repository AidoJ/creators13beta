
CREATE TABLE public.discord_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  discord_user_id text NOT NULL,
  discord_username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_synced_role text
);

ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own discord link" ON public.discord_links
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own discord link" ON public.discord_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own discord link" ON public.discord_links
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own discord link" ON public.discord_links
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins and trainers manage all discord links" ON public.discord_links
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'trainer'::app_role));
