ALTER TABLE public.training_call_tier_access DROP CONSTRAINT training_call_tier_access_pkey;
ALTER TABLE public.training_call_tier_access ALTER COLUMN tier DROP NOT NULL;
UPDATE public.training_call_tier_access SET level_key = CASE tier WHEN 'wren' THEN 'free' WHEN 'robin' THEN 'creator' WHEN 'cockatoo' THEN 'co_creator' WHEN 'owl' THEN 'owl' END WHERE level_key IS NULL;
ALTER TABLE public.training_call_tier_access ALTER COLUMN level_key SET NOT NULL;
ALTER TABLE public.training_call_tier_access ADD PRIMARY KEY (training_call_id, level_key);