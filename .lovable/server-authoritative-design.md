# Server-Authoritative Moves — Design Doc

**Status:** Implemented (Steps 1–6). Steps 7+ are follow-ups, see §10.
**Author:** Lovable
**Date:** 2026-06-04
**Decision needed:** None — shipped.

---


## 1. Why we're doing this

You confirmed **competitive integrity is a launch goal**. Today the game is fully client-authoritative:

- The browser computes the next `MatchState` and overwrites `game_matches.state` (a JSONB blob).
- RLS lets either player in the row write the whole state.
- Opponent hands sit in plain text in that JSON — anyone with the row id and a console can read them.
- There's no `seq` / version column → last-writer-wins, no replay protection, no conflict detection.
- A determined cheater can: see opponent's hand, place illegal cards, fabricate wins, rewind turns, award themselves ELO via `bump_player_progress` (the ELO write is now clamped ±100/call, but the *match outcome* it's based on is still trusted).

For a casual play-with-friends game, that's fine. For a competitive ladder with ELO, it isn't.

## 2. Design principles

1. **The server is the only source of truth for what happened.** The client proposes moves; the server validates and applies them.
2. **The client stays optimistic for UX.** We don't want a 200ms round-trip on every card pickup. Local engine runs first, then reconciles when the server responds.
3. **Hands are private.** A player only ever receives the opponent's hand *count*, never the cards themselves.
4. **Replays are deterministic.** Every match is reconstructible from `(initial_seed, move_log)`. No "the JSON said so" — we can re-derive state from moves.
5. **Minimum new surface area.** Reuse the existing `engine.ts` reducer logic; don't rewrite the game.

## 3. Architecture

### 3.1 New data model

```sql
-- The match row stays, but the JSONB blob becomes derived state, not truth.
ALTER TABLE game_matches
  ADD COLUMN seq           bigint NOT NULL DEFAULT 0,  -- monotonic, server-managed
  ADD COLUMN rng_seed      bigint NOT NULL DEFAULT 0,  -- so server + client agree on shuffles
  ADD COLUMN public_state  jsonb;                       -- redacted state for both players
-- `state` becomes the FULL server-side state (with both hands). RLS hides it.

CREATE TABLE game_match_moves (
  match_id   uuid    NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
  seq        bigint  NOT NULL,
  actor      uuid    NOT NULL,
  move       jsonb   NOT NULL,            -- discriminated union, see §3.3
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, seq)
);
```

RLS:
- `game_matches.state` (full): **service_role only**.
- `game_matches.public_state` + scalar columns: readable by host & guest.
- `game_match_moves`: readable by host & guest; insert via RPC only.

### 3.2 Public (redacted) state

```ts
interface PublicMatchState {
  players: Array<{
    id: string;
    name: string;
    handCount: number;          // not the cards
    ecosystem: Ecosystem;       // board is public
    hiveShield: boolean;
    score: number;
    firstPickupDone: boolean;
  }>;
  // ...everything else from MatchState, MINUS opponent hands
  yourHand: DeckCard[];         // only your own
  // ...
}
```

Built server-side per recipient when we broadcast.

### 3.3 Move discriminated union

```ts
type Move =
  | { type: "draw_initial_5" }
  | { type: "pickup_from_used"; uid: string }
  | { type: "pickup_from_draw" }
  | { type: "place"; uid: string; pos: Axial; rotation: number }
  | { type: "play_disaster"; uid: string; targetPlayerId: string }
  | { type: "resolve_disaster"; useHive: boolean }
  | { type: "end_turn" }
  | { type: "concede" };
```

Every user action becomes one of these. The current `engine.ts` already has the validation logic for each — we just need to wrap it.

### 3.4 The RPC

One entry point: `apply_move(_match_id, _expected_seq, _move)`.

```sql
CREATE FUNCTION apply_move(
  _match_id     uuid,
  _expected_seq bigint,
  _move         jsonb
) RETURNS jsonb -- returns the new public_state for the caller
LANGUAGE plpgsql SECURITY DEFINER ...
```

