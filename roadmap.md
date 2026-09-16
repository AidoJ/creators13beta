# Roadmap — Guardian consent port

- [ ] Details.tsx: age calc, guardian section, validation, write guardian columns (minors only; never blank for adults)
- [ ] Photos.tsx: re-read profile; <16 hard stop; 16-17 incomplete guardian -> back to details; 18+ unchanged
- [ ] Dashboard PersonalDetailsCard: guardian panel for under-18
- [ ] Practitioner ClientDetail: consent given/missing panel
- [ ] DB trigger on profiling_photos: reject null DOB (message points to details page), <16, <18 without complete consent
- [ ] Report count of profiles with null date_of_birth
- [ ] Tests incl. null-DOB insert rejected; minor->adult DOB correction keeps guardian_consent_at
