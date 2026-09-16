# Guardian consent — port from the live site

The six guardian columns already exist here but nothing fills them, and there is no age
check anywhere in enrolment. This ports the working guardian flow across, unchanged in
behaviour, and adds one extra safety net the live site does not have.

## 1. Personal details page (enrolment)

- Work out the person's age from their date of birth. Under 18 = a minor.
- When they are a minor, a "Parent / Guardian Consent" section appears (amber panel):
  a consent tick with the exact wording from live, guardian first name, last name,
  phone (international format, e.g. +61 …) and email.
- Saving is refused until the tick is on, both names are filled, the phone matches the
  international format and the email is valid — each with its own message.
- All six guardian columns are written on save. For an adult all six are saved as blank.
  The consent timestamp is only stamped when the person is a minor and has ticked.
- The date of birth field itself keeps accepting any date — no minimum age on the input.

## 2. Photos page (enrolment)

A second, independent check that re-reads the saved profile rather than trusting the
form:

- Under 16: hard stop, message shown, sent to the dashboard.
- 16 or 17 with guardian details incomplete: message shown, sent back to the personal
  details page with a return link to photos.
- 18 or over: unchanged.

## 3. Dashboard

Under-18 members see a guardian panel on their personal details card: guardian name,
phone, email and a "Consent confirmed" tick when recorded, or an amber warning that
consent is required before photo upload when it is not.

## 4. Practitioner client view

For an under-18 client, a panel shows Consent Given / Consent Missing with the age, the
guardian's name, phone, email and the consent date. When missing it shows the warning
not to proceed with profiling until consent is provided.

## 5. Server-side enforcement (new — not on live)

Approach, for your approval before I apply it:

- A check that runs inside the database before any photo record is created. It reads the
  person's saved date of birth and guardian fields and refuses the record when:
  - the date of birth shows under 16, or
  - under 18 and consent is not ticked, or any of the four guardian fields is blank.
  - a missing date of birth is allowed through (people can upload before filling in
    details; the enrolment order already requires details first, and blocking here
    would break existing adults who never recorded a birth date).
- The refusal produces a clear error message rather than a silent failure.
- Storage: the file-upload layer is not covered by the same check, because the storage
  system stores files under a folder named after the user and the database check is what
  makes the photo visible to the app. A file uploaded directly without a matching photo
  record is orphaned and never shown or used. I recommend covering the photo record
  only; adding a second rule on raw file storage means duplicating the age logic in a
  place we cannot test as safely. Tell me if you want it on raw storage too.
- Admin and practitioner upload paths go through the same photo records, so they are
  covered by the same rule.

## Tests (test accounts only)

15-year-old: details save, photos hard-block to dashboard. 17 without guardian data:
details refuse, photos bounce back. 17 with guardian data: details save with the
timestamp, photos allowed. 25: no guardian section, photos fine, six columns blank.
Direct database insert for the 15-year-old: refused. Practitioner sees the warning for a
17-year-old without consent.

## Not touched

Access levels / entitlements work, the privacy policy page, and the date-of-birth input
keeps no minimum age.
