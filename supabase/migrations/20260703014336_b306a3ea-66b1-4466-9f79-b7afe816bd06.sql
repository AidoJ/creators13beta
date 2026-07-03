
DROP TABLE IF EXISTS public.discord_oauth_states;
DROP TABLE IF EXISTS public.discord_links;
ALTER TABLE public.game_settings DROP COLUMN IF EXISTS show_discord_chat;
