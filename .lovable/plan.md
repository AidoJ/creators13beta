
# 13 Creators — Honeycomb Card Game: Summary + Phased Build Plan

## Part 1 — High-level summary of the game

**Premise.** Each player builds an **ecosystem** on a honeycomb of hex cards. The first player to surround **4 Creators** (one per element — Fire / Air / Water / Earth, or a Sky substitute) with **3 matching Animals each** (12 animals total → 16 cards in a complete ecosystem) wins.

**The 13 Creator Types** (canonical palette, equal forces):
Lava, Fire, Sun (Fire) · Whirlwind, Lightning, Sky (Air) · Snow, Lake, Ocean, River (Water) · Tree, Mountain, Soil (Earth). Sky is the universal substitute.

**Cards (≈90 total, exact count TBD from A'Hara's spreadsheet).**
- **Creators** (13) — placed in the centre of your hive; cannot be picked up once played.
- **Animals** (39 = 3 per type) — match a single Creator type.
- **Golden Body** — wild animal, substitutes for any animal.
- **Golden Hive** — defence; blocks the next Disaster played against you.
- **Sky Creature** — steal one animal from another player's board.
- **Disaster trigger** — any Creator card played to the **Used pile** wipes every matching animal off every opponent's board.

**Turn sequence (3 phases).**
1. **Draw 2** — from the New Pile or the top of the Used Pile.
2. **Rearrange (optional)** — move cards already in your ecosystem; never remove placed cards.
3. **Play 2** — onto the board (adjacent to an existing cell) or into the Used Pile (where Creator cards become Disasters).

**Key clarifications from the audio review.**
- Creators are **never picked back up** once placed; you can place *additional* Creators of the same element to open more animal slots.
- Animal cards can only leave the board via **Disaster** or **Sky Creature steal**.
- A Creator card in your hand can be sacrificed to the Used Pile as a **Disaster** — wipes every matching animal across all opponents, but the next player may pick it up.
- On placement, the card **flips/zooms** to reveal the animal art + fun fact for that Creator Type (subliminal learning — drives the "X of 13 seen" tracker).
- Modes: **Bot tutorial, 1v1, 2p, 3p, 4p** — realtime, both players present, with presence channel + server-authoritative turn lock.
- **Free Wren tier** can play the full game; Robin+ unlocks 2–4p, DMs, tournaments.

**Visual direction (locked by the mockup):**
Paper / parchment dual theme · Instrument Serif display + Geist UI · pointy-top axial hex grid (HEX_SIZE 50) · 13 canonical palette colours · striped placeholder art until A'Hara's deck arrives.

---

## Part 2 — Phased build plan

### Phase 1 — Data foundation & card catalogue *(3 days)*
**Goal:** every card the game needs lives in the database, sourced from A'Hara's incoming spreadsheet.

- New table **`game_cards`** — `id, kind (creator|animal|golden_body|golden_hive|sky_creature), type, element, name, art_url, fun_fact, rarity, copies_in_deck`.
- Storage bucket `game-card-art` (public read, admin-write).
- Seed migration: 13 Creators + 39 Animals + Golden Body + Golden Hive + Sky Creature, copy counts per the PDF rules.
- `src/lib/gameCards.ts` — strongly-typed loader mirroring `creatorTypes.ts`.
- Admin import edge function `admin-import-cards` for the CSV A'Hara is preparing.
- Port the uploaded `data.jsx` content (TYPES, ANIMALS, fun-fact placeholders) into the seed as the day-one fallback.

**Exit criteria:** `select count(*) from game_cards` matches the printed deck; art renders as striped placeholders.

---

### Phase 2 — Match engine & state model *(1 week)*
**Goal:** server-authoritative game logic, no UI yet.

- Tables: **`game_matches`**, **`game_match_players`** (board jsonb of `{card_id,q,r}`, hand jsonb), **`game_actions`** (append-only turn log), **`game_invitations`**.
- Edge functions:
  - `game-create-match` — validates tier, deals 5-card opening hand, picks dealer.
  - `game-play-turn` — validates the action against current phase (draw/rearrange/place), enforces adjacency, applies Disaster/Hive/Steal/Golden Body, advances phase + turn, checks win condition (4 creators × 3 matching animals, all 4 elements covered).
  - `game-bot-turn` — simple AI for tutorial + solo.
- Pure-function rules core `supabase/functions/_shared/gameRules.ts` so the same code runs on server and (read-only) on client for previews.
- Unit tests for: adjacency, disaster wipe, hive cancel, sky steal, win detection, illegal-move rejection.

