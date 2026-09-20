# Moodle calendar fixtures

Captured and written 2026-09-19 for MOODLE_PLAN.md Phase 0. Every answer below
was read from a live Moodle or from Moodle's own source, never from memory.

## Where the real captures came from

`school.moodledemo.net` — Mount Orange School, Moodle **5.0** (PRODID version
`2026042000`), signed in as the demo student (`student` / `moodle26`; the
password is printed on that site's own login page and rotates, it is **not**
`moodle` as older write-ups say). The site resets on a schedule, so these files
are the record — do not expect to reproduce them byte for byte.

**No live credential is in this directory.** The `.ics` bodies never contain the
token; it lives only in the URL, which was never written to the repo. The CI
gate is `grep -rE 'authtoken=[0-9a-f]{40}' supabase/functions/_shared/fixtures`
and it must match nothing but zeros.

| file | real or synthetic | what it is for |
|---|---|---|
| `courses-custom.ics` | **real** | `preset_what=courses&preset_time=custom`, 2 events |
| `all-custom.ics` | **real** | `preset_what=all&preset_time=custom`, 2 events — identical to the above but for `DTSTAMP` |
| `courses-recentupcoming.ics` | **real** | 0 events: this site's dated work is all >60 days out |
| `all-recentupcoming.ics` | **real** | 0 events, same reason |
| `weeknow-default.ics` | **real** | both preset parameters omitted → `weeknow` → 0 events |
| `invalid-auth.txt` | **real** | the body a bad token gets |
| `waf-challenge.html` | **real** | `clase.moodlecloud.com` 403 to a non-browser user agent |
| `public-config.json` | **real** | `tool_mobile_get_public_config`, no token, 40 fields |
| `rich-courses.ics` / `rich-all.ics` | synthetic | every scenario, in the byte shape the real captures prove |
| `subdir-install.ics` | synthetic | a UID whose host carries a path |
| `pre33-quiz.ics` | synthetic | a pre-3.3 quiz: one event, no suffix, `DTSTART` ≠ `DTEND` |
| `no-export.txt` | synthetic | the body when an admin turned calendar export off |

The synthetic files exist because Phase 0.2 — a seeded Moodle under our own
control — could not be done on this machine: **Docker and PHP are not
installed.** Their byte shape is copied exactly from the real captures, and
every scenario in them is derived from source that is cited below. They are the
weakest link in the fixture set and should be replaced by captures from a real
seeded site when one exists.

## The URL

```
https://<wwwroot>/calendar/export_execute.php
    ?userid=<id>&authtoken=<40 hex>&preset_what=all&preset_time=custom
```

Confirmed live. `<wwwroot>` may carry a path. The student reaches it with
**Calendar → Import or export calendars → Export calendar → Get calendar URL →
Copy URL**.

The POST field names on that form are `events[exportevents]` and
`period[timeperiod]`, with submit buttons named `generateurl` ("Get calendar
URL") and `export` ("Export", which **downloads a file** — the trap in the
student flow). Read from the live form, not from the plan's earlier guess of
`exportevents` / `timeperiod`.

## Answers to Phase 0.4

**(a) The rewritten presets still authenticate.** The token is
`sha1(userid . password-hash . calendar_exportsalt)` (`calendar/lib.php:4016`)
and signs nothing from the query string. Confirmed live: the same token was used
with four different `preset_what`/`preset_time` pairs and all four returned 200
`text/calendar`.

**(b) `DTSTART` and `DTEND` are UTC `Z` and equal for a due instant.**
`all-custom.ics`: `DTSTART:20261222T230000Z` / `DTEND:20261222T230000Z`. Source:
`export_execute.php:262-264`, duration 0 means an instant.

**(c) UID = `<event id>@<wwwroot minus scheme>`.** `all-custom.ics`:
`UID:449@school.moodledemo.net`. A sub-directory install therefore yields
`123@school.edu/moodle` — see `subdir-install.ics`. Any host assertion must
accept a path.

**(d) `CATEGORIES` is the course shortname, and absent when `courseid = 0`.**
`all-custom.ics` carries `CATEGORIES:Celebrating Cultures` and
`CATEGORIES:Cross-cultural Communication`. Source: `export_execute.php:270-272`
guards the property with `if ($event->courseid != 0)`.

