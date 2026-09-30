
- Location suggestions come from the `places-autocomplete` backend function (Google Places via connector gateway); never load the browser Places library — the managed browser key does not allow it.
- A front-page product chosen before sign-up is remembered in localStorage and in the account sign-up data (`pending_buy`), so checkout resumes after email verification wherever the link lands.
- Trusted SECURITY DEFINER flows that must write guarded guardian fields set the transaction-local flag `app.guardian_trusted` (checked by `profiles_guard_certification`).
- The public practitioner prospectus is a structured six-page layout backed by `prospectus_sections`; staff-editable images live in the private `prospectus-assets` bucket and are served with signed URLs so web and generated PDF stay aligned.
- The dashboard Getting Started guide is access-grid driven; its self-only progress function takes no user ID, while admin previews use selected access levels and synthetic state only.
- Getting Started Phase 2 tours replay from the account-saved guide, while Phase 3 derives “What’s included” from access data and keeps the staff guide admin-editable.
- Community map and Creator Type filters persist only in the current browser; the member’s own discoverable profile is a distinct “YOU” map marker, never a match result.
- The prospectus editor uses rich page content with alignment and image wrapping while preserving the structured six-page renderer and matching PDF output.
