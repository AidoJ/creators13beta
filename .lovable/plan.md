# Getting Started navigator — Phase 1 design (proposal)

Note: the draft steps per level did not come through with the message. The step list below is my own draft built from the live access grid. Send the draft and I'll re-map it before building.

## What the member sees (dashboard)

- One "Getting started" card at the top of the dashboard/Me page, in place of the scattered prompts.
- Header: "Getting started — 3 of 7 done", with a thin progress bar.
- **One highlighted next step**: the first step not done, shown large, with a title, a one-line description and a "Go" button.
- The rest shown as a compact list: done steps ticked; later steps in grey but still clickable (the order is a suggestion, not a lock).
- "Hide for now" collapses it to a one-line strip. Once everything is done it shows "You're all set" once, then goes away. A **help button (?)** stays in the header permanently (see below).
- The welcome after purchase becomes the card's header on first view ("Welcome to Connect, Anna — here's how to get started"), not a separate banner.

### Help button
A "?" in the dashboard header opens a panel with: the full checklist (including finished and hidden steps), "Replay the tour" (Phase 2 placeholder), and a contact line. It works even after the checklist is finished or hidden.

## What it replaces
Removed from the dashboard and brought into the guide:
- "Create your community profile" strip
- "Continue where you left off" (enrolment)
- Private-profile banner ("your profile is hidden")
- Post-purchase welcome message

Not replaced (these aren't onboarding): the game practice ladder, quiz stats, discount codes, Settings, FAQ.

## Draft step catalogue (merged across levels, no per-level lists)

Each step names one feature key. A member sees it only if `has_feature(key)` is true, so a member holding several levels (e.g. Body Profile plus Connect) gets one merged list with no duplicates.

| # | Step (editable wording) | Feature key | Done when (from real data) | Reliable? |
|---|---|---|---|---|
| 1 | Finish your profiling journey (shows the actual next step, e.g. "Upload your photos") | dashboard_upload_photos | Existing next-step logic reports nothing left | Yes, reuses the existing logic |
| 2 | See your Creator Types | dashboard_view_creator_profiles | Member has an assigned (not self-picked) Creator Type **and** has opened their profile page once | Assigned: yes. "Opened": needs a new one-time mark |
| 3 | Create your community profile | community_create_profile_general | Community profile completed date is set | Yes |
| 4 | Make yourself visible on the map | community_view_members_map | Discoverable on **and** location has map coordinates | Yes |
| 5 | Send your first connection request | community_message_members | At least one contact request sent | Yes |
| 6 | Try the matching filters | community_matching_filters | — | **No**, filter use isn't stored. Option: mark done on first use, or drop the step |
| 7 | Look at upcoming events | events_view | First visit to Events | Needs a new one-time mark |
| 8 | Explore Projects | projects_view | First visit to Projects | Needs a new one-time mark |
| 9 | Start or join a project | projects_add_edit | Creator or co-creator on at least one project | Yes |
| 10 | Play your first game | game_bot_player | Game progress shows at least one match | Yes |
| 11 | Invite a friend to a match | game_multiplayer_invite | Has hosted a match with an invite code | Yes |
| 12 | Set your contact preferences | dashboard_settings | Contact settings saved at least once | **Partly**: defaults can't be told apart from a deliberate save unless a "saved at" date is added |
| 13 | Share your practitioner code | prac_code_assigned | Practitioner code exists **and** at least one client/case study linked | Yes (code) / yes (link) |
| 14 | Create your first case study | prac_case_study_creation | At least one case study | Yes |
| 15 | Refer a clinic client | prac_clinic_referral | At least one clinic invitation sent | Yes |
| 16 | Open the profiling tools | prac_profiling_tools | First visit to the profiling queue | Needs a new one-time mark |

Can't be reliably detected from existing data: **6** (filters), **12** (contact settings, without a new date), and the "first look" steps **2, 7, 8, 16**, which need a one-time "visited" mark saved on the account. Those marks are small, saved to the account, and also serve Phase 2's first-visit hints.

Not included, and not steps: shop_view_purchase and shop_manage_subscription (everyone has these), game_1v1/multiplayer (covered by step 10), events_create (for staff and practitioners; can be added).

Staff (admin/trainer) don't see the guide unless they also hold member access.

## Admin controls (Admin > Getting started)
- A table of steps: title, description, button label, on/off, and order. A'Hara edits wording; changes appear straight away.
- Admins **cannot** change the feature key or the completion check; those are fixed so a step can't point to something the member doesn't hold.
- A preview showing "what a member with level X sees".

## Rules
- A step for a feature the member doesn't hold never appears. The server applies the filter too, not just the screen.
- Losing access (for example a cancellation) hides the step and doesn't count it in progress.
- Progress is always worked out from real data. The only things saved are "hidden for now", "all set seen" and the visited marks, all on the account, so it follows the member across devices.

## Technical details
- New table `onboarding_steps` (key, feature_key, title, description, cta_label, route, sort_order, enabled, check_key). Readable by signed-in users; only admins can edit (via `has_role`). Seeded with the rows above.
- New table `onboarding_state` (user_id PK, dismissed_at, completed_seen_at, visited jsonb). Each member can only read or change their own row.
- New RPC `get_my_onboarding()` (security definer): joins steps to `my_features()` and runs each `check_key` in SQL against profiles, creator_type_profiles (source ≠ self_selected), contact_requests, projects/co-creators, player_progress, game_matches, case_studies, client_invitations, and returns steps with `done`. It never returns rows for features the member doesn't hold.
- Profiling step: the client runs the existing `getNextEnrollmentStep` / `loadEnrollmentState` and puts its label and route into step 1. No second copy of that logic.
- New `GettingStartedCard` + `HelpButton` components. Removes `ContinueEnrollmentBlock`, `CommunityProfilePrompt`, the private-profile banner and the welcome block from Dashboard/PlayerDashboard. Record the decision in AGENTS.md.

## Phase 2 (outline)
- A skippable first-login tour that highlights only the menu items the member holds, reusing the game's `TutorialOverlay` pattern. Replay it from the help button.
- A one-time hint on first visiting Community, Events, Projects and the Practitioner area. It uses the same visited marks, so seeing a hint also ticks the matching "first look" step.

## Phase 3 (outline)
- A "What's included" page: features the member holds, grouped by area, plus "the next level adds…" worked out from the access grid difference to the next level up.
- A staff guide for admins/trainers: a short manual of admin areas, shown only to staff.

## Questions
1. Please send the draft steps per level. They didn't arrive with this message.
2. Steps 6 and 12: mark done on first use (adds a small save), or drop them?
3. Should the guide also appear on the free Player dashboard (game steps only)?