**(e) There is no `URL` property.** Confirmed in both real captures — the full
property list is UID, SUMMARY, DESCRIPTION, CLASS, LAST-MODIFIED, DTSTAMP,
DTSTART, DTEND, CATEGORIES. This is the single defect that would make the
shared Canvas parser return zero events for Moodle
(`canvas-calendar.ts:287` requires a `URL`).

**(f) Event names are generated, not hand-copied** — see
`scripts/moodle-event-names.mjs` and
`supabase/functions/_shared/moodle-event-names.ts` (296 patterns, 12 languages).

The finding that forced a script: **the placeholder is not always at the
start.** English `assign/calendardue` is `{$a} is due`; Spanish is
`Vencimiento de {$a}`. 27 of the 296 patterns have a non-empty prefix. A parser
that only strips suffixes fails at every school whose teachers work in one of
those languages. Names are written with `get_string()` when **the teacher**
saves the activity (`mod/assign/locallib.php` `update_calendar`), so the
language is the teacher's — not the site's and not the student's.

**(g) The override rule — CONFIRMED by reading.** Under `preset_what=courses`
the retrieval filter is `(e.groupid = 0 AND e.courseid IN …)`, so only base
events with base dates appear. Under `preset_what=all` the user override
(`courseid 0`, `userid = student`, `priority = 0`) and the group override
(`courseid = course`, `groupid ≠ 0`, `priority = sortorder`) join the union, and
the `MIN(priority)` subquery with the join
`(e.priority = fe.priority OR (e.priority IS NULL AND fe.priority IS NULL))`
suppresses the base, whose priority is `NULL`
(`calendar/classes/local/event/strategies/raw_event_retrieval_strategy.php:246-264`).

Exact shapes from `mod/assign/lib.php:288-345`:

```php
$event->courseid = ($userid) ? 0 : $assigninstance->course;
$event->name     = $eventname . ' (' . get_string('duedate','assign') . ')';
// user  override: overrideusereventname  = '{$a->assign} - Override'  , priority 0
// group override: overridegroupeventname = '{$a->assign} - {$a->group}', priority sortorder
```

So a **user** override has no `CATEGORIES` and a **group** override has the
course's. Both are named `<activity> - <something> (<Due date>)`, and both the
separator word and the parenthetical are localised — which is why the parser
matches on `startsWith(baseName + ' - ')` rather than on the word "Override".
Fixtures: `rich-all.ics` events 2002 (user, no category) and 3002 (group, with
category); their bases 2001 and 3001 appear only in `rich-courses.ics`.

**(h) An absent `preset_time` means `weeknow`, an absent `preset_what` means
`all`** (`export_execute.php:63-64`, `73`). Confirmed live:
`weeknow-default.ics` is 121 bytes with zero events, against 985 bytes and two
events for `custom` on the same account. A student who pastes a link generated
with "This week" selected would import seven days of deadlines — which is why
the fetcher rewrites both parameters.

**(i) Invisible things are absent.** `export_execute.php:227-230` skips any
module event whose `uservisible` is false, and `preset_what=courses` enumerates
`enrol_get_users_courses($user->id, true)` — **active enrolments only**. So a
restricted activity, a course hidden from students, and a course whose
enrolment has ended are all absent, as is any undated assignment (no event is
ever created). The real captures cannot demonstrate this; the plan's copy must
name it regardless.

**(j) Failures are HTTP 200.** A bad token returns **200**, content-type
**`text/html; charset=utf-8`**, body `Invalid authentication`
(`invalid-auth.txt`, 22 bytes). Export disabled returns 200 and `no export`
(`export_execute.php:38-39`). **`export_execute.php` never emits 401, 403 or
404.** Every 4xx therefore comes from infrastructure — a WAF, an SSO gateway,
maintenance — and must not be treated as an expired link, or a transient block
would purge the student's credential. Classification keys on the body text and
never on the status or content type.

**(k) `LAST-MODIFIED` is on every event.** Confirmed in both real captures.

**(l)** Not applicable: no tunnelled host exists (see 0.2 above).

**(m) The site-events pseudo-course appears only under `preset_what=all`**
(`export_execute.php:106-110`), with the localised `calendar/siteevents`
shortname. All twelve localisations are in `MOODLE_SITE_EVENT_NAMES`: "Site
events", "Eventos Globales", "Événements de site", "Website-Termine", "Eventi
del sito", "Eventos de site", "Eventos do sitio", "Esdeveniments del lloc",
"Guneko ekitaldiak", "Site-gebeurtenissen", "Wydarzenia strony", "Site olayları".
Fixture: `rich-all.ics` event 5001.

