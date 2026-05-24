
# 13 Creators — Revised Build Plan (post A'Hara update)

## What changed since the last plan

1. **Falcon → Cockatoo.** Tier renamed across UI, DB enum, Stripe metadata, Discord roles, emails. New cockatoo watercolour replaces the falcon hero art. Falcon now exists *only* as an in-deck animal card (Lightning/Mountain fusion).
2. **Pricing is fully unbundled.** Subscriptions buy *access tiers only*. Profiling (Face $100 / Body $200), Online Courses (from $100), and Practitioner Training L1/L2/L3 ($300/mo × 13 months) are **separate purchases**, with a 25% gaming-points discount on Face + Body profiling.
3. **No "practitioner-in-training" tier.** Only **certified** practitioners hold a tier (Cockatoo = L1 certified, Owl = L2 certified). Trainees pay the training fee on top of their normal Wren/Robin subscription. Drop the trainee path from tier logic; keep `trainee` only as an LMS role.
4. **The deck is bigger — and animals have TWO types.** Spreadsheet has **144 animal entries** = every ordered pair of the 13 Creator Types. Deduplicated = **72 unique fusion animals + 12 mythical Sky fusions** (Griffin, Dragon, Fairy, Unicorn, Thunderbird, Rainbow Serpent, Bunyip, Merper, Knome, Bigfoot, Hobbit, Seamonster). Each animal matches **either** of its two Creator Types — this rewrites the match-engine.
5. **Free Wren explicitly includes the card game** (1v1, 2–4p, vs bot) + Discord + member directory. Card game is no longer Robin-gated.
6. **Canonical colour palette** now locked: 13 specific hex values + Gold #edd58a, Linen #f2e8de, Cafe Noir #3a2615, Charcoal #505050. Replace any approximated values in `creatorTypes.ts` / `index.css`.

---

## Revised tier model

| Tier | $/mo | Who | Card game | Profiling / Courses / Training |
|---|---|---|---|---|
| **Wren** | Free | Curious testers + players | Full game | Pay per service |
| **Robin** | $28 | Self-discovery + community | + chat groups, matching, live teachings | Pay per service |
| **Cockatoo** | $88 | Certified L1 practitioners + biz owners | + showcase, project creation | L2 + Team unlocked |
| **Owl** | $44 | Certified L2 practitioners | + event creation, client tools | L3 unlocked |

Owl < Cockatoo intentionally — Cockatoo is the business/team tier; Owl is mentor-grade with smaller surface.

---

## Phase 0 — Rename + rebrand sweep *(½ day, do first)*

- DB migration: rename enum `subscription_tier` value `falcon` → `cockatoo`; update existing rows in `subscriptions` and anywhere else stored.
- `src/lib/tiers.ts`: rename `falcon` key → `cockatoo`, update prices (Cockatoo $88/$880, Owl $44/$440), swap copy from the new screenshot.
- Replace falcon imagery with the new cockatoo PNG (`src/assets/tier-cockatoo.png`).
- Sweep strings across `TiersSection`, `PlanSelection`, `SubscriptionCard`, `UpsellBanner`, Discord role map in `sync-discord-role` + `discord-oauth-callback`, email templates.
- New Cockatoo Discord role ID from A'Hara needed.
- Update canonical palette in `creatorTypes.ts` + HSL tokens in `index.css` to the 13 hex values.
- Update memory: tier list, Falcon→Cockatoo constraint, canonical hex palette.

**Exit:** no string `Falcon` remains except inside game-deck data; `select * from subscriptions where tier='falcon'` returns 0.

---

## Phase 1 — Card catalogue (revised) *(3 days)*

- Table `game_cards`: `id, kind, name, type_a, type_b (nullable for creators/specials), art_url, fun_fact, rarity, copies_in_deck`.
- Seed migration ingests A'Hara's spreadsheet:
  - 13 Creator cards.
  - 72 unique fusion animals + 12 Sky-mythical animals = **84 animal cards**, each tagged with two Creator Types.
  - Specials: Golden Body, Golden Hive, Sky Creature (Disaster is a mechanism, not a card kind).
- Storage bucket `game-card-art` (public read, admin write); striped placeholders per type-pair until art lands.
- `src/lib/gameCards.ts` typed loader; `admin-import-cards` edge function for CSV reimport.

**Exit:** `count(*) where kind='animal'` = 84; every animal has two valid type tags.

---

## Phase 2 — Match engine (rules rewrite) *(1 week)*

