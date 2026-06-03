CREATE OR REPLACE FUNCTION public.creator_type_code(_type text, _lower boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _type IS NULL OR length(_type) = 0 THEN NULL
    -- Always Title-case: first letter upper, last letter lower (both halves).
    -- _lower kept for API compatibility; ignored.
    ELSE upper(left(_type, 1)) || lower(right(_type, 1))
  END
$$;

UPDATE public.game_cards
SET code = public.creator_type_code(type_a, false) || public.creator_type_code(type_b, false)
WHERE type_a IS NOT NULL AND type_b IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_game_card_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := public.creator_type_code(NEW.type_a, false) || public.creator_type_code(NEW.type_b, false);
  RETURN NEW;
END;
$$;