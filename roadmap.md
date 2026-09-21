# Roadmap — Guardian consent port

- [x] Details.tsx: age calc, guardian section, validation, write guardian columns (minors only; never blank for adults)
- [x] Photos.tsx: re-read profile; <16 hard stop; 16-17 incomplete guardian -> back to details; 18+ unchanged
- [x] Dashboard PersonalDetailsCard: guardian panel for under-18
- [x] Practitioner ClientDetail: consent given/missing panel
- [x] DB trigger on profiling_photos: reject null DOB (message points to details page), <16, <18 without complete consent
- [x] Report count of profiles with null date_of_birth
- [x] Tests incl. null-DOB insert rejected; minor->adult DOB correction keeps guardian_consent_at

# Roadmap — Products / entitlement checkout (awaiting approval)

- [ ] Review + open questions answered (levels list, owl, products table collision, role vs entitlement, events re-key)
- [ ] Products/plans table + RLS + admin panel
- [ ] Inline price_data checkout + "move subscribers to current price"
- [ ] Fixed-term 13-instalment schedule + seat cap
- [ ] Case-study grant (case_study + 30-day taster)
- [ ] has_feature service-role fix; entitlement granted alongside existing role
- [ ] Events access re-key (per decision)
- [ ] Webhook: extend existing stripe-webhook endpoint (no second endpoint) — idempotency ledger, schedule/invoice events
