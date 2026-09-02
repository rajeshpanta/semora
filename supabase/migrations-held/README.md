# Held migrations — written, reviewed, deliberately NOT applied

Nothing in this folder is pending. `supabase db push` cannot see it, which is
the entire point: a migration parked here goes out when someone **moves it
back**, never as a side effect of a routine push.

That is not a hypothetical risk. Between 2026-09-01 and 2026-09-02, eight
migrations (109–116) were applied to production, and every one of those pushes
would have carried 108 along with it — `db push` applies everything pending,
and 108 was the only thing pending. It survived eight times because someone
remembered to lift it out of the folder first and put it back afterwards.

A rule that depends on remembering is a rule that eventually gets forgotten.
This folder is that rule made structural.

## What is in here

### `108_lms_pending_courses_push.sql`

The second half of the Canvas held-back-courses work: an hourly job that pushes
**"Canvas has classes waiting"** to students whose Canvas connection is quietly
withholding a semester.

- **The first half already shipped** (`f4a2b72`) — the banner on Today. For any
  student who opens the app, that is the better surface: it reaches everyone,
  needs no permission, cannot arrive at 3am, and gets answered rather than
  dismissed.
- **This half is for the students the banner cannot reach** — the ones who have
  drifted away and are not opening the app at all. It excludes anyone active in
  the last 3 days precisely so the two never overlap.
- **Why it is held:** it is an unprompted push to someone who has already
  drifted, which is worth being deliberate about. Revisit **on or after
  2026-09-09**.
- **Scale as of 2026-09-02:** 13 students, 23 courses being withheld.

The app is already correct without it. `app/settings/notifications.tsx:83`
treats the preference as `false` while the column does not exist, so the
Notifications screen renders fine and nothing errors.

## To apply one

```bash
git mv supabase/migrations-held/108_lms_pending_courses_push.sql supabase/migrations/
supabase migration list --linked     # confirm it is the ONLY thing pending
supabase db push --linked
```

Applying out of order is fine here — 109–116 are already applied and none of
them touch anything 108 creates. The CLI compares versions rather than
requiring a contiguous run.

## To park a new one

Move it here and add a section above saying **what it does, why it is waiting,
and what would have to be true to apply it**. A file sitting here with no
explanation is worse than one in the normal folder: the next person cannot tell
whether it is deliberate or abandoned.
