# Merge Plan v3: Promote Beta → Live (hardened, on-the-shelf)

**Status:** strategy locked, **not yet scheduled**. Beta still has game work to finish. This plan sits ready for when you give the cutover green light.

Strategy: beta becomes the new live. Beta's backend stays; live's data is migrated *in*; the custom domain is re-pointed.

---

## Phase 0 — Trigger (when beta game work is done)

Before phase 1 starts, confirm:
- Beta game build is feature-complete and stable on 3-client live test.
- No further structural schema changes planned on beta in the cutover window.
- No further code/content changes planned on live in the cutover window (110 users, low-traffic — easy to freeze).

---

## Phase 1 — Pre-flight (no production touch)

### 1a. Schema diff — DB-to-DB, not repo-to-repo

The diff source is **`pg_dump --schema-only` against both Cloud projects**, not the `supabase/migrations/` folders.

Why: migrations are append-only history. Beta has 145 migration files; live has its own separate set. Replaying them doesn't give you a side-by-side current state, and a repo-level diff is messy for renames/drops and blind to any drift between migration history and live DB state.

The repo migrations are still useful — as a **cross-check** that beta has no out-of-band changes — but not as the diff source.

Note: Lovable Cloud's agent tooling doesn't expose full `pg_dump`. The dumps need to be pulled directly using each project's DB connection string (from Cloud settings) or coordinated via Lovable support. This is a manual step, owned by you, not something I can run from here.

Two diff reports produced:
- **live → beta**: additions/changes beta has (expected — beta is ahead).
- **beta → live**: anything live has that beta dropped/renamed in refactors. Every entry needs an explicit rule in the migration script: transform, rename, drop with confirmation, or block migration. Live data in a dropped column has nowhere to land otherwise.

Diff scope (all of these matter, not just tables/columns):
- Tables, columns, types, defaults, nullability, enums
- FKs, indexes, unique constraints, CHECK constraints
- RLS policies (per-table, per-role, per-action)
- Trigger definitions and function bodies (full source, not just signatures — `types.ts` is blind to bodies)
- Storage bucket names, privacy flags, MIME/size limits, and `storage.objects` RLS policies
- Sequences and grants

### 1b. Code parity check
Confirm every fix/content change made on live since the fork is already in beta. Anything missing gets ported into beta **before** cutover, not after.

### 1c. Storage sizing
Measure object count + total bytes per bucket on live (profiling-photos, recordings, attachments, avatars, etc.). "Copy objects" could be many GBs — sizing drives whether we stream in parallel, chunk by bucket, or pre-stage incrementally before the freeze.

Carry bucket-level settings too: privacy, MIME types, size limits, and `storage.objects` policies. Not just the objects.

### 1d. Profiling-photos privacy fix — sequenced
**Recommendation: out of this cutover, scheduled immediately after.** Reasons: signed-URL code path needs testing in beta against migrated data first; bundling two disruptions doubles rollback complexity. Bucket migrates with current privacy setting; a follow-up flips it once signed URLs are verified.

---

## Phase 2 — Auth migration (the hard part, spelled out)

This gets its own sub-phase with its own smoke tests.

### What actually moves

For every user in `auth.users` on live, preserve on beta:
1. **`auth.users` row** — same UID (critical: every public FK and storage object path keys off it), email, phone, `email_confirmed_at`, `created_at`, `last_sign_in_at`, `raw_user_meta_data`, `raw_app_meta_data`.
2. **`auth.identities` rows** — one per linked provider per user. `provider`, `provider_id`, `identity_data`, `last_sign_in_at`. **Without these, OAuth users cannot sign in.**
3. **`encrypted_password`** — bcrypt hash for email/password users, portable across Supabase projects.

### Email/password vs OAuth — separate paths

