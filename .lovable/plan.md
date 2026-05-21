
# 13 Creators — Consolidated Build Plan + Honeycomb Mockup

This plan merges three inputs into one roadmap: (1) the existing Discord integration we just shipped, (2) the B Creators card game rules PDF, and (3) A'Hara's revised build plan doc (free-tier gateway, points economy, async multiplayer, projects). It also defines the revised HTML mockup with a **true honeycomb game board** to replace the placeholder grid.

---

## PART A — Completed Build Plan

### Stage 0 — Discord Foundation ✅ (done)
- `discord_links` table + RLS
- OAuth callback edge function (auto-join guild + assign tier role)
- `DiscordLinkCard` on dashboard
- Tier role IDs wired (Wren / Robin / Falcon / Owl)

### Stage 0.5 — Finish Discord properly (1 day)
- **Stripe webhook → role-sync**: extend `stripe-webhook` to call a new `sync-discord-role` helper on `customer.subscription.{created,updated,deleted}`. Adds/removes the correct tier role, with the previous tier role removed first.
- **Nightly safety-net cron** (`pg_cron` → `sync-discord-role` for all linked users) to repair drift.
- **Discord link is OPTIONAL for free Wren** (confirmed). Wren is the free entry tier — no payment needed to play. Robin+ gets a soft nudge.
- **Owl client-supervision in Discord** (confirmed) — private `#owl-supervision` channel, role-gated.

### Stage 1 — REMOVED
No Free tier. Wren ($27/mo) remains the entry tier. Tier ladder in `tiers.ts` is unchanged.

### Stage 2 — Card Game Core (3 weeks, the moat)
**Database (new tables):**
- `game_cards` — static deck definition (creator/animal/sky-creator/sky-creator-card/golden-body/golden-hive/disaster), element, matching-creator id, art url, fun-fact text.
- `game_matches` — `id, mode ('1v1'|'2p'|'3p'|'4p'|'bot'), status, started_at, ended_at, winner_id, current_turn_player_id, turn_number, game_state jsonb`.
- `game_match_players` — `match_id, user_id, player_number, ecosystem jsonb (array of {card_id, q, r}), hand jsonb, eliminated bool`.
- `game_actions` — append-only turn log for replay/audit.
- `game_invitations` — pending invites between users.
- `player_stats` — wins/losses/streak/elo/perfect-ecosystems.
- `point_transactions` + `profiles.points_balance`.
- `unlocked_features` — per-user trial unlocks (DMs, 2v2, etc.).

**Edge functions:**
- `game-create-match` (validates tier: 1v1 free, 2–4p Wren+)
- `game-play-turn` (server-authoritative: validates legal move, applies disaster/steal/hive, checks win, advances turn, awards points)
- `game-bot-turn` (simple AI for Free tutorial + solo play)
- `award-points` (single source of truth for point ledger)

**Frontend (`/game` route, lazy-loaded):**
- `HoneycombBoard` — axial-coord hex grid, free-form growth (cards added adjacent to any existing card).
- `HexagonCard` — clip-path hex, drag source/target, flip animation reveals fun fact.
- `PlayerHand`, `DrawPile`, `UsedPile`, `TurnControls`.
- `MatchLobby` (find player / quick match / invite) + `BotMatch` for tutorial.
- **Realtime, both players present** (confirmed): Supabase Realtime `postgres_changes` on `game_matches` + `game_actions`, plus a **presence channel** per match (online/typing/thinking indicators). Server-authoritative turn lock prevents double-plays. Disconnect → 60s grace → forfeit. No async/push-notification turns.
- **Card art**: emoji + coloured hexes as placeholders for now; swap in A'Hara's assets when delivered (loaded from `game_cards.art_url`, Supabase storage bucket `game-card-art`).

**Game rules implemented exactly per PDF:**
- Win = 4 Creators (1 of each Earth/Air/Fire/Water OR Sky substitute) surrounded by 12 matching Animals.
- Turn = draw 2 → optional rearrange → play 2.
- Disaster (creator card played to used pile wipes matching animals from opponents).
- Golden Hive blocks one disaster.
- Sky Creature steals one animal.
- Golden Body substitutes for any animal.

