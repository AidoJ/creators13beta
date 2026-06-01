UPDATE public.creator_types SET famous_person_photo_url = CASE lower(name)
  WHEN 'lava' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/lava.svg'
  WHEN 'fire' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/fire.svg'
  WHEN 'whirlwind' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/whirlwind.svg'
  WHEN 'snow' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/snow.svg'
  WHEN 'lightning' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/lightning.svg'
  WHEN 'sun' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/sun.svg'
  WHEN 'lake' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/lake.svg'
  WHEN 'ocean' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/ocean.svg'
  WHEN 'tree' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/tree.svg'
  WHEN 'mountain' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/mountain.svg'
  WHEN 'soil' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/soil.svg'
  WHEN 'river' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/river.svg'
  WHEN 'sky' THEN 'https://kbcxvycgwtoxqkbpcesi.supabase.co/storage/v1/object/public/game-card-art/silhouettes/sky.svg'
END
WHERE lower(name) IN ('lava','fire','whirlwind','snow','lightning','sun','lake','ocean','tree','mountain','soil','river','sky');