- **Email/password users**: migrate `auth.users` row + `encrypted_password` + `auth.identities` row of `provider='email'`.
- **Google OAuth users**: migrate `auth.users` row (no password) + `auth.identities` row of `provider='google'` with exact `provider_id` (Google's `sub` claim) and `identity_data` intact. Wrong/missing `provider_id` → Google sign-in creates a *new* user on next login, original is orphaned.
- **Discord OAuth users**: same as Google — preserve `provider_id` exactly.
- **Mixed-identity users** (email + linked Google): both identity rows must move together.

### Providers configured on beta BEFORE auth import
Google + Discord OAuth client IDs/secrets configured on beta, redirect URLs whitelisted (including the production custom domain). If a provider is missing when identity rows are imported, users of that provider can't sign in.

### Three separate auth smoke tests
1. Email/password — known user, password unchanged.
2. Google — known Google-only user.
3. Mixed — user with both providers, both methods.
Plus: password reset → email lands → reset completes.

---

## Phase 3 — Full dry-run rehearsal

**Mandatory gate.** The real cutover is the **second** time the script runs.

1. Clone live data (DB + storage) into a scratch Cloud project (or wiped/restored copy of beta).
2. Run the migration script end-to-end against it.
3. Run the full smoke suite (auth ×3 + profile/photos/subscription/case-study/practitioner-linkage/training/recordings).
4. Fix every script issue. Re-run until clean.
5. Throw the rehearsal data away.
6. Time the rehearsal end-to-end → real window's duration.

---

## Phase 4 — Cutover (the real window)

### Before the window
- Drop DNS TTL on the custom domain(s) to 60–300s **several days ahead** → fast propagation on the day.
- Pre-stage storage objects if sizing showed large volume; final delta pass during the freeze.

### During the window
1. **Freeze live**: maintenance banner + block writes (revoke `INSERT`/`UPDATE`/`DELETE` for `authenticated`, or take auth offline). Must hold through DNS propagation overlap — any write to old-live after this point is lost.
2. **Disable** (don't delete) Stripe webhook on live → retries queue up.
3. Migration script: auth → public tables in FK order → storage delta.
4. Smoke suite on beta against migrated data. **Go/no-go decision happens here, while maintenance is still up.** Rollback is only clean until the first user writes to the new system.
5. Re-point DNS to beta.
6. Swap Stripe webhook endpoint URL to beta's edge function.
7. Update OAuth redirect URLs (Google, Discord) to beta.

### Stripe event replay — explicit
- Stripe does **not** auto-replay events that succeeded before the URL changed; it does retry **failed/pending** deliveries on its normal schedule (up to ~3 days). Update the *existing* endpoint URL on the Stripe side rather than creating a new endpoint — preserves the retry queue.
- Manually replay any events missed entirely from Stripe Dashboard → Developers → Events, filtered to the freeze window.
- **Real-data webhook test, not generic**: pick one migrated paying subscriber, trigger a real event for *their* customer ID (e.g. `customer.subscription.updated` via Dashboard), confirm beta's webhook processes it correctly against the migrated `subscriptions` row. Generic test events don't prove the FK linkage survived.

### Lifting maintenance
Only after smoke suite + Stripe replay test on a migrated customer both pass. Once lifted, rollback effectively closes (new writes on beta won't exist on old-live).

---

## Phase 5 — Post-cutover

- Old-live archived read-only for 30 days as a reference, not a live rollback target.
- Monitor edge function logs + Stripe webhook deliveries for 48h.
- Restore DNS TTL.
- Schedule profiling-photos → private follow-up (per 1d).

---

## What I still need from you (when you trigger phase 0)

1. **Live code/content delta since fork** — anything on live that isn't in beta yet?
2. **Domain(s)** to re-point — confirm exact hostnames currently on live.
3. **Stripe webhook swap** — confirm we update the *existing* endpoint URL (preserves retry queue) rather than creating a new endpoint + deleting the old one.

---

**Approval semantics:** approving this plan **does not** start phase 1. It locks the strategy on the shelf. When beta game work is done and you message "kick off the merge," I begin phase 1 with the three answers above.
