ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_stock_avatar_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_stock_avatar_check
  CHECK (stock_avatar IS NULL OR stock_avatar = ANY (ARRAY[
    'lava','fire','whirlwind','snow','lightning','sun','lake','ocean','tree','mountain','soil','river','sky',
    'woman-blue-scarf','man-glasses','man-brown-hair','woman-teacher','anime-boy','girl-buns','teddy-bear','penguin'
  ]));