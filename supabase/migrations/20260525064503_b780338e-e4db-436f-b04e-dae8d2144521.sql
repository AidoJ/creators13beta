-- Phase 1: card catalogue
CREATE TABLE public.game_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  type_a text NOT NULL,
  type_b text NOT NULL,
  mythical boolean NOT NULL DEFAULT false,
  descriptor text,
  art_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_cards_type_a_valid CHECK (type_a IN ('Lava','Fire','Whirlwind','Snow','Lightning','Sun','Lake','Ocean','Tree','Mountain','Soil','River','Sky')),
  CONSTRAINT game_cards_type_b_valid CHECK (type_b IN ('Lava','Fire','Whirlwind','Snow','Lightning','Sun','Lake','Ocean','Tree','Mountain','Soil','River','Sky'))
);

CREATE INDEX idx_game_cards_sort ON public.game_cards (sort_order);
CREATE INDEX idx_game_cards_types ON public.game_cards (type_a, type_b);

ALTER TABLE public.game_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cards readable by everyone"
  ON public.game_cards FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert cards"
  ON public.game_cards FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cards"
  ON public.game_cards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete cards"
  ON public.game_cards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER game_cards_updated_at
  BEFORE UPDATE ON public.game_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.game_cards (slug, name, type_a, type_b, mythical, art_path, sort_order) VALUES
