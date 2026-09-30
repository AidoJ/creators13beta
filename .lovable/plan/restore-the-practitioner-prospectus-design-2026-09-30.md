# Restore the Practitioner Prospectus design

## Phase 1: Match A’Hara’s six-page design
- Replace the generic article with six distinct page-style sections matching the supplied prospectus:
  1. Full-colour certification cover with testimonials, branding, title and Creator figures.
  2. “Why Creator Types?” with logo, yellow title panel, body copy and training photo.
  3. Practitioner journey with two-column learning content and the right-side photo strip.
  4. Training levels in three columns with pink textured panels and beginner/intermediate/advanced footer.
  5. Q&A beside the magenta textured fields-of-expertise panel.
  6. Magenta contact panel beside eligibility and application questions.
- Preserve the supplied pink, magenta, yellow, green and multicolour visual identity rather than the site’s generic article styling.
- Keep each page readable and recognisable on desktop, while stacking its content cleanly on phones and tablets.
- Keep the existing Level 1 application action and link it from the final application section.

## Phase 2: Give A’Hara full editing control
- Extend the Admin prospectus editor from simple text blocks to six named page sections with fields that match the actual design.
- Add replace/remove controls and previews for every changeable picture used across the pages.
- Store uploaded images in managed storage and restrict image changes to authorised staff.
- Keep all current prospectus wording editable, including headings, testimonials, lists, contact details and application copy.
- Preserve the current public-read/admin-edit permission model.

## Phase 3: Download the current prospectus as PDF
- Add a prominent “Download prospectus” button on the public page.
- Generate a six-page landscape PDF from the current saved text and pictures, so it always reflects A’Hara’s latest edits.
- Keep page breaks fixed to the six designed pages and omit website-only controls from the PDF.

## Validation
- Compare all six web pages side-by-side with the supplied prospectus at desktop size.
- Check phone and tablet layouts for readable text, correctly cropped pictures and no overlaps.
- Replace a picture and edit representative text through A’Hara’s editor, then confirm both changes appear publicly.
- Download the PDF, render all six pages as images, and inspect every page for clipping, overlaps, missing images and incorrect page breaks.
- Confirm the existing Level 1 application opens from the prospectus and that non-admin visitors cannot edit or upload images.

## Technical details
- Use one structured prospectus record per designed page rather than unrestricted generic sections, because each supplied page has a different composition.
- Add semantic design tokens for the prospectus palette and texture treatment; page code will not contain ad-hoc colour values.
- Use browser-side PDF capture from the same rendered page components so the website and downloaded document cannot drift apart.
- Keep the original uploaded PDF as the visual reference only; it will not be the downloadable file once A’Hara edits the live prospectus.