Big rule change: an animal matches a Creator slot if `creator.type ∈ {animal.type_a, animal.type_b}`. Affects:

- **Adjacency check** — animal may sit adjacent to either-type creator.
- **Disaster wipe** — Creator → Used Pile wipes every opponent animal where that creator's type matches *either side* of the animal.
- **Win check** — 4 creators (one per element band Fire/Air/Water/Earth) each with 3 adjacent matching animals.
- **Sky mythicals** — confirm with A'Hara whether they're true wildcards or only count on the Sky side.

Tables: `game_matches`, `game_match_players` (board + hand jsonb), `game_actions` (append-only), `game_invitations`. Edge fns: `game-create-match`, `game-play-turn`, `game-bot-turn`. Pure rules core in `_shared/gameRules.ts` with unit tests for dual-type matching, disaster wipe across both sides, hive cancel, sky steal, win detection.

**Exit:** scripted bot-vs-bot match green; dual-type matching covered by tests.

---

## Phase 3 — Honeycomb UI vs bot *(1 week)*

Port `game.jsx` mockup → TSX. Axial hex grid (HEX_SIZE 50). Card-flip animation on placement. "X of 13 discovered" tracker on `profiles.types_seen`. Tutorial mode with coach-marks. Route `/game` lazy-loaded. **Mobile-first** since Wren is the entry point.

---

## Phase 4 — Realtime + lobby *(1 week)*

`supabase_realtime` on matches + actions. Presence channel per match (60s disconnect grace → forfeit). Server-authoritative turn lock. Lobby with quick-match, browse-by-type, invite flow. Per A'Hara's update, **all card-game modes (1v1 + 2–4p + bot) are free Wren**. Only DMs and tournaments are Robin+.

---

## Phase 5 — Points economy + unbundled checkout *(5 days)*

- `point_transactions`, `unlocked_features`, `profiles.points_balance`, `award-points` edge fn.
- **New `services` catalogue table** (Face Profile, Body Profile, Online Course slots, Practitioner Training L1/L2/L3) — these become Stripe products *separate* from subscriptions.
- Extend `create-checkout` to accept `{ service_id, points_to_apply }`, compute 25%-off where applicable, and create the right Stripe session (one-off for profiling, subscription for training payment plan).
- Practitioner Training displayed as a 13-month plan ($300/mo) — built as a Stripe subscription that auto-cancels after 13 cycles.
- Dashboard: points balance, types-discovered ring, "Available services" cards with list price + your-discount price.

**Exit:** Wren user finishes a match, points credit, hits Face Profile checkout, discount honoured by Stripe.

---

## Phase 6 — Discord bridges *(3 days)*

Per-tier role IDs updated for Cockatoo. Cockatoo-only chat + Owl-only `#owl-supervision`. Slash cmds `/whoami`, `/profile`, `/challenge`. Card-game lobby bot posts to `#card-game-lobby` (open to all Wren+).

---

## Phase 7 — Polish & launch *(1 week)*

Tutorial, PWA push, sound, a11y pass, perf (lazy `/game`, SVG cap ~64 cells), 50-user beta, final art swap.

---

## Open items still needing A'Hara

1. **New Stripe product/price IDs** for Cockatoo $88/$880 + Owl $44/$440 + each unbundled service (Face $100, Body $200, Course base $100, Training $300×13).
2. **New Cockatoo Discord role ID** (to replace `1506466059795042374` in `sync-discord-role` + `discord-oauth-callback`).
3. **Final card art** for 84 animals + 13 creators + 3 specials.
4. **Fun-fact body text** per Creator Type for the subliminal-learning overlay.
5. **Rules clarification:** does a Sky mythical (e.g. Griffin = Lava+Sky) act as a wildcard animal, or only matches Lava + literal Sky creators? Spreadsheet implies the latter — please confirm before Phase 2 tests.
6. **Trainee certification flow:** once someone completes L1 training, what auto-promotes them from Robin → Cockatoo? Manual trainer flip, or webhook from the LMS completion?

---

## Suggested kickoff sequence on approval

- **Phase 0 first** (rename + palette + cockatoo image) — pure refactor, unblocks marketing + Discord today.
- **Phase 1** as soon as items 5 and (ideally) 3 land.
- Phases 2–4 are the longest; can begin once the catalogue is seeded with placeholder art.

Reply *go phase 0* to run the rename sweep, or *go 0+1* to also seed the new deck with striped placeholders.
