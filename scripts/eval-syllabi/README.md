# Golden-syllabus extraction eval

The only way Semora can honestly claim an extraction-accuracy number. Runs a
set of fixture syllabi (PDF/PNG/JPG) through the **deployed** `parse-syllabus`
edge function — the exact request the app makes (`{ base64, mimeType }` +
`Authorization: Bearer <user JWT>`, see `lib/gemini.ts`) — and scores the
extraction against handwritten `*.expected.json` ground truth.

```
scripts/eval-syllabi/
  run.js                       the eval runner (plain Node, zero npm deps)
  gen-fixture.js               renders the 3 synthetic fixture HTMLs to PDF
  fixtures/
    NAME.pdf|png|jpg           the document sent to the edge function
    NAME.expected.json         handwritten ground truth for NAME
    html/                      generated HTML sources (synthetic fixtures)
```

## ⚠️ Every run consumes real scan quota

Each fixture burns **one real Gemini call**, counted against the signed-in
account's **rolling 24-hour server cap of 20 scans/day** (`DAILY_CAP` in
`supabase/functions/parse-syllabus/index.ts`). A 20-fixture run consumes an
entire day of quota, and it shares the production Gemini API key with real
users.

**Use a dedicated Pro test account.** Free accounts are hard-capped at
2 lifetime scans server-side (you'll get a 402 on the third fixture), and you
don't want eval runs eating your personal account's daily cap. Create a
throwaway email account in the app, then grant it Pro via the `entitlements`
table (or a sandbox purchase).

## 1. Get an `EVAL_JWT`

The runner authenticates like the app: a Supabase **user access token**
(expires after ~1 hour — mint a fresh one per session).

**Option A — curl the auth endpoint** (from the repo root; email/password
account):

```sh
export SUPABASE_URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
ANON_KEY=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)

export EVAL_JWT=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"eval-account@example.com","password":"..."}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.access_token){console.error(j);process.exit(1)}console.log(j.access_token)})')
```

**Option B — supabase-js one-liner** (uses the app's own `node_modules`, run
from the repo root):

```sh
export EVAL_JWT=$(node -e '
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp("^" + k + "=(.+)$", "m"))[1].trim();
createClient(get("EXPO_PUBLIC_SUPABASE_URL"), get("EXPO_PUBLIC_SUPABASE_ANON_KEY"))
  .auth.signInWithPassword({ email: "eval-account@example.com", password: "..." })
  .then(({ data, error }) => {
    if (error) { console.error(error.message); process.exit(1); }
    console.log(data.session.access_token);
  });')
```

**Option C — pull from a debug build:** run the app in dev, sign in as the
test account, and log `(await supabase.auth.getSession()).data.session.access_token`
anywhere (e.g. a temporary `console.log` in `lib/gemini.ts`). Works for
Google/Apple-SSO test accounts that have no password.

## 2. Generate the synthetic fixture PDFs

```sh
node scripts/eval-syllabi/gen-fixture.js
```

Requires Chrome (or set `CHROME_PATH`). Produces three deliberately
different document shapes:

| fixture | shape | what it stresses |
|---|---|---|
| `cs-table` | grading-weight table + 16-week schedule table | table parsing, per-item weights, meetings/lab/office hours, grade scale |
| `humanities-prose` | dates written inline in sentences | prose date extraction, and a **"Final essay: date TBA"** dateless item that must come back with `due_date: null` (new edge-function behavior) |
| `recycled-fall2025` | all dates are Fall 2025 — in the past | date-plausibility: the extractor must return the literal document dates and flag them `date_suspect` (new behavior), not silently rewrite the year |

If you edit a fixture HTML, keep weekday names consistent with the dates —
`gen-fixture.js` has a note about this — and update the `.expected.json`.

## 3. Run the eval

```sh
EVAL_JWT=... node scripts/eval-syllabi/run.js
```

`SUPABASE_URL` is read from the env or falls back to
`EXPO_PUBLIC_SUPABASE_URL` in `.env.local`. Flags:

| flag | default | meaning |
|---|---|---|
| `--only cs-table,humanities-prose` | all | run a subset |
| `--delay <ms>` | 2500 | pause between fixtures (be nice to the shared Gemini key) |
| `--min-recall <0..1>` | 0.9 | aggregate item-recall gate |
| `--min-date-acc <0..1>` | 0.9 | aggregate due-date accuracy gate |
| `--date-tolerance <days>` | 0 | slack when comparing due dates |
| `--json <path>` | — | also write machine-readable results |
| `--self-test` | — | test the scorer offline (no network, **no quota**) |

Fixtures run **sequentially** with a delay by design; don't parallelize.

Exit codes: `0` = thresholds met, `1` = recall or date accuracy below
threshold or any fixture errored, `2` = configuration/usage error. Run `--self-test` after touching
any scoring code.

## 4. What the scores mean

Items are matched expected↔extracted by **fuzzy title** (max of normalized
Levenshtein and token-set Dice, vendored in `run.js`) plus **due-date
proximity**, greedy best-score-first, one-to-one. A dateless expected item
(`due_date: null`) only matches an extracted item that also has a null date.

- **item recall** — matched / expected. *The headline number: what fraction of
  real deadlines the scanner found.* Gated by `--min-recall`.
- **item precision** — matched / extracted. Low precision = hallucinated or
  duplicated items.
- **due-date accuracy** — correct dates / **all expected items** (an item the
  scanner missed entirely counts as a date miss — matched-only accuracy would
  reward dropping hard items). Gated by `--min-date-acc`.
- **title / type / weight / due_time accuracy** — per-field, over matched
  pairs only. Fields you omit from an expected item are skipped, not failed.
- **date_suspect flags** — checked only when the server response carries the
  field (new deployments); reported as *skipped* against an old deployment so
  both server versions score identically on everything else.
- **course/semester/meeting checks** — course name/code, instructor, semester
  name/dates, meeting blocks (day-set + times, `:00` seconds tolerated),
  office hours, grade scale. Informational — they don't gate the exit code.

A fixture that errors (HTTP failure, or the server answering `NOT_SYLLABUS`
to a real syllabus) scores **zero recall for all its expected items** — a
failed scan is the worst extraction. 401/402/429 abort the whole run
immediately so the remaining quota isn't wasted on a bad token or exhausted
account.

## 5. Adding real syllabi (the goal: ~20)

Three synthetic fixtures prove the harness works; only **real syllabi** make
the accuracy number honest. Collect ~20 spanning: scanned phone photos,
multi-column layouts, department templates, prose-heavy humanities courses,
lab courses, quarters vs semesters, international date formats.

1. Name real fixtures `real-*` (e.g. `real-uw-chem142.pdf`) — that prefix is
   **gitignored** so student/instructor PII never lands in the repo. Scrub
   anything sensitive regardless.
2. Handwrite `real-uw-chem142.expected.json` from the document itself (not
   from what the scanner returns! that would grade the model against its own
   answers). Schema — every top-level key is optional; only what you include
   gets scored:

```jsonc
{
  "course_name": "CHEM 142 - General Chemistry",  // fuzzy-matched
  "course_code": "CHEM 142",                      // whitespace/case-insensitive
  "instructor": "Dr. Jane Doe",                   // honorifics ignored
  "semester_name": "Fall 2026",
  "semester_start": "2026-09-30",                 // exact YYYY-MM-DD
  "semester_end": "2026-12-11",
  "meetings": [                                    // day-set + times must match
    { "days_of_week": [1,3,5], "start_time": "10:00", "end_time": "10:50", "kind": "lecture" }
  ],
  "office_hours_blocks": [ { "days_of_week": [2], "start_time": "14:00", "end_time": "15:00" } ],
  "grade_scale": [ { "letter": "A", "min": 93 } ],
  "items": [
    {
      "title": "Homework 1",            // required — fuzzy-matched
      "type": "assignment",             // string, or array when ambiguous: ["assignment","exam"]
      "due_date": "2026-10-09",         // or null for a stated-but-undated item ("date TBA")
      "due_time": "23:59",              // optional — only scored if present
      "weight": 5,                      // optional — % of grade, or null
      "date_suspect": true              // optional — expect the server to flag this date implausible
    }
  ]
  // "expect_not_syllabus": true        // negative fixture (receipt, menu…):
  //                                    // PASSES iff the server answers NOT_SYLLABUS
}
```

3. Spot-run just the new fixture without burning the rest of the quota:

```sh
EVAL_JWT=... node scripts/eval-syllabi/run.js --only real-uw-chem142
```

Rules of thumb for ground truth: include every graded deadline a diligent
student would put in a planner; skip ungraded/undated boilerplate
(participation, "readings due weekly"); when the document is genuinely
ambiguous about type, use an array; when a date exists only as "TBA", include
the item with `due_date: null` — the new edge function returns such items and
losing them silently would hide a real product regression.
