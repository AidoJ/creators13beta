-- Short human-readable code for cards (first+last letter of each Creator Type)
-- type_a contributes Capitalised first+last (e.g. Snow -> "Sw")
-- type_b contributes lowercase first+last (e.g. Soil -> "sl")
-- Example: Alpaca (Snow, Soil) -> "SwSl"; Lava+Lake -> "LaLe"

ALTER TABLE public.game_cards ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.special_cards ADD COLUMN IF NOT EXISTS code text;

CREATE OR REPLACE FUNCTION public.creator_type_code(_type text, _lower boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _type IS NULL OR length(_type) = 0 THEN NULL
    WHEN _lower THEN lower(left(_type, 1)) || lower(right(_type, 1))
    ELSE upper(left(_type, 1)) || lower(right(_type, 1))
  END
$$;

-- Backfill animal cards
UPDATE public.game_cards
SET code = public.creator_type_code(type_a, false) || public.creator_type_code(type_b, true)
WHERE type_a IS NOT NULL AND type_b IS NOT NULL;

-- Trigger to keep code in sync on insert/update
CREATE OR REPLACE FUNCTION public.set_game_card_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := public.creator_type_code(NEW.type_a, false) || public.creator_type_code(NEW.type_b, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_cards_set_code ON public.game_cards;
CREATE TRIGGER trg_game_cards_set_code
BEFORE INSERT OR UPDATE OF type_a, type_b ON public.game_cards
FOR EACH ROW
EXECUTE FUNCTION public.set_game_card_code();