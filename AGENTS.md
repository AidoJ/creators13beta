
- Location suggestions come from the `places-autocomplete` backend function (Google Places via connector gateway); never load the browser Places library — the managed browser key does not allow it.
- A front-page product chosen before sign-up is remembered in localStorage and in the account sign-up data (`pending_buy`), so checkout resumes after email verification wherever the link lands.
- Trusted SECURITY DEFINER flows that must write guarded guardian fields set the transaction-local flag `app.guardian_trusted` (checked by `profiles_guard_certification`).
- The public practitioner prospectus is a structured six-page layout backed by `prospectus_sections`; staff-editable images live in the private `prospectus-assets` bucket and are served with signed URLs so web and generated PDF stay aligned.
