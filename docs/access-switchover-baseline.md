# Access switch-over — itemised regression baseline

Measured 22 Sep 2026, before the paid-tier backfill (Step B) and before publishing Step C.
"Before" = old tier/role check. "After" = access grid (entitlements held today).

Events in the system and their audiences:

| Event | Free (wren) | Creator (robin) | Co-Creator (cockatoo) | Owl |
|---|---|---|---|---|
| 13CREATORS ~ LIVE In Alice Springs | yes | yes | yes | yes |
| Bush Creators ~ Alice Springs | yes | yes | yes | yes |
| Training Session | no | no | yes | yes |
| Weekly Training | no | no | yes | yes |

## Account-by-account

| Account | Plan / status | Levels held | Events before | Events after | Verdict |
|---|---|---|---|---|---|
| ajleo2205+test9 | none (Free) | none | 2 (both public) | 2 (same two) | unchanged |
| ajleo2205+testcom | wren / active (Free) | none | 2 | 2 | unchanged |
| janetkent09@gmail.com | none | none | 2 | 2 | unchanged |
| janetkent09@icloud.com | none | none | 2 | 2 | unchanged |
| ajleo2205+test2 (certified practitioner, no separate membership) | robin / incomplete → effective Free | prac_l1_certified, existing_profiled | 2 | 2 (same two) | events unchanged; community messaging, matching filters and project-profile creation/editing intentionally not granted |
| ajleo2205+test1 | robin / incomplete → Free | existing_profiled | 2 | 2 | unchanged |
| ajleo2205+test3 | robin / active | existing_profiled | 2 | 2 (same two) | unchanged |
| ajleo2205+test4 | robin / active | existing_profiled | 2 | 2 | unchanged |
| ajleo2205+test5 | wren / active | existing_profiled | 2 | 2 | unchanged |
| ajleo2205+test6 | robin / incomplete | existing_profiled | 2 | 2 | unchanged |
| ajleo2205+test7 | owl / active | prac_l1_trainee | 4 | 2 | REGRESSION until backfill grants `owl` |
| ajleo2205+test8 | robin / incomplete | none | 2 | 2 | unchanged |
| benisjamn | robin / active | none | 2 | 2 (same two) | unchanged |
| jtothek2 | robin / active | none | 2 | 2 | unchanged |
| julkent | robin / active | none | 2 | 2 | unchanged |
| ramiaamanda | robin / active | none | 2 | 2 | unchanged |

Robin accounts see no event loss because no event is currently Creator-only: every
event visible to Creator is also visible to Free. Only Owl/Co-Creator events differ,
which is why test7 is the single regression.

## Certified practitioner (test2) — feature detail

`prac_l1_certified` grants: general community profile, view member profiles, members
map, dashboard settings, upload photos, view Creator profiles, create + view events,
all game modes incl. multiplayer hosting, case-study creation, practitioner code,
project viewing, shop.

It does **not** grant: `community_message_members`, `community_matching_filters`,
`community_create_profile_project`, `projects_add_edit` — the intended loss for a
certified practitioner holding no separate membership. Project *viewing* is retained.

Caveat: the community and project screens have not been switched to `has_feature()`
yet (Step C covered dashboard, multiplayer seats and events only), so this loss is
defined in the grid but not yet enforced in the UI.