**(n) A pre-3.3 quiz is one event with no suffix and `DTSTART` ≠ `DTEND`.**
Before MDL-58082 a quiz had a single event spanning open to close. ~10 % of
registered sites are still ≤3.11. Fixture: `pre33-quiz.ics`. The parser takes
`DTEND` as the due when an event has a duration and no recognised name pattern.

**(o) An extension DOES produce a calendar event.** This corrects both the
first version of this plan and the verification pass, which said it did not.
`mod/assign/locallib.php:7034-7062`, inside `save_user_extension`:

```php
$event->name      = get_string('calendarextension', 'assign', $instance->name);
$event->courseid  = 0;        // → no CATEGORIES
$event->userid    = $userid;  // → a user event, so preset_what=all only
$event->eventtype = ASSIGN_EVENT_TYPE_EXTENSION;
$event->priority  = null;     // → does NOT suppress the base
```

English `calendarextension` is `{$a} is due (extension)`; Spanish is
`{$a} ha vencido (extensión)`. Because its priority is `NULL` and the base's is
too, **both survive** the `MIN(priority)` join — unlike an override. So the
student's real date is in the feed and a parser that drops every event without
`CATEGORIES` would throw it away. Fixture: `rich-all.ics` events 2003 (base,
survives) and 2004 (extension, no category).

## Format details the parser depends on

Moodle's Bennu serialiser writes **bare LF**, not CRLF, and folds long lines
with a **TAB**, not a space. Verified on the real captures: 0 CRLF pairs, 33
LF, 6 continuation lines starting with a tab. The shared `unfoldIcs`
(`canvas-calendar.ts:99-106`) already handles `\n[ \t]` and normalises CRLF, so
it reuses unchanged.

`Content-Disposition: attachment; filename=icalexport.ics` is always sent, and
`$limitnum = 0` (`export_execute.php:130`) — Moodle imposes no event cap, so
Semora's 5 MB body cap is the only ceiling.

## What `rich-courses.ics` / `rich-all.ics` cover

| event | in `courses` | in `all` | what it tests |
|---|---|---|---|
| 1001 Problem Set 3 **is due** | yes | yes | plain due; suffix stripped |
| 1002 Midterm Quiz **opens** | yes | yes | skipped, not work due |
| 1003 Midterm Quiz **closes** | yes | yes | due; typed `exam` (shared classify ranks midterm above quiz) |
| 1004 Problem Set 3 **is due to be graded** | yes | yes | skipped, longest-match beats "is due" |
| 8001 Weekly reflection **should be completed** | yes | yes | soft target, typed other |
| 2001 Essay 1 is due | yes | **no** | base suppressed by a user override |
| 2002 Essay 1 **- Override (Due date)** | no | yes, **no category** | the student's real date, applied to 2001 |
| 2003 Reading Journal is due | yes | yes | base survives an extension |
| 2004 Reading Journal is due **(extension)** | no | yes, **no category** | the student's real date, applied to 2003 |
| 3001 Lab Report is due | yes | **no** | base suppressed by a group override |
| 3002 Lab Report **- Section B (Due date)** | no | yes, **with category** | group override carries the course |
| 4001 **Vencimiento de** Ensayo Final | yes | yes | Spanish **prefix** stripping |
| 7001 Cancelled Seminar | yes (CANCELLED) | yes (CANCELLED) | dropped |
| 6001 Tutorial group meeting | **no** | yes, category `GRP300` | group-only course: kept, flagged |
| 5001 Winter break | no | yes, category `Site events` | site pseudo-course: dropped |
| 5002 Dentist | no | yes, **no category** | personal event: dropped |

Expected parse of the pair: **five** courses (PHYS101, HIST210, BIO150, ESP200,
GRP300 with GRP300 flagged `unmatched_category`), and these dues —
PS3 2026-09-25, Midterm Quiz 2026-10-01, Weekly reflection 2026-09-30,
Essay 1 **2026-10-17** (override), Reading Journal **2026-10-12** (extension),
Lab Report **2026-11-05** (group override), Ensayo Final 2026-12-01, Tutorial
group meeting 2026-10-20. Eight tasks from fourteen events.
