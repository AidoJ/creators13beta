DROP POLICY IF EXISTS "Authenticated users can view posts" ON public.community_posts;
CREATE POLICY "Community members can view posts" ON public.community_posts
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'trainer')
  OR EXISTS (SELECT 1 FROM public.my_features() f WHERE f LIKE 'community\_%')
);

DROP POLICY IF EXISTS "family map readable by authenticated" ON public.creator_type_family_map;
CREATE POLICY "family map readable by signed-in users" ON public.creator_type_family_map
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Cards readable by everyone" ON public.game_cards;
CREATE POLICY "Cards readable by signed-in users" ON public.game_cards
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Special cards readable by everyone" ON public.special_cards;
CREATE POLICY "Special cards readable by signed-in users" ON public.special_cards
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read game settings" ON public.game_settings;
CREATE POLICY "Signed-in users can read game settings" ON public.game_settings
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);