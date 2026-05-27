# Game-only signup path & player dashboard

## Goal

Let anyone sign up free **just to play the game**, with zero profiling friction (no practitioner code, no photos, no consent, no booking). They land on a slimmed, game-focused dashboard. Profiling stays available as an upsell.

## Flow

```text
Landing  ──► [Play the Game] ──► /play (anonymous solo-vs-bot)
                                    │
                                    │  "Sign up to play friends" / "Save your progress"
                                    ▼
                                /enroll ──► chooses "Just here for the game"
                                    │
                                    ▼
                            /enroll/signup (email + password only)
                                    │
                                    ▼
                              auto-Wren subscription
                              (player_only = true)
                                    │
                                    ▼
                              /dashboard (game-only view)
```

PvP invite guests keep going through `/enroll` as agreed, so they'll see the same three options (Case Study / Paying / Player) — Player is the obvious one-tap pick.

## Changes

### 1. Landing — third CTA
- `HeroSection.tsx`: add a third white-button CTA "Play the Game" → `/play`. Place beside "Get Profiled" / "Profile Yourself".

### 2. Enrollment — third path on `/enroll`
- `PlanSelection.tsx`: add a third path card "**Just here for the game**" alongside Case Study Volunteer / Paying Client. Icon: `Gamepad2`. Copy: free, no profiling, play solo + PvP.
- When selected: skip tier picker entirely, skip practitioner code. Continue button → `/enroll/signup?path=player`.
- Signup page provisions a Wren subscription tagged as player-only, then redirects to `/dashboard`.

### 3. Mark the subscription as player-only
- Add `signup_path` text column to `subscriptions` (values: `paying` | `case_study` | `player`, default `paying` for back-compat).
- New free signups via the player path set `signup_path = 'player'`. The existing case-study and paying flows set their respective values (one-time backfill: any wren subscription with no referral and no practitioner link → `player`; everything else stays as is). This is the single source of truth the gate and dashboard read from.

### 4. Enrollment gate — recognise players as "complete"
- `enrollmentGate.ts`: extend `EnrollmentState` with `isPlayerOnly` (true when `subscriptions.signup_path = 'player'`).
- `getRequiredEnrollmentPath`: if `isPlayerOnly`, return `null` immediately after `hasSubscription` — no practitioner / details / consent / photos / booking required.
- Existing case-study and paying paths are untouched.

### 5. Dashboard — game-only view
- `Dashboard.tsx`: when `isPlayerOnly`, render a slimmed layout:
  - **Welcome hero** (lightweight — name + "Player" badge instead of tier badge)
  - **Play Game** card (existing, promoted to hero position)
  - **Match History** card — recent rows from `game_matches` where user is host or guest, with opponent name, result, date, "Rematch" button (creates a fresh PvP match and copies invite link).
  - **Active Invites** card — any `game_matches` with `status='waiting'` where the user is host (so they can grab the link again) or guest (an invite addressed to them — phase 2).
  - **Stats** card — matches played, win rate, current streak. Computed client-side from `game_matches`.
  - **Upsell banner** — "Curious what your Creator Type is? Unlock profiling →" linking to `/enroll?upgrade=true`.
- Hide: PersonalDetailsCard, PhotoGalleryCard, ProgressCard, SessionCard, ZoomRecordingsCard, CreatorProfileCard, consent badge.
- Keep: DashboardHeader, DiscordLinkCard, ClientFAQSection, SubscriptionCard.

### 6. PvP invite handling (unchanged per your call)
- `/play/join/:token` continues to redirect unauthenticated guests through `/auth` → `/enroll`. The new "Player" card on `/enroll` is the one-click path for them.
- Small UX touch: if the `returnTo` looks like `/play/join/...`, the `/enroll` page shows a banner — "Your friend is waiting for you in a match. Pick **Just here for the game** for the fastest setup."

## Out of scope (phase 2)
- Global leaderboards, friend lists, rated/elo play.
- Guest-without-account play for PvP.
- Push/email invites when a friend opens an invite link.
- Player → Paying upgrade flow (existing upsell banner is enough for now).

## Technical notes

- **Schema**: one column added to `subscriptions` (`signup_path text`). Backfill in the same migration.
- **Edge function**: `create-checkout` already handles a free-Wren provisioning branch for case-study; add a `path: 'player'` branch that creates the subscription with `signup_path='player'` and skips practitioner linkage.
- **Roles**: player-only users get no `user_roles` rows (consistent with current free Wren behaviour); RLS already covers `game_matches` for authenticated users.
- **Match history query**: `select * from game_matches where host_user_id = auth.uid() or guest_user_id = auth.uid() order by updated_at desc limit 20` — existing RLS allows this.
- **Memory updates after build**: add a `mem://features/player-tier` note covering the player-only path so future work doesn't accidentally force profiling on them.

## Open follow-ups I'll need from you during build
- Exact wording for the third `/enroll` card ("Just here for the game" vs "Player" vs "Game Pass" etc.).
- Whether the player upsell banner should pitch Robin (cheapest profiling tier) or the full tier picker.
