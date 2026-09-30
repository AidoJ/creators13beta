# Complete Getting Started, prospectus editing, and member profile/map fixes

## Outcome
Complete Getting Started Phases 2 and 3, replace the limited prospectus form with a visual six-page webpage editor, and resolve A’Hara’s member profile/map findings without changing the meaning of Creator Type content.

## 1. Finish and harden Phase 1
- Complete the existing first-use marks for filters, Events, Projects, Creator Types and practitioner tools so real actions update the checklist.
- Keep the agreed rules: unfinished profiling is always first; under-18s wait for guardian email then phone confirmation; free Players get game-only steps; Meet Creators completes at four; Invite appears only with its feature; no contact-preferences step.
- Retain the post-purchase manage/cancel note and selected-access-level-only admin preview.
- Remove remaining dashboard prompts that duplicate the navigator rather than layering both experiences.
- Verify the member function evaluates only the signed-in account and saved progress follows that account.

## 2. Getting Started Phase 2 — tour and first-visit hints
- Add a skippable first-login tour over the navigation items each member can actually access; inaccessible areas will never be shown or described as locked.
- Use stable page targets and an accessible focus/highlight layer, with Back, Next, Skip and Finish controls.
- Save tour completion to the member account and enable “Replay the tour” from Getting Started help.
- Add one-time, dismissible first-visit hints for Community, Events, Projects and Practitioner areas.
- Reuse the same saved visit marks for checklist completion, so hints and progress never disagree.

## 3. Getting Started Phase 3 — What’s included and staff guide
- Add a member “What’s included” page driven by the access grid, grouped into clear areas.
- Show “The next level adds…” only when a real next member level exists; compute differences from the access grid rather than maintaining duplicate lists.
- Add links from the Getting Started help panel and relevant account navigation.
- Add an editable starter guide for Admin and Trainer areas, with separate sections and role-based visibility.
- Let admins edit guide titles, wording, links, order and visibility; trainers can read relevant guidance but cannot edit it.

## 4. Practitioner prospectus — visual webpage editor
- Replace the section-by-section form with a direct visual editor for each of the six landscape pages, preserving the current prospectus design as the starting layout.
- Allow A’Hara to click and edit text in place; align text left, centre, right or justified; format headings, lists, emphasis and links.
- Allow images to be uploaded/replaced, selected, resized, aligned, and floated left/right so text wraps around them; include no-wrap and remove controls.
- Keep page boundaries visible and provide page selection, preview, undo/redo, save status, and safe overflow warnings when content exceeds a page.
- Store a safe page-layout document rather than unrestricted executable HTML: only approved elements, links, images and layout styles survive sanitisation.
- Preserve private image storage and signed delivery. Keep the public six-page page and PDF download generated from the same saved content.
- Test the PDF page-by-page for wrapping, alignment, image fidelity, fonts and overflow.

## 5. Member profile and map fixes
- Add a clear “Certified Level 1 Practitioner” badge (and equivalent certified level where applicable) to member profiles using authoritative certification data.
- Correct practitioner assignment so a formally assigned profile cannot remain labelled `self_selected`; preserve the separate case-study source path.
- Add “View my profile” beside profile editing, and permit a signed-in member to view their own profile even when it is not publicly discoverable. Other members retain the existing visibility rules.
- Add the current member to map view as a distinct “You” marker when they are discoverable and have coordinates, while keeping them excluded from matching scores/results.
- Save selected member filters in the current browser and restore valid mode/value choices when returning to map or tile view.
- Enhance self-selected Creator Type panels using that Creator’s colour, clearly label them “Self-selected,” and add a prompt linking to the shop/profiling path to confirm whether the choice is correct and book profiling. Officially assigned profiles keep the existing authoritative presentation.

## Data and security
- Extend the existing onboarding account state for tour/hint marks and completion; do not introduce a user-ID parameter to the self-only member function.
- Add editable staff-guide content with database-enforced admin writes and authenticated role-based reads.
- Expose only the certification fields required for a public badge through the existing controlled member-profile function; do not broaden direct profile-table access.
- Keep map self-visibility subject to the member’s discoverability setting and coordinates.
- Keep prospectus content sanitised and disallow scripts, embedded frames, event handlers, unsafe URLs and arbitrary positioning.

## Validation and evidence
- Test the five agreed navigator personas: Connect, Body Profile + Connect, minor awaiting guardian confirmation, free Player, and certified Level 1 practitioner.
- Test first login, skip, replay, first-visit hints, cross-device account progress, and access-level-only admin previews.
- Test “What’s included” against several single and combined access sets; test Admin versus Trainer staff-guide permissions.
- Test prospectus editing for alignment, wrapped/resized images, save/reload, public rendering, mobile viewing and six-page PDF output.
- Test Yeah River’s practitioner badge, Goldie Fawn’s self-profile link, own Alice Springs map marker, filter persistence, and both self-selected and practitioner-assigned Creator panels.
- Run focused tests, type checking, preview browser screenshots and a fresh security scan. Publish only after these checks pass, then confirm the live build label and repeat the requested user-facing checks on the live site.

## Technical decisions
- Use a maintained React rich-document editor for the visual canvas rather than extending deprecated browser editing commands.
- Model prospectus pages as sanitised structured content with constrained layout attributes; retain one rendering path for screen and PDF.
- Reuse the current onboarding tables/functions, access grid, feature checks and profiling next-step resolver rather than duplicating entitlement or enrolment logic.
