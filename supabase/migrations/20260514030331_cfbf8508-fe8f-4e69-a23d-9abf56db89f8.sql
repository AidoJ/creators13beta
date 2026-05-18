ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);