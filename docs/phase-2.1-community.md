# Phase 2.1 — Community Layer

Closed: 9 June 2026

This phase added a member-to-member **Community** layer on top of the existing
client / practitioner / game stack. It is gated behind the user's
`community_visible` profile flag and only reachable for members who have
completed onboarding.

---

## What shipped

| Batch | Area | Notes |
|---|---|---|
| 1 | Foundation schema | `profiles` extended (`location_label`, `location_lat/lng`, `community_joined_at`, `member_preferences`, `community_visible`, `profile_completed_at`). New tables `member_match_scores`, `member_animals`. RLS + GRANTs on all public tables. |
| 2 | Auth + profile bootstrap | Re-used existing auth; community fields hydrated on first visit to `/onboarding/profile`. |
| 3 | Profile create / edit / public view | `ProfileWizard`, `CommunitySettings`, `MemberProfile` (`/member/:userId`). |
| 4 | Geocoding | `geocode-location` edge function (Google Maps Geocoding API). Populates `location_lat/lng` from free-text `location_label`. |
| 5 | Matching algorithm | `compute_match_score(a,b)` + `get_my_top_matches(limit)` RPCs. Score is 0–10 weighted blend of shared Creator Types, member preferences overlap, and proximity. |
| 6 | Creator of the Month | `get_creator_of_the_month()` RPC. Deterministic cycle over eligible members; surfaces cycle position + start/end dates on the Community Dashboard. |
| 7 | Face View dashboard | `/community/dashboard` with honeycomb lotus tiles, SVG lotus frame, Creator of the Month spotlight, top-matches list. |
| 7.5 | Robin schema fields | `project_seek_me_for`, `project_top_skills`, `project_dream` on `profiles` — surfaced on the public member profile. |
| 8 | Map View | Toggle on the Community Dashboard. `CommunityMapView` renders top matches as Google Maps avatar markers sized by score (xl 200 / lg 150 / md 110 / sm 80 px, same thresholds as Face View). |
| Sec | SECURITY DEFINER audit | Hardened `commit_move` (`auth.uid()` must equal `_actor`); revoked EXECUTE on `commit_move`, `bump_player_progress`, `admin_reset_player_progress` from anon/authenticated — service_role only. See migration `20260609115019_*`. |

---

## What's deferred (out of scope for 2.1)

- **Member-to-member messaging / DMs.** No inbox, no thread storage. The
  only contact path today is the public profile.
- **Notifications** (new match, new Creator of the Month, profile views).
  No Realtime channels wired for community events yet.
- **Search & filters** beyond top-matches. No keyword search, no
  filter-by-Creator-Type browse.
- **Block / report / mute.** Visibility is binary via `community_visible`.
- **Map clustering.** Markers render individually; fine for current
  density, will need clustering > ~100 visible members per viewport.
- **Match score explainability UI.** Score is shown as a number; the
  per-factor breakdown is not surfaced to end users.
- **Server-side rate limiting on `geocode-location`.** Relies on
  authenticated invocation + Google's own quota.
- **Pagination on `get_my_top_matches`.** Returns a single capped list.

---

## Assumptions & gotchas

- **Single source of truth for profile data is the dashboard.** No PDF
  ingest, no external CMS. All community fields live on `profiles`.
- **Creator Types are equal forces.** UI must never imply hierarchy
  (no "primary/secondary"). Canonical order and Title Case enforced.
- **Visibility gate.** A member is community-visible iff
  `profile_completed_at IS NOT NULL AND community_visible = true`. Both
  the dashboard cross-links and `RequiresCompletedProfile` enforce this.
- **Geocoding is best-effort.** `location_label` is free text; failures
  leave lat/lng null and the member silently drops out of Map View but
  remains in Face View.
- **Match scoring is a heuristic, not a recommendation engine.** Weights
  live inside `compute_match_score`; tune in SQL, not in the client.
- **Creator of the Month cycle is deterministic** (hash of user_id over
  cycle window). No admin override yet — if needed, add an
  `is_featured_override` column rather than mutating the RPC.
- **Map markers use Google Maps JS SDK** (`VITE_GOOGLE_MAPS_API_KEY`
  in `.env`). Key is referrer-restricted at the Google Cloud console;
  rotate via the Google Maps Platform connection.
- **Game RPC hardening (security batch)**: `apply-move` edge function is
  now the *only* path to `commit_move` from a client. Any future
  client-side fallback for moves will require re-granting EXECUTE.
- **Phase 2.2 entry point**: dashboard navigation labels — the three
  surfaces (Personal / Game / Community) need a clearer header treatment.
  Tracked separately, not part of 2.1.

---

## Key files

- `supabase/migrations/2026*_community_*.sql` — schema + RPCs
- `supabase/functions/geocode-location/` — Google Geocoding wrapper
- `src/pages/community/CommunityDashboard.tsx` — Face + Map toggle
- `src/components/community/LotusFrame.tsx`, `LotusProfile.tsx` — Face View
- `src/components/community/CommunityMapView.tsx` — Map View
- `src/pages/member/MemberProfile.tsx` — public profile
- `src/pages/settings/CommunitySettings.tsx` — visibility + Robin fields
- `scripts/seed-community-test-profiles.ts` — local seed data