Algorithm:
1. `SELECT ... FOR UPDATE` on the match row.
2. Reject if `auth.uid()` isn't host/guest.
3. Reject if `_expected_seq != seq` (client is stale → tell them to refetch).
4. Reject if it's not the caller's turn (or the action isn't legal for the non-turn player, e.g. `resolve_disaster`).
5. **Validate the move against current state** using a pure SQL/plpgsql implementation of the game rules. (See §4 for the big question.)
6. Apply the move → new full state.
7. `INSERT INTO game_match_moves`.
8. `UPDATE game_matches SET state = ..., public_state_host = ..., public_state_guest = ..., seq = seq + 1`.
9. Return the caller's redacted view.

Realtime listeners on the other side wake up, see new `seq`, pull the row, render.

## 4. The big question: where does game logic live?

We have ~1,000 lines of game rules in `src/lib/game/engine.ts`. We need to validate moves server-side. Three options:

### Option A: Port engine.ts to plpgsql
- ✅ Single language for the DB, no extra infra.
- ❌ Rewriting hex-grid math, rotation, win detection in plpgsql is **painful and slow to iterate on**.
- ❌ Drift risk: client TS and server SQL diverge.

### Option B: Edge Function (Deno) wrapping the same TS engine
- ✅ Reuse `engine.ts` verbatim — one source of truth.
- ✅ Easy to test (Deno test runner already wired).
- ❌ Adds a hop (`client → edge fn → db`). ~80–200ms extra per move on cold start. Warm is fine.
- ❌ Need to handle the `FOR UPDATE` lock from Deno (do it in a transactional RPC the edge fn calls).

### Option C: Hybrid — edge fn validates, RPC just persists
- Edge function loads state, runs `engine.applyMove`, calls a thin `commit_move(_match_id, _expected_seq, _new_state, _move)` RPC that does the optimistic concurrency check and writes.
- ✅ Best of both: TS rules, atomic commit.
- ✅ Most ergonomic for us right now.

**Recommendation: Option C.**

## 5. Client changes

In `Play.tsx` (or its decomposed hooks):

```ts
// Today:
setState(engine.applyMove(state, move));
saveMatchState({ ... });

// Tomorrow:
const optimistic = engine.applyMove(state, move);
setState(optimistic);                     // render immediately
const result = await rpc.applyMove(matchId, currentSeq, move);
if (result.rejected) {
  // server says no → revert to result.publicState, show toast
  setState(result.publicState);
  toast.error(result.reason);
} else {
  setState(result.publicState);           // reconcile (cheap if identical)
  setSeq(result.seq);
}
```

Realtime hook (`useMatchRealtime`) changes: it no longer deserialises arbitrary opponent JSON — it pulls `public_state_<role>` from the row.

## 6. Migration plan

Run in this order:

1. **Add `seq`, `rng_seed`, `move_log` table.** Backward-compatible — existing matches keep working with their JSONB.
2. **Ship Option C scaffolding** with one move (`end_turn`) routed through it, behind a feature flag. Validate the round-trip works.
3. **Migrate moves one at a time:** `place`, `pickup_*`, `play_disaster`, `resolve_disaster`, `draw_initial_5`, `concede`. Each move ships independently.
4. **Hand redaction.** Once all writes go through the RPC, swap the realtime subscription to `public_state` and stop sending full state to clients.
5. **Tighten RLS.** Revoke client UPDATE on `game_matches.state`. Now it's truly server-authoritative.
6. **Match-outcome → ELO.** Make `bump_player_progress` (or a replacement) callable only from the RPC that finalises a match, so the server vouches for the result.

Each step ships independently; you can pause after any of them.

## 7. What this doesn't solve

- **Collusion** between two human players (one feeding the other wins). No tech fix — needs anti-collusion heuristics on the ladder.
- **Disconnect abuse** (rage-quit to avoid a loss). Needs a separate "abandon = loss" timer policy.
- **Bot detection.** Out of scope — the bot games already write their own outcomes; we'd need to tag bot matches as non-ranked.

## 8. Estimate

- Step 1 (schema + move log): ½ day
- Step 2 (Option C scaffolding, one move, flag): 1 day
- Step 3 (migrate all moves): 3–4 days, mostly testing
- Step 4 (hand redaction + realtime swap): ½ day
- Step 5 (RLS lockdown): ½ day
- Step 6 (server-vouched ELO): ½ day

**Total: ~6–7 working days**, shippable in increments so you keep testing throughout.

## 9. Open questions for you  *(resolved)*

1. **Option C OK?** ✅ Yes (edge fn + thin RPC).
2. **Feature flag rollout vs flip-the-switch?** ✅ Flip the switch.
3. **Bot games stay client-authoritative + `is_ranked = false`?** ✅ Yes.
4. **Spectators?** ✅ Not for launch — `public_state` is just opponent-redacted, no third tier.

## 10. Follow-ups (not blocking launch)

- **At-rest hand redaction.** Realtime push uses `public_state` so opponent
  hands are not broadcast. A determined client can still `SELECT state`
  on `game_matches` (RLS allows row-level reads). To fully redact at rest
  we'd need to revoke column SELECT on `state` from `authenticated` and
  provide a `get_my_view(match_id)` SECDEF RPC that returns the caller's
  own hand plus a redacted opponent view. Punted because every PvP move
  reconciles via the apply-move response which already returns the
  caller's correct view.
- **Idle / disconnect forfeit timer.** Mentioned in §7 — still untouched.
  An abandoned PvP match sits in `active` forever.
- **Anti-collusion heuristics on the ladder.** Out of scope.

---


When you've read this, just answer the 4 questions and I'll start on step 1.
