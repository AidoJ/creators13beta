/**
 * Seed 12 community-visible test profiles so the Community Dashboard has
 * enough data density to evaluate the lotus layout.
 *
 * Usage (from project root):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     bun run scripts/seed-community-test-profiles.ts
 *
 * Re-running is safe — users are upserted by email (seed-*@creators13.test).
 * To remove: delete those auth users from the dashboard; profiles/CT rows
 * cascade.
 *
 * The match scores you'll see on /community/dashboard are computed
 * automatically by the recompute trigger when creator_type_profiles rows
 * are inserted, so no extra step is required.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const TYPES = [
  "lava", "fire", "whirlwind", "snow", "lightning", "sun", "lake",
  "ocean", "tree", "mountain", "soil", "river", "sky",
];
const LOCATIONS = [
  "Byron Bay, AU", "Melbourne, AU", "Auckland, NZ", "London, UK",
  "Berlin, DE", "Lisbon, PT", "Brooklyn, US", "Austin, US",
  "Bali, ID", "Tokyo, JP", "Cape Town, ZA", "Vancouver, CA",
];

type Seed = {
  email: string;
  display: string;
  loc: string;
  types: string[]; // 1–4 lowercased
};

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

const SEEDS: Seed[] = Array.from({ length: 12 }, (_, i) => ({
  email: `seed-${i + 1}@creators13.test`,
  display: `Seed Creator ${i + 1}`,
  loc: LOCATIONS[i % LOCATIONS.length],
  // Mix of 2/3/4-type profiles to vary the match scores.
  types: pick(TYPES, 2 + (i % 3)),
}));

async function upsertUser(s: Seed): Promise<string> {
  // Try to find by email first (admin listUsers paginates; cheap enough for seed).
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((u) => u.email === s.email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: s.email,
    password: "SeedPass!" + Math.random().toString(36).slice(2, 10),
    email_confirm: true,
    user_metadata: { first_name: s.display.split(" ")[0], last_name: s.display.split(" ").slice(1).join(" ") },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function seedOne(s: Seed) {
  const uid = await upsertUser(s);
  await admin.from("profiles").update({
    display_name: s.display,
    location_label: s.loc,
    bio_superpower: "Seeded test profile — superpower placeholder.",
    bio_where_i_live: `I love that ${s.loc} has the perfect light at sunset.`,
    bio_intriguing: "I'm a seeded test profile — feel free to ignore me.",
    community_visible: true,
    community_joined_at: new Date().toISOString(),
    profile_completed_at: new Date().toISOString(),
  }).eq("user_id", uid);

  // Upsert creator_type_profiles (one row per user).
  await admin.from("creator_type_profiles").upsert({
    user_id: uid,
    source: "practitioner",
    primary_type: s.types[0],
    secondary_type: s.types[1] ?? null,
    type_3: s.types[2] ?? null,
    type_4: s.types[3] ?? null,
  }, { onConflict: "user_id" });

  console.log(`✓ ${s.display.padEnd(20)} [${s.types.join(", ")}]`);
}

(async () => {
  for (const s of SEEDS) {
    try { await seedOne(s); } catch (e) { console.error(`✗ ${s.email}`, e); }
  }
  console.log(`\nDone. Visit /community/dashboard while signed in to see them.`);
})();
