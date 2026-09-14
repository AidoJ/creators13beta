# Access system — switch-over checklist

Nothing below has been switched over. Every item still decides access the old way
(tier, role, status, or nothing at all) and must be migrated to `has_feature()` /
`my_features()` in a separate, reviewed change.

## Database

- `resolve_effective_tier(user)` — newest active/trialing/past_due subscription, else free.
- `get_community_events` (both overloads) — calls `resolve_effective_tier` and joins
  `training_call_tier_access` to decide event visibility and whether the Zoom link is returned.
- `training_call_tier_access` / `training_call_tier_invites` — tier-keyed access rows.
- 55+ RLS policies keyed on `has_role` (case studies, creator type profiles, profiles,
  profiling photos, courses/modules/lessons, events, resources, user_roles).
- `profiles_guard_certification` / `case_studies_guard_approval` — role-gated write guards.

## App code

- `isPaidTier` (`src/lib/clientClassification.ts`) and its call sites: Play, Play dashboard,
  Game dashboard upsell, Subscribers admin tab, practitioner Client detail, Profiling journey,
  Player dashboard.
- `hasProfilingFootprint` + inline paid check in `src/pages/Dashboard.tsx`.
- Direct `subscriptions.tier` reads: enrollment gate, Play, Play dashboard, Trainer,
  Plan selection, Photos, Details, Dashboard, Admin, Training call manager,
  Subscription card, Profiling prompt.
- `profiles.practitioner_status`: Admin status dropdown (`Admin.tsx` ~268–276),
  Trainer, Practitioner selection, practitioner Client detail (`isCertified`).
- `user_roles` / `has_role`: `RoleGuard`, plus edge functions (create-checkout,
  classify-photos, admin-update-user, create-user, and the shared `requireRole`).

## Access decisions with no tier or role predicate (added 14 Sep 2026)

These do not surface in a tier/role grep but are in scope for the switch-over:

- `supabase/functions/send-profiling-report/index.ts:44-53` — authorises purely on an
  active `client_practitioner` relationship. No certification check at all.
- `game_matches` INSERT RLS — ownership only. The 2-vs-4 seat cap is enforced
  client-side in `src/pages/Play.tsx:1374-1380` and is trivially bypassable.
