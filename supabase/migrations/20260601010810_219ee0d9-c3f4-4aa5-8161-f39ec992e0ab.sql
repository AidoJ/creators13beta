
CREATE TABLE public.special_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  kind text NOT NULL,
  name text NOT NULL,
  descriptor text,
  art_path text,
  color_hex text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.special_cards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_cards TO authenticated;
GRANT ALL ON public.special_cards TO service_role;

ALTER TABLE public.special_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Special cards readable by everyone"
  ON public.special_cards FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert special cards"
  ON public.special_cards FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update special cards"
  ON public.special_cards FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete special cards"
  ON public.special_cards FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_special_cards_updated_at
  BEFORE UPDATE ON public.special_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 14 special cards (12 Creator Cards + Sky Creator + Golden Body + Golden Hive)
INSERT INTO public.special_cards (slug, kind, name, color_hex, sort_order) VALUES
  ('creator-lava',      'creator', 'Lava Creator',      '#da7028',  1),
  ('creator-fire',      'creator', 'Fire Creator',      '#eda35e',  2),
  ('creator-whirlwind', 'creator', 'Whirlwind Creator', '#abd49e',  3),
  ('creator-snow',      'creator', 'Snow Creator',      '#c2e5cf',  4),
  ('creator-lightning', 'creator', 'Lightning Creator', '#8fd4b8',  5),
  ('creator-sun',       'creator', 'Sun Creator',       '#f2d178',  6),
  ('creator-lake',      'creator', 'Lake Creator',      '#7db2d9',  7),
  ('creator-ocean',     'creator', 'Ocean Creator',     '#6173b0',  8),
  ('creator-tree',      'creator', 'Tree Creator',      '#db7d75',  9),
  ('creator-mountain',  'creator', 'Mountain Creator',  '#c45463', 10),
  ('creator-soil',      'creator', 'Soil Creator',      '#944a47', 11),
  ('creator-river',     'creator', 'River Creator',     '#99ccd4', 12),
  ('sky-creator',       'sky_creator', 'Sky Creator',   '#bdb2e5', 13),
  ('golden-body',       'golden_body', 'Golden Body',   '#d4a84c', 14),
  ('golden-hive',       'golden_hive', 'Golden Hive',   '#e8b84a', 15);