### Stage 3 — Points + Subliminal Learning (1 week, parallel to Stage 2)
- Earn rules per doc (5/10/15/30 + bonuses).
- Spend: discount codes on Stripe checkout, trial feature unlocks.
- Card-flip fun-fact UI uses existing `creatorTypeProfilingData` (single source of truth — no new content).
- "You've seen X/13 types" tracker on dashboard.

### Stage 4 — Discord Bridges (3 days, after game ships)
- Bot posts new game-lobby invites → `#card-game-lobby`.
- Bot posts daily forecasts → `#daily-forecasts` (Robin+).
- Slash commands: `/whoami`, `/profile @user`, `/challenge @user`.
- Profile deep-links: "Message on Discord" button on member profiles (Wren+).

### Stage 5 — Community / Projects (2 weeks)
- `projects` table, project pages, teaser-view for Free, full participation Robin+.
- Member directory by Creator Type (already partially modeled).
- Achievements + leaderboard.

### Stage 6 — Polish + Launch Prep (1 week)
- Tutorial (5-min interactive) + first bot game.
- Push notifications via PWA.
- Beta cohort (50 users), bug bash, performance tune.

---

## PART B — Revised Mockup (Honeycomb Board)

I'll generate a new self-contained HTML file at **`/mnt/documents/13creators_mockup_v2.html`** replacing the placeholder 4×3 grid with a real hex tessellation. Key changes vs the v1 mockup you uploaded:

### Visual / Structural
- **True honeycomb board**: SVG-based hex grid using axial coords `(q, r)`, pointy-top hexes, ~80px radius. Cards tessellate edge-to-edge with no gaps. Ecosystem grows organically (any shape, per PDF rules).
- **Free-form growth zone**: empty hexes shown as faint dashed outlines only on positions adjacent to existing cards (legal drop targets), glow on drag-hover.
- **Center 4 Creator slots highlighted** in a 2×2 inner cluster as the conceptual "core", surrounded by 12 animal hex rings — matches the PDF's "Sample Complete Ecosystem".
- Uses the **canonical 13 Creator Type palette** from `src/lib/creatorTypes.ts` (Lava #E85500, Fire #F07000, … Sky #5BB8D4) — no more generic purple gradient cards.
- Type names rendered Title Case ("Lava", "Whirlwind"), display font Lilita One, body Questrial — matches project memory.

### Views in the mockup (4 tabs)
1. **Landing** — "Play Free" primary CTA, tier ladder (Free → Wren → Robin → Falcon → Owl) with points-discount callouts.
2. **Game Board (Honeycomb)** — opponent's board (read-only, smaller) on left, your honeycomb center, hand + draw/used piles right, turn controls bottom. Card-flip animation showing fun fact on hover.
3. **Lobby / Matchmaking** — quick match, browse players (avatar + bio + types), pending invites, "Posted to #card-game-lobby ✓" Discord indicator.
4. **Dashboard** — points balance, unlock progress bars (25/50/100/250/500), achievements, Discord-link status, ecosystem-stats.

### Interactions shown (CSS/JS only — no backend)
- Hover hex → lift + glow in type colour.
- Click empty adjacent hex → places top hand card (mock).
- Disaster card play → opponent's matching animals briefly shake + fade.
- Sky Creature steal → arrow animation from opponent hex to your hand.

### What I will NOT change in the mockup
- Won't invent any Creator Type content beyond what's in `creatorTypeProfilingData.ts`.
- Won't introduce new tier names or new "primary/secondary" hierarchy (per memory: equal forces).

---

## Confirmed answers (locked)

1. **No Free tier** — Wren stays the entry tier at $27.
2. **Pricing unchanged** — matches `tiers.ts` today.
3. **Card art** — A'Hara to supply; placeholders (emoji + coloured hexes) until then.
4. **Realtime, not async** — both players present on the board with a presence channel.

---

## What happens next

1. **Stage 0.5 starts now** — Stripe webhook → `sync-discord-role` on subscription changes + nightly `pg_cron` safety-net.
2. Then Stage 2 (game core, realtime architecture) → Stage 3 (points) → Stage 4 (Discord bridges) → Stage 5 (community) → Stage 6 (polish).
3. Mockup v2 (`13creators_mockup_v2.html`) remains the visual reference for the honeycomb board.
