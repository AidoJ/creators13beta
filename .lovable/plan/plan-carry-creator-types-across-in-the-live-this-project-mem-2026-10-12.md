# Plan: carry Creator Types across in the Live → this project member import

Design only. Nothing runs until approved.

## Answer to the earlier question: how "who set it" is given today

The current member import (`batch-import-users`) does **not** copy Creator Types at all. It creates the account, updates `profiles`, adds the `client` role and a practitioner link. No line touches `creator_type_profiles`.

If Creator Types were copied by any other route (a script, SQL, an upsert without the field), the defaults on `creator_type_profiles` decide the result:

| Column | Default | Effect |
|---|---|---|
| `source` | `'practitioner'` (NOT NULL) | Any row inserted without `source` is treated as **official** |
| `profiled_by` | none (NULL) | No assigner recorded |
| `profiled_at` | none (NULL) | No date recorded |

Code path that reads it: `CreatorProfileCard.tsx` treats `source` of `practitioner` or `case_study` as official and `self_selected` as "Your pick". The lock trigger `creator_type_profiles_lock_practitioner_assignment` stops a member downgrading an official row, but service-role writes skip it (`auth.uid() IS NULL`). So the only thing that decides "official" today is that column default. The import will set `source` explicitly and never rely on it.

## 1. Column mapping, Live → this project

Rows are matched by **email**, not user id: ids differ between projects. Live `user_id` → Live email → this project's `auth.users.id`.

| Live `creator_type_profiles` | This project `creator_type_profiles` | Rule |
|---|---|---|
| `user_id` | `user_id` | Map via email. No match → skip and report |
| `primary_type` | `primary_type` | Trim, match case-insensitively to the 13 names, write in Title Case |
| `secondary_type` | `secondary_type` | Same rule |
| `type_3` | `type_3` | Same rule |
| `type_4` | `type_4` | Same rule |
| `profiled_by` | `profiled_by` | Map via assigner's email (see 2) |
| `profiled_at` | `profiled_at` | Copy as-is |
| `profiling_data->>'source'` | `source` | `'case_study'` → `case_study`; missing → `practitioner` |
| rest of `profiling_data` | not copied | Ignored, as instructed. Written as `{"imported_from_live": true, "live_profiled_by_email": ...}` for an audit trail only |
| case study's own type list | not copied | Ignored |
| `created_at`, `updated_at` | set by this project | Not copied |

Type rules, applied per row before anything is written:
- Valid names come from `creator_types` (13 rows). Lowercase "lava" → "Lava".
- Any value that doesn't match: the **whole row is held back** and listed in the report. No guessing, no partial writes.
- Slot order kept as on Live. No re-sorting.
- Gaps, duplicates or more than 4 values: held back and reported (Live says there are none; this is a guard).
- No self-guesses imported. `source` is never `self_selected`.

## 2. Official flag, profiled_by, profiled_at

- `source`: `case_study` when Live `profiling_data->>'source' = 'case_study'`, otherwise `practitioner`. Both count as official everywhere here.
- `profiled_by`: Live assigner id → assigner's email on Live → this project's account with that email.
  - Live empty (the 3 profiles with no assigner): write NULL. Still official.
  - Live has an assigner who has no account here: write NULL, keep their Live email in `profiling_data.live_profiled_by_email`, and list them in the report. (A foreign key to accounts means an unknown id can't be written.)
- `profiled_at`: copied from Live. If Live is empty, left NULL (not set to import time), and reported.

## 3. Case Study Choice gate

This project has no stored Case Study Choice column. The `choice_key` per member comes in with the import input (Live export, matched by email).

| `choice_key` | Creator Types |
|---|---|
| `keep_all` | Imported |
| `keep_account` (keep account, delete photos) | Imported |
| `delete_all` | **Not imported**. If a row already exists here from an earlier run, it is reported, not silently deleted (you decide) |
| no answer | Not imported. Flagged in the report |
| any other value | Not imported. Flagged |

## 4. Idempotent, never overwrites newer official work

One upsert per member on the existing unique `user_id`, with these rules:

| Existing row here | Action |
|---|---|
| None | Insert |
| Earlier import (`profiling_data.imported_from_live = true`) and no change since | Update with Live values (same values → no change) |
| `self_selected` | Replace with the official Live row (the official result wins, as on the dashboard) |
| Official row made **here** (`practitioner`/`case_study` without the import marker) | **Leave alone**. Report as "kept local profile" |

Running it twice gives the same row count and no changes on the second run. The run is a dry run first: it prints the report without writing, then writes only after you approve that report.

## 5. Checks after import (read-only report)

- Counts: Live profiles, matched by email, imported, held back (bad type), skipped (`delete_all`), flagged (no answer), kept local profile, no account here.
- Counts by `source` (`practitioner` / `case_study`) and by `choice_key`.
- Every type value is one of the 13 names, exact Title Case. Zero lowercase values left.
- Slot order equals Live for every imported row (row-by-row compare).
- No gaps, no duplicates, max 4 per row.
- Nobody with `delete_all` has a Creator Type row.
- `profiled_by` NULL list (expect the 3, plus any assigner without an account here).
- Second run reports 0 inserts, 0 updates.

## 6. Database structure changes

None required. Columns, the unique key, the `source` check and the foreign keys already support this.

Optional, only if you want it: change the `source` default from `'practitioner'` to no default, so a future write that forgets `source` fails instead of quietly marking a guess as official. That is a structure change and would need its own approval.

## Technical details

- Delivered as a staff-only server function (admin role checked) taking a Live export (rows plus emails plus `choice_key`) with a `dry_run` flag. Uses the service role, so the member lock trigger doesn't block it.
- The existing match-score recompute trigger runs on each write; expected and harmless.
- An `AGENTS.md` rule will record: imported Creator Types always set `source` explicitly and map people by email.