**Exit criteria:** scripted match (bot vs bot) completes end-to-end with valid action log; illegal moves rejected.

---

### Phase 3 — Honeycomb UI (single player vs bot) *(1 week)*
**Goal:** port the uploaded mockup (`game.jsx` + `index.html`) into the React app, wired to Phase 2 backend, vs bot only.

- Route `/game` (lazy-loaded), with sub-routes `/game/lobby`, `/game/match/:id`, `/game/tutorial`.
- Components (1:1 from mockup, refactored to TSX + design tokens):
  - `HoneycombBoard` (SVG, axial coords, auto-fit viewBox).
  - `HexCell`, `DropTarget`, `HandCard`, `Piles`, `PhaseTracker`, `OpponentMini`, `ActionLog`, `FunFactOverlay`.
- Wire palette to existing `src/lib/creatorTypes.ts` (no duplicated colours).
- Card-flip / zoom animation on placement (Motion).
- "X of 13 discovered" tracker stored on `profiles.types_seen` (text[]).
- Tutorial mode = scripted bot match with coach-marks.

**Exit criteria:** a Wren-tier user can finish a full bot match on mobile + desktop; fun-fact overlay fires on first-sight of each type.

---

### Phase 4 — Realtime multiplayer & lobby *(1 week)*
**Goal:** two humans on one board, live.

- Enable `supabase_realtime` on `game_matches` + `game_actions`.
- Presence channel per match (`thinking…`, online dot, disconnect grace 60s → forfeit).
- Server-authoritative turn lock (row-level `current_turn_player_id` guard).
- Lobby UI: quick match, browse players by Creator Type, send/accept invite, "Posted to #card-game-lobby ✓" indicator (Discord bot in Phase 6).
- Mode toggles: 1v1 (free), 2p/3p/4p (Robin+ gated by `unlocked_features`).

**Exit criteria:** two browsers in different sessions play a full 1v1; reconnect after 30s drop works.

---

### Phase 5 — Points economy & subliminal learning *(4 days, parallel to Phase 4)*
- Tables: `point_transactions`, `unlocked_features`, `profiles.points_balance`.
- Earn rules from A'Hara's doc (5/10/15/30 + bonuses for new-type discovery, perfect ecosystem, comeback win).
- `award-points` edge function as single source of truth.
- Spend: discount codes on Stripe checkout (extends existing `create-checkout`); trial unlocks (DM channel, 2v2 mode).
- Dashboard widget: balance, unlock progress bars (25/50/100/250/500), types-discovered ring.

**Exit criteria:** finishing a match credits the correct points; discount code is honoured at checkout.

---

### Phase 6 — Discord bridges *(3 days)*
- Extend existing `sync-discord-role` flow: bot posts new lobby invites → `#card-game-lobby`, daily forecasts → `#daily-forecasts` (Robin+).
- Slash commands: `/whoami`, `/profile @user`, `/challenge @user`.
- "Message on Discord" deep-link button on member profiles (Wren+).
- Owl-only private `#owl-supervision` channel role-gated via existing tier role IDs.

**Exit criteria:** challenging a Discord user via slash command produces a working invite in the web app lobby.

---

### Phase 7 — Polish, balance, launch prep *(1 week)*
- 5-minute interactive tutorial with first-game reward.
- PWA push notifications for "your turn" + "invite received".
- Sound design (place / draw / disaster / win cues — toggleable).
- Accessibility pass: keyboard play, screen-reader announcements for action log, prefers-reduced-motion.
- Performance: lazy-load `/game` route; SVG hex cap ~64 cells/board.
- Beta cohort (50 users — practitioners + early Wrens), bug bash, balance pass on Disaster frequency.
- Replace striped placeholder art with A'Hara's final deck the moment it lands.

**Exit criteria:** 50-player beta runs a week with no P0 bugs; final art swapped in.

---

## Open items needing A'Hara
1. **Card spreadsheet** — name, kind, two associated Creator Types, art reference, fun fact body (per audio, ~90 cards).
2. **Final deck art** (replaces striped placeholders).
3. **Exact points-economy numbers** if any differ from the existing build-plan doc.
4. **Tournament / season mechanic** — decide before Phase 7 if it ships at launch or post-launch.

---

## Deliverable on approval
On approval I'll also write a standalone Markdown summary doc to `/mnt/documents/13creators_game_overview.md` covering Part 1 above, suitable to share with A'Hara, beta testers, and the practitioner cohort.
