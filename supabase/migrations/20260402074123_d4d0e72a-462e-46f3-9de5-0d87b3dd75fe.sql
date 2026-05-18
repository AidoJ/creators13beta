UPDATE creator_types
SET profile_content = jsonb_set(
  profile_content::jsonb,
  '{challenges}',
  '["Superficial", "Passive", "Cold"]'::jsonb
)
WHERE lower(name) = 'snow';