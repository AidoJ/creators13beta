# A.4 — Presence & Disconnect Handling

## 1. Config (migration)

Add tunables to `game_settings` so the debounce/grace can be adjusted from evidence without redeploy:

- `presence_debounce_seconds` int, default `15`
- `disconnect_grace_seconds` int, default `300`
- `disconnect_sweep_interval_seconds` int, default `30` (informational; cron schedule is fixed at 30s, value documents intent)

Schedule `pg_cron` job `forfeit_stale_disconnects` every 30s that POSTs to the sweep edge function (uses the same `net.http_post` pattern as existing scheduled functions).

## 2. New edge functions

### `supabase/functions/report-presence/index.ts`
Called by clients on presence `join` / `leave` events for `match:{match_id}`.

- `join` → clear `disconnected_at`, `disconnect_reason`; update `last_seen_at`.
- `leave` → **server-side debounce**: set `last_seen_at = now()`, do NOT stamp `disconnected_at` immediately. Instead enqueue a deferred check by writing `last_seen_at` and letting the sweep stamp `disconnected_at` only if `now() - last_seen_at > presence_debounce_seconds` AND no fresh presence has arrived.
  - This collapses "debounce" into the sweep: a single source of truth, no in-memory timers in the edge runtime (which won't survive between invocations anyway).
- Authenticates via JWT; verifies caller is a participant of the match.

### `supabase/functions/forfeit-stale-disconnects/index.ts`
Invoked by cron. Single pass:

1. **Stamp**: for any active player whose `last_seen_at < now() - presence_debounce_seconds` and `disconnected_at IS NULL`, set `disconnected_at = last_seen_at` (stable start time, not `now()`).
2. **All-disconnect check (per match, single SQL)**: if every active player in a match has `disconnected_at IS NOT NULL`, finalise the match in one statement using `MAX(disconnected_at)` as the winner tiebreak, ties = draw. Marks state `__finalised`.
3. **Past-grace forfeit**: for matches not all-disconnected, players with `now() - disconnected_at > disconnect_grace_seconds` are finalised via the score-ranked path (NOT the quitter band — see engine note).

Imports from `_shared/game/engine.ts` for the ranking call → marker line added so any engine change forces this function to redeploy.

## 3. Engine predicate change (mirrored)

In both `src/lib/game/engine.ts` and `supabase/functions/_shared/game/engine.ts`:

- Add helper `isDisconnectedWithinGrace(state, seat, graceSeconds)` reading `state.players[seat].disconnectedAt`.
- Forward-scan predicate becomes `isStuck(seat) OR isDisconnectedWithinGrace(seat)` — single function, two callers. Comment block explains: "Disconnect-within-grace is NOT stuck (player may have legal moves); we just can't ask them. Same skip mechanism, distinct semantic."
- Sweep's score-ranking call documents next to it: **"Disconnects MUST NOT route through the conceded/forfeit bottom-band path. A dropped connection is not a deliberate quit. Route only explicit Leave Match through `finalisePlayer(reason='conceded')`."**

Update the mirror-hash marker in `apply-move/index.ts` (already wired) plus add the same marker line to `report-presence` and `forfeit-stale-disconnects` so CI catches drift on all three.

## 4. Instant-win composition (verify at source)

Read `finaliseByScore` and the apply-move completion path. If either filters seats on `disconnected_at IS NULL`, change to filter on `status='active'` (disconnect-within-grace stays `active` until the sweep forfeits). If already `status='active'`, leave alone and note in comment.

## 5. Frontend

### `src/hooks/useMatchPresence.ts` (new)
- Subscribes to `supabase.channel('match:' + matchId, { config: { presence: { key: userId } } })`.
- Tracks `{ user_id, seat, status: 'connected'|'reconnecting'|'disconnected', last_seen_at, ready?: boolean }` per seat.
- On own `join`/`leave`, calls `report-presence` edge function.
- Exposes `{ presenceBySeat, isReconnecting(seat), isDisconnected(seat) }`.
- Channel name shared with future B (lobby) and C (in-match) — payload includes `ready` even though A.4 doesn't set it.

### UI indicator
- `src/components/game/OpponentPanel.tsx` + `OpponentSheet.tsx`: when `isReconnecting(seat)` show "Player X reconnecting…" badge; when `isDisconnected(seat)` show "Disconnected — Xm remaining". Tiny status dot (green/amber/grey). No layout shift.
- `src/components/game/MatchOverDialog.tsx` already handles finalised matches — no change needed; sweep finalises via existing path.

## 6. Deploy & CI

- `report-presence` and `forfeit-stale-disconnects` are new files → auto-deploy on creation.
- Marker line in both, plus updated marker in `apply-move`, ensures future `_shared/game/` changes force all three to redeploy.
- Mirror sync script runs as part of the engine edit; CI mirror-hash check fails build if drift.

## 7. Out of scope (explicit)

- No "Leave Match" button (that's the explicit-quit path).
- No spectator / late-join (B territory).
- No Beat-the-Clock timer changes (per decision: timer ignores disconnect).
- No `ready` flag wiring (B will flip it; payload shape reserves the field).

## Technical notes

- Debounce architecture: collapsing the "enqueue 15s, cancel on rejoin" into "sweep stamps based on `last_seen_at` age" is functionally equivalent and avoids relying on edge-function instance lifetime (which Supabase doesn't guarantee).
- All-disconnect finalisation SQL runs inside the sweep function in one statement per affected match, so two sweep ticks can't miscompute MAX.
- `state.__finalised` idempotency tag (already in apply-move) prevents double-finalisation if sweep and instant-win race.
- Config reads: edge functions fetch the 3 ints from `game_settings` once per invocation (negligible cost, allows live tuning).
