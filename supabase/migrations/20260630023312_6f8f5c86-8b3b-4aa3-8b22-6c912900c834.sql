-- Tier 3 #10 — public buckets (email-assets, game-card-art) had broad SELECT
-- on storage.objects, which lets a client list every file in the bucket.
-- Because the buckets themselves are public, files remain reachable via their
-- direct CDN URL even with no SELECT policy.
DROP POLICY IF EXISTS "Email assets publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Game card art publicly readable" ON storage.objects;
