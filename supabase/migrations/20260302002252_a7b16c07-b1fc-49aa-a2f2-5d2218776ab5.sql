
-- Update generate_practitioner_code to use first-name-based format: XX001
CREATE OR REPLACE FUNCTION public.generate_practitioner_code(_first_name text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix text;
  max_seq int;
  new_code text;
BEGIN
  -- Build 2-letter uppercase prefix from first name, stripping non-alpha chars
  prefix := upper(left(regexp_replace(coalesce(_first_name, 'XX'), '[^a-zA-Z]', '', 'g'), 2));
  IF length(prefix) < 2 THEN
    prefix := rpad(prefix, 2, 'X');
  END IF;

  -- Find the highest existing sequence for this prefix
  SELECT coalesce(max(substring(practitioner_code from 3)::int), 0)
  INTO max_seq
  FROM profiles
  WHERE practitioner_code ~ ('^' || prefix || '[0-9]{3}$');

  new_code := prefix || lpad((max_seq + 1)::text, 3, '0');
  RETURN new_code;
END;
$function$;

-- Update the trigger to pass first_name
CREATE OR REPLACE FUNCTION public.assign_practitioner_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first_name text;
BEGIN
  IF NEW.role IN ('practitioner', 'trainee') THEN
    SELECT first_name INTO _first_name FROM profiles WHERE user_id = NEW.user_id;
    UPDATE profiles
    SET practitioner_code = generate_practitioner_code(_first_name)
    WHERE user_id = NEW.user_id
      AND practitioner_code IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
