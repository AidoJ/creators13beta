# Complete Getting Started, prospectus editing, and member profile improvements

## Getting Started — all phases

### Phase 1: finish and consolidate the navigator
- Keep one feature-key-driven checklist, merged across every access level the signed-in member holds; never show locked features.
- Keep unfinished profiling as the highlighted first action and reuse the existing profiling next-step resolver.
- Complete steps from real account data wherever possible; save only genuine first-use markers to the member account.
- Preserve the under-18 guardian waiting state, free Player game-only list, four-Creator target, practitioner steps, clickable rows/icons, and manage/cancel subscription note.
- Remove the remaining duplicate dashboard/community prompts rather than layering the navigator over them.
- Keep admin previews based only on selected access levels; the member progress function remains caller-only.

### Phase 2: guided first visits
- Add a short, skippable first-login tour tailored to the member’s available areas, with progress saved to their account and a replay action in Help.
- Add one-time, dismissible hints on Community, Events, Projects, and Practitioner pages only when the member can use that area.
- Record a visit only when its real page is opened; do not infer completion from access alone.

### Phase 3: access and staff guidance
- Add a “What’s included” view generated from the same access grid used for permissions, grouped by area and showing the next membership difference without describing unavailable tools as locked actions.
- Add an editable staff guide for Admins and Trainers, with role-aware sections and direct links to tools they can access.
- Store guide content and guide progress securely, with database-enforced Admin editing and signed-in staff reading.

## Practitioner prospectus visual editor
- Replace the current text form with a six-page landscape visual canvas matching the public prospectus and PDF page dimensions.
- Let A’Hara select and edit text directly on each page, align it, style it, and move/resize pictures with left/right text wrapping.
- Preserve page-specific visual layouts, private image storage, and the same saved content for the webpage and downloadable PDF.
- Use a restricted document model and sanitised formatting rather than arbitrary scripts/styles; show page boundaries and overflow warnings.
- Keep the Level 1 application link and existing staff-only editing permissions.

## Member profile and map improvements
- Show a Level 1 Practitioner badge on Yeah River’s member profile, using certified status and level rather than membership labels.
- Add “View my profile” from Goldie Fawn’s community settings/profile area; allow owners to view their own profile privately while public visibility remains required for everyone else.
- Show the signed-in member on the map as a distinct “You” marker when they are discoverable and have saved coordinates; exclude that marker from matching scores/results.
- Remember tile/map view and all selected member filters in this browser and restore them on return.
- Correct practitioner assignment writes so an official assignment replaces a stale self-selected source while preserving case-study assignment semantics.
- Enhance self-selected Creator Type panels with that Creator’s semantic colour treatment and the requested “does this feel correct?” prompt linking to book an official profile.

## Validation and release
- Test the navigator as Connect, Body Profile + Connect, minor awaiting guardian confirmation, free Player, and certified Level 1 practitioner; capture screenshots.
- Test tour skip/replay, first-visit hints, account-saved progress, access-grid comparisons, and Admin/Trainer staff-guide permissions.
- Edit text and wrapped images across prospectus pages, verify overflow handling, public rendering, and all six downloaded PDF pages.
- Verify Yeah River’s badge, Goldie Fawn’s own profile and Alice Springs marker, browser-persisted filters, and the self-selected Sky panel at desktop and mobile sizes.
- Run focused tests, inspect the current build and security results, then publish. Confirm the live build label and repeat the critical live checks before reporting completion.

## Technical details
- Database changes will use migrations with explicit grants, row-level security, and role checks; no roles or permissions will be inferred in the browser.
- Existing access-grid, feature, onboarding, profile, storage, and PDF systems remain the sources of truth.
- Member filter persistence uses local browser storage, as selected; guide progress remains account-saved.
