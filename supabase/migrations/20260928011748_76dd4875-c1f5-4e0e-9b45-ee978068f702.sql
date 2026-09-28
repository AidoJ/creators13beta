ALTER TABLE public.products
  ADD COLUMN storefront_placement text NOT NULL DEFAULT 'main',
  ADD COLUMN display_order integer NOT NULL DEFAULT 100;
ALTER TABLE public.products
  ADD CONSTRAINT products_storefront_placement_chk CHECK (storefront_placement IN ('main','extra'));
UPDATE public.products SET storefront_placement = 'extra' WHERE id = '00716212-a0cf-4995-91b7-6cbf5301776d';