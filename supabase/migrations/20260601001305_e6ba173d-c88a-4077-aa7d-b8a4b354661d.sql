DELETE FROM public.game_cards WHERE slug = 'arctic-hare';

UPDATE public.game_cards
SET slug = 'lynx', name = 'Lynx', type_a = 'Mountain', type_b = 'Snow'
WHERE slug = 'snow-leopard';

UPDATE public.game_cards
SET slug = 'elf', name = 'Elf', type_a = 'Sky', type_b = 'Tree'
WHERE slug = 'knome';