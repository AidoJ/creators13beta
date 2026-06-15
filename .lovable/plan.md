# Batch A.1 — N-Player Schema Foundations

**Goal:** Land the schema and persistence layer for N-player support (N ∈ {2,3,4}) without changing any gameplay behaviour. Existing 1v1 matches continue to work unchanged throughout. Engine generalisation is A.2; engine wire-up + ELO is A.3; presence/forfeit is A.4.

**Non-goals:** Engine changes. UI changes. Forfeit logic. Presence channel. ELO N-party adjustments. All deferred.

---

## A.4 design — two acknowledged limits (locked into the 1-pager)

Before A.1 ships, the A.4 design doc records these two limits so we don't rediscover them later:

1. **Grace-timer wobble.** Leave-reporting relies on still-connected peers. If every peer also blips during the 5s debounce, the leave goes un-stamped until someone reconnects — so the 5-minute clock starts from when reporting lands, not from actual disconnect. Acceptable at current scale.
2. **Simultaneous-disconnect hole.** If the last two connected peers drop within milliseconds of each other before either reports, neither row gets stamped. Match sits in limbo until any client reconnects and re-observes presence.

**Documented upgrade path (not built now):** client-side 15–30s heartbeat updating `last_seen_at`; cron sweep gains a stage 1 that stamps `disconnected_at` for stale `last_seen_at` before evaluating the 5-min forfeit window. Closes both holes. Defer until real disconnect data shows the wobble in practice.

---

## Schema changes (one migration)

### 1. New table: `public.game_match_players`

```text
match_id          uuid          (FK → game_matches.id, ON DELETE CASCADE)
user_id           uuid          (FK → auth.users.id)
slot              smallint      (0..3, turn order; UNIQUE per match)
display_name      text
joined_at         timestamptz   (default now())
-- A.4 columns reserved now, unused until A.4:
last_seen_at      timestamptz
disconnected_at   timestamptz   (NULL = connected)
disconnect_reason text          ('presence_leave' | 'timeout' | NULL)
status            text          ('active' | 'finalised' | 'forfeit' | 'conceded'; default 'active')
finalised_at      timestamptz
rank              smallint      CHECK (rank IS NULL OR rank BETWEEN 1 AND 4)
PRIMARY KEY (match_id, user_id)
UNIQUE (match_id, slot)
```

Partial index for the future cron sweep:
```text
CREATE INDEX … ON game_match_players (match_id, disconnected_at)
  WHERE disconnected_at IS NOT NULL;
```

### 2. New table: `public.game_match_player_states`

Replaces the single `game_matches.public_state` column. One row per (match, player) holding that player's redacted view.

```text
match_id     uuid          (FK → game_matches.id, ON DELETE CASCADE)
user_id      uuid          (FK → auth.users.id)
state        jsonb         (this player's redacted MatchState)
seq          bigint        (mirrors game_matches.seq at the moment of write)
updated_at   timestamptz   (default now())
PRIMARY KEY (match_id, user_id)
```

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.game_match_player_states;`. Each client subscribes with `filter: user_id=eq.<self>` — zero fan-out cost, zero client-side filtering.

### 3. `game_matches` — additive only

- **Keep** `host_user_id`, `guest_user_id`, `host_name`, `guest_name` for one release. Mark deprecated in a column comment. **Migration comment explicitly notes: scheduled for removal in A.3 or later.** No new code reads them.
- **Drop** `public_state` column in this same migration (now superseded by `game_match_player_states`).
- **Add** `player_count smallint NOT NULL DEFAULT 2 CHECK (player_count BETWEEN 2 AND 4)`.

### 4. `finalise_ranked_match` — reserved parameter

Recreate with new signature now to avoid a future signature change:
```text
finalise_ranked_match(_match_id uuid, _reason text DEFAULT 'normal')
```
Body unchanged in A.1; `_reason` is currently ignored. A.4 will pass `'opponent_forfeit'`.

### 5. Backfill (same migration, in a `DO` block)

For every existing `game_matches` row:
- Insert `game_match_players` row for `host_user_id` at slot 0.
- Insert row for `guest_user_id` at slot 1 if non-null.
- Set `player_count = 2`.
- Copy current `public_state` (if any) into one `game_match_player_states` row per existing player — same redacted payload both players already see today (the existing `get_match_state` RPC already returns the right shape per caller; A.1 calls it once per player during backfill).
- Set `seq` on the player-state rows to the current `game_matches.seq`.

After backfill, drop `public_state` column.

### 6. RLS + GRANTs

`game_match_players`:
```text
GRANT SELECT ON public.game_match_players TO authenticated;
GRANT ALL ON public.game_match_players TO service_role;
ENABLE ROW LEVEL SECURITY;
-- SELECT: a player can see all rows of a match they're in
CREATE POLICY "players see their match roster" ON game_match_players
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM game_match_players me
    WHERE me.match_id = game_match_players.match_id
      AND me.user_id = auth.uid()
  ));
-- No INSERT/UPDATE/DELETE for end users; all writes via SECURITY DEFINER RPC
-- (accept_game_invite, apply-move edge fn via service_role).
```

`game_match_player_states`:
```text
GRANT SELECT ON public.game_match_player_states TO authenticated;
GRANT ALL ON public.game_match_player_states TO service_role;
ENABLE ROW LEVEL SECURITY;
-- SELECT: only your own row
CREATE POLICY "see only my redacted state" ON game_match_player_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- All writes via service_role from apply-move (no end-user policy).
```

### 7. `get_match_state` RPC

Replace body: read from `game_match_player_states WHERE match_id=_ AND user_id=auth.uid()`, return `state`. Membership check via `game_match_players` (not the legacy host/guest columns). Solo-bot path unchanged (still trusts `game_matches.state` for `is_ranked = false`).

### 8. `accept_game_invite` RPC

After updating `game_matches` row, also insert the joining user into `game_match_players` (slot 1) and seed an initial `game_match_player_states` row mirroring whatever the host already has.

---

## Code changes (post-migration)

Implement only after the migration is approved and `types.ts` regenerates.

### `src/lib/game/persistence.ts`

- `GameMatchRow.public_state` field removed.
- `NON_STATE_COLS` rebuilt without `public_state`; adds `player_count`.
- `createMatchRow`: after inserting `game_matches`, also insert the host into `game_match_players` (slot 0).
- `listMyActiveMatches`: swap the `.or('host_user_id.eq…,guest_user_id.eq…')` filter for `.in('id', <subquery on game_match_players where user_id = me>)` — done as a single RPC `list_my_active_matches()` to avoid an N+1 round trip. **New RPC included in this migration.**
- `acceptInvite`: unchanged caller-side (RPC handles the new table writes).
- `loadMatch`: still calls `get_match_state` — no caller change, RPC body now reads the new table.

### `supabase/functions/apply-move/index.ts`

- Membership check: replace the `host_user_id = caller OR guest_user_id = caller` test with `EXISTS (SELECT 1 FROM game_match_players WHERE match_id = _ AND user_id = caller)`.
- `callerSlot` / `otherSlot` derived from `game_match_players.slot` instead of the binary host/guest distinction. Still hardcoded to two slots in A.1 — N-aware turn rotation lands in A.2.
- After computing the new state, instead of writing `public_state` to `game_matches`, perform an `UPSERT` per player into `game_match_player_states` with their redacted payload (in A.1 still just 2 rows; redaction logic unchanged from today). Same transaction as the `commit_move` RPC call.
- `commit_move` RPC signature change: drop `_public_state jsonb` parameter (no longer used). Recreate the function inside this migration.

### Realtime subscription (`src/hooks/useMatchRealtime.ts`)

Switch from subscribing to `game_matches` row changes for `public_state` to subscribing to `game_match_player_states` with `filter: 'user_id=eq.' + me`. The `game_matches` subscription stays for `seq`/`status`/`winner_user_id` changes. Two channels per match instead of one — acceptable for the cleaner separation.

### `src/lib/game/serialize.ts`

No changes in A.1. (A.2 will fix the "the other player" wording in `sanitiseLastEvent`.)

---

## Verification

Run all of these on a staging copy of prod data before merging:

1. **Existing 1v1 matches load and play.** Pick 3 in-progress matches; both players load them, take a turn each, see correct state. Realtime updates land.
2. **New match creation.** Host creates pvp match → `game_match_players` row exists for host; `game_matches.player_count = 2`; invite link resolves; guest accepts → second `game_match_players` row + both `game_match_player_states` rows seeded.
3. **Solo bot match.** Unchanged path (no `game_match_players` rows for bot side; `is_ranked = false`). Confirm it still saves/loads.
4. **RLS spot-checks.** As player A, `SELECT * FROM game_match_player_states WHERE match_id = <A's match>` returns exactly A's row. As an unrelated user, returns zero rows.
5. **Deprecated columns.** `SELECT host_user_id, guest_user_id FROM game_matches` still works (readable). Grep confirms no new code reads them. Migration comment present.
6. **Realtime fan-out.** Player A places a card; player B's `game_match_player_states` row updates within <1s; B's UI re-renders.
7. **`get_match_state` redaction.** Player A's row contains B's hand as empty array + `handCount`; vice versa.
8. **Linter.** `supabase--linter` clean for the new tables (RLS enabled, policies present, grants present).

---

## Out of scope (explicit, to prevent scope creep)

- N-player turn rotation, deck scaling, `victimIds[]`, `placements[]`, ranked `finalise()` — all A.2.
- N-party ELO in `finalise_ranked_match` body — A.3.
- Presence channel, `report-presence` edge fn, cron sweeper, forfeit logic — A.4.
- UI showing multiple opponents — separate batch after A.3.
- Dropping `host_user_id` / `guest_user_id` columns — A.3 or later, comment in migration.

---

## Sequencing

1. Draft & approve the migration (single file: tables + grants + RLS + backfill + RPC rewrites + `commit_move` resignature + `finalise_ranked_match` resignature + `list_my_active_matches` RPC).
2. After regeneration of `types.ts`: rewrite `persistence.ts`, `apply-move/index.ts`, `useMatchRealtime.ts`.
3. Run verification list against staging.
4. Ship. Move to A.2.

On approval, I'll start with the migration.