('bear','Bear','Lava','Soil',false,'cards/animal-bear.png',1),
('bee','Bee','Lava','Snow',false,'cards/animal-bee.png',2),
('cassowary','Cassowary','Lava','Tree',false,'cards/animal-cassowary.png',3),
('echidna','Echidna','Lava','Lake',false,'cards/animal-echidna.png',4),
('eel','Eel','Lava','River',false,'cards/animal-eel.png',5),
('fox','Fox','Lava','Fire',false,'cards/animal-fox.png',6),
('griffin','Griffin','Lava','Sky',true,'cards/animal-griffin.png',7),
('iguana','Iguana','Lava','Sun',false,'cards/animal-iguana.png',8),
('octopus','Octopus','Lava','Ocean',false,'cards/animal-octopus.png',9),
('tiger','Tiger','Lava','Mountain',false,'cards/animal-tiger.png',10),
('wasp','Wasp','Lava','Lightning',false,'cards/animal-wasp.png',11),
('wolf','Wolf','Lava','Snow',false,'cards/animal-wolf.png',12),
('camel','Camel','Fire','Soil',false,'cards/animal-camel.png',13),
('cheetah','Cheetah','Fire','Lightning',false,'cards/animal-cheetah.png',14),
('dragon','Dragon','Fire','Sky',true,'cards/animal-dragon.png',15),
('gorilla','Gorilla','Fire','Mountain',false,'cards/animal-gorilla.png',16),
('lemur','Lemur','Fire','Tree',false,'cards/animal-lemur.png',17),
('mouse','Mouse','Fire','Snow',false,'cards/animal-mouse.png',18),
('otter','Otter','Fire','River',false,'cards/animal-otter.png',19),
('panda','Panda','Fire','Lake',false,'cards/animal-panda.png',20),
('seal','Seal','Fire','Ocean',false,'cards/animal-seal.png',21),
('squirrel','Squirrel','Fire','Whirlwind',false,'cards/animal-squirrel.png',22),
('zebra','Zebra','Fire','Sun',false,'cards/animal-zebra.png',23),
('arctic-hare','Arctic Hare','Whirlwind','Snow',false,'cards/animal-arctic-hare.png',24),
('dolphin','Dolphin','Whirlwind','Ocean',false,'cards/animal-dolphin.png',25),
('dragonfly','Dragonfly','Whirlwind','Lake',false,'cards/animal-dragonfly.png',26),
('fairy','Fairy','Whirlwind','Sky',true,'cards/animal-fairy.png',27),
('firefly','Firefly','Whirlwind','Lightning',false,'cards/animal-firefly.png',28),
('horse','Horse','Whirlwind','Mountain',false,'cards/animal-horse.png',29),
('kangaroo','Kangaroo','Whirlwind','Sun',false,'cards/animal-kangaroo.png',30),
('ostrich','Ostrich','Whirlwind','Soil',false,'cards/animal-ostrich.png',31),
('rabbit','Rabbit','Whirlwind','Snow',false,'cards/animal-rabbit.png',32),
('shark','Shark','Whirlwind','River',false,'cards/animal-shark.png',33),
('woodpecker','Woodpecker','Whirlwind','Tree',false,'cards/animal-woodpecker.png',34),
('alpaca','Alpaca','Snow','Soil',false,'cards/animal-alpaca.png',35),
('deer','Deer','Snow','Lightning',false,'cards/animal-deer.png',36),
('duck','Duck','Snow','River',false,'cards/animal-duck.png',37),
('leopard','Leopard','Snow','Mountain',false,'cards/animal-leopard.png',38),
('peacock','Peacock','Snow','Sun',false,'cards/animal-peacock.png',39),
('penguin','Penguin','Snow','Ocean',false,'cards/animal-penguin.png',40),
('snow-leopard','Snow Leopard','Snow','Mountain',false,'cards/animal-snow-leopard.png',41),
('spider','Spider','Snow','Tree',false,'cards/animal-spider.png',42),
('swan','Swan','Snow','Lake',false,'cards/animal-swan.png',43),
('unicorn','Unicorn','Snow','Sky',true,'cards/animal-unicorn.png',44),
('catfish','Catfish','Lightning','River',false,'cards/animal-catfish.png',45),
('crane','Crane','Lightning','Lake',false,'cards/animal-crane.png',46),
('falcon','Falcon','Lightning','Mountain',false,'cards/animal-falcon.png',47),
('flying-fox','Flying Fox','Lightning','Sun',false,'cards/animal-flying-fox.png',48),
('giraffe','Giraffe','Lightning','Tree',false,'cards/animal-giraffe.png',49),
('platypus','Platypus','Lightning','Soil',false,'cards/animal-platypus.png',50),
('swordfish','Swordfish','Lightning','Ocean',false,'cards/animal-swordfish.png',51),
('thunderbird','Thunderbird','Lightning','Sky',true,'cards/animal-thunderbird.png',52),
('elephant','Elephant','Sun','Soil',false,'cards/animal-elephant.png',53),
('kingfisher','Kingfisher','Sun','River',false,'cards/animal-kingfisher.png',54),
('koala','Koala','Sun','Tree',false,'cards/animal-koala.png',55),
('lion','Lion','Sun','Mountain',false,'cards/animal-lion.png',56),
('rainbow-serpent','Rainbow Serpent','Sun','Sky',true,'cards/animal-rainbow-serpent.png',57),
('starfish','Starfish','Sun','Ocean',false,'cards/animal-starfish.png',58),
('turtle','Turtle','Sun','Lake',false,'cards/animal-turtle.png',59),
('beaver','Beaver','Lake','River',false,'cards/animal-beaver.png',60),
('bunyip','Bunyip','Lake','Sky',true,'cards/animal-bunyip.png',61),
('crab','Crab','Lake','Mountain',false,'cards/animal-crab.png',62),
('frog','Frog','Lake','Tree',false,'cards/animal-frog.png',63),
('jellyfish','Jellyfish','Lake','Ocean',false,'cards/animal-jellyfish.png',64),
('wombat','Wombat','Lake','Soil',false,'cards/animal-wombat.png',65),
('crocodile','Crocodile','Ocean','Mountain',false,'cards/animal-crocodile.png',66),
('merper','Merper','Ocean','Sky',true,'cards/animal-merper.png',67),
('seahorse','Seahorse','Ocean','Tree',false,'cards/animal-seahorse.png',68),
('stingray','Stingray','Ocean','River',false,'cards/animal-stingray.png',69),
('whale','Whale','Ocean','Soil',false,'cards/animal-whale.png',70),
('goat','Goat','Tree','Mountain',false,'cards/animal-goat.png',71),
('knome','Knome','Tree','Sky',true,'cards/animal-knome.png',72),
('sloth','Sloth','Tree','Soil',false,'cards/animal-sloth.png',73),
('snake','Snake','Tree','River',false,'cards/animal-snake.png',74),
('bigfoot','Bigfoot','Mountain','Sky',true,'cards/animal-bigfoot.png',75),
('bison','Bison','Mountain','Soil',false,'cards/animal-bison.png',76),
('salamander','Salamander','Mountain','River',false,'cards/animal-salamander.png',77),
('anteater','Anteater','Soil','River',false,'cards/animal-anteater.png',78),
('hobbit','Hobbit','Soil','Sky',true,'cards/animal-hobbit.png',79),
('seamonster','Seamonster','River','Sky',true,'cards/animal-seamonster.png',80)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  type_a = EXCLUDED.type_a,
  type_b = EXCLUDED.type_b,
  mythical = EXCLUDED.mythical,
  art_path = EXCLUDED.art_path,
  sort_order = EXCLUDED.sort_order;

INSERT INTO storage.buckets (id, name, public)
VALUES ('game-card-art', 'game-card-art', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Game card art publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-card-art');

CREATE POLICY "Admins can upload game card art"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-card-art' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update game card art"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'game-card-art' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete game card art"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'game-card-art' AND public.has_role(auth.uid(), 'admin'));