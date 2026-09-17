# Semora 1.4 — Deploy Checklist (command-center release)

This build (v1.4 / iOS build 19) adds the full "Semester Command Center" feature set
across four waves on branch `feature/command-center`. Everything below must be done for
the new features to work in production. The app **compiles and runs without these** (all
new surfaces degrade gracefully), so you can ship in stages.

## 1. Database migrations (apply in order)
```
supabase db push        # applies 021–028
```
- `021` gemini_call_log created_at index
- `022` gemini_call_log select-own RLS
- `023` push_tokens
- `024` decks + cards (flashcards)
- `025` tutor_conversations/messages, course_notes, tutor_usage, `course-notes` bucket, `try_consume_tutor_usage`
- `026` course_shares + `resolve_course_share` RPC
- `027` google_calendar_tokens + event map
- `028` referral_codes/redemptions/promo_grants + **`is_pro()` redefinition** (adds promo branch) + `try_redeem_referral`

> ⚠️ `028` redefines `is_pro()` — the function every Pro gate and scan-quota trigger uses.
> It preserves migration 009's entitlements logic verbatim and only OR-s in an active promo.
> Sanity-check `select is_pro('<a-pro-user-uuid>')` after applying.

## 1b. Typecheck before deploying (edge functions)

```bash
# Deno must NOT use this repo's node_modules. It exists for the React Native
# app, so Deno defaults to nodeModulesDir "manual" and then cannot resolve the
# npm: specifiers in validate-receipt (@peculiar/x509) and submit-support
# (nodemailer) — they look like type errors but are a resolution failure.
# --node-modules-dir=none makes Deno fetch and cache them itself.
#
# Do NOT "fix" this with a deno.json setting nodeModulesDir to "auto": that
# makes Deno REWRITE node_modules into .deno/ with symlinked packages, which
# breaks `expo export` (config-plugin loading fails on react-native-iap) and
# therefore breaks the web deploy. Recovering takes `rm -rf node_modules && npm ci`.
for d in supabase/functions/*/; do
  [ -f "$d/index.ts" ] && deno check --node-modules-dir=none --no-lock "$d/index.ts"
done

deno test --allow-env --no-lock supabase/functions/_shared/
npx tsc --noEmit          # the app
npm run build:web         # the web bundle, clean — this is what deploy:web runs
```

## 2. Edge functions
```
supabase functions deploy parse-syllabus                 # Wave 1 changes (quota fix, multi-page, dateless)
supabase functions deploy tutor-chat
supabase functions deploy share-course
supabase functions deploy redeem-referral
supabase functions deploy send-push --no-verify-jwt      # MUST use the flag (shared-secret auth, not JWT)
supabase functions deploy lms-sync --no-verify-jwt       # MUST use the flag — see the note below
supabase functions deploy google-cal-sync                # only needed when you enable Google Cal (see §5)
supabase functions deploy lecture-transcribe --no-verify-jwt # 065; MUST use the flag — since 139 the
                                                             # arrival job posts `recover` with only the
                                                             # cron secret (see the study-kit note below)
supabase functions deploy lecture-study-kit --no-verify-jwt  # MUST use the flag — see the note below
supabase functions deploy lecture-retention --no-verify-jwt   # 117 — MUST use the flag (shared-secret auth, not JWT)
supabase functions deploy generate-flashcards            # 065 — per-note context cap fix
# 065-067 migrations MUST be applied before deploying lecture-transcribe:
# it calls reserve_lecture_for_recording / release_lecture_reservation.
```

### lecture-study-kit and `--no-verify-jwt`: same trap, second door

**lecture-transcribe too.** Since 139 the every-minute `semora-lecture-arrivals`
job (`lecture_take_over_arrived_audio`) posts `{action:'recover'}` to
lecture-transcribe with only `x-semora-lecture-cron-secret`. Without the flag
the gateway answers 401 before the function runs, every stranded part keeps its
`dispatched_at` stamp and is re-dispatched every ten minutes into the same
wall, and the only signal is `alert_lecture_segments_stranded`. The function
authenticates both doors itself (`read_lecture_cron_secret()` for the
scheduler, `auth.getUser()` for students; the secret can only ever name a
segment, never a user). Post-deploy smoke test:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/lecture-transcribe" \
  -H 'Content-Type: application/json' -H 'x-semora-lecture-cron-secret: wrong' \
  -d '{"action":"recover","segmentId":"x"}'
# want the FUNCTION's own {"error":"Unauthorized scheduler"} (401);
# a gateway 401 mentioning a missing Authorization header means the flag was missed.
```

Since 109 the ten-minute `semora-finish-lecture-notes` job posts to this
function to write notes for lectures the app abandoned. Like the Canvas job, it
sends only its own header — `x-semora-lecture-cron-secret` — and no
`Authorization`, so **deploying without the flag makes the gateway reject every
unattended notes request** and students silently stop getting notes for any
lecture they did not sit and watch.

The flag is safe for the same reason it is safe on lms-sync: the function
authenticates itself on both paths. A scheduler request is checked against the
vault secret via `read_lecture_cron_secret()`, and every student request still
goes through `auth.getUser()` with a real Bearer token. The scheduler path can
only ever ask for `mode: 'notes'` on a lecture that is already `transcribed`,
and it never gets to say whose lecture it is — the owner is read off the row.

**Unlike lms-sync, this one reports itself.** `notes_auto_attempts` is stamped
on the lecture before each request is sent, so a rejected hop still counts. Two
or more lectures stuck at three attempts in a day raises a `lecture_notes_stuck`
row in `ops_alerts` (109). To check by hand:

```sql
select count(*) from public.lecture_recordings
where status = 'transcribed' and notes_md is null and notes_auto_attempts >= 3;
```

Zero is healthy. Anything above one, check `net._http_response` for a 401.

### lms-sync and `--no-verify-jwt`: how the cron died silently for 9 days

Deploying lms-sync WITHOUT the flag breaks background Canvas sync, and nothing
anywhere reports it. The pg_cron job (063) posts to the function with only
`x-semora-lms-cron-secret` and no `Authorization` header, because pg_net sends
exactly the headers it is given. With JWT verification on, the Supabase gateway
rejects that at the door — `401 UNAUTHORIZED_NO_AUTH_HEADER` — and the function
is never reached, so it cannot log the failure either.

**Why nobody noticed:** pg_cron records a run as `succeeded` when the SQL
statement ran. The statement is `select net.http_post(...)`, which succeeds by
queueing a request. What came back is irrelevant to it. So
`cron.job_run_details` showed 859 consecutive successes while every single one
of them was a 401.

The flag is safe because lms-sync authenticates itself on every path:
`action: 'background'` checks the vault cron secret via verifyCron(), and every
other action goes through requireUser(), which requires a Bearer token and
validates it with auth.getUser(). Gateway JWT verification adds nothing on top
and only blocks the scheduler.

**How to check it is actually working** (pg_net keeps ~6h of responses):

```sql
select status_code, left(content, 80), created
from net._http_response order by id desc limit 5;
```

Want `200 {"processed_connections":N,...}`. A 401 with
`UNAUTHORIZED_NO_AUTH_HEADER` means the flag was missed on the last deploy.

A run returning `processed_connections: 0` is a different, unrelated thing: no
connection is eligible. Eligibility needs `sync_enabled` AND
`background_sync_enabled` AND a row in `lms_sync_credentials`. The credential
can only be written by the app (the token lives in device SecureStore), so a
connection missing it CANNOT be fixed from the server — flipping the flag by
hand just makes every run fail with `credentials_required`. The student
reconnects from Settings; canvasOfferFor() already surfaces that as
"Finish Canvas setup".

## 3. Secrets
```
supabase secrets set PUSH_SEND_SECRET=<long-random-value>
# optional Wave-1 cost guard (defaults to 1500/24h if unset):
supabase secrets set GLOBAL_DAILY_CAP=1500

# REQUIRED for lecture recording (065). Without it lecture-transcribe returns
# 503 NOT_CONFIGURED and the app tells the user the feature is unavailable —
# it degrades cleanly, but nothing transcribes.
supabase secrets set GROQ_API_KEY=<key from console.groq.com>

# Global daily speech-to-text ceiling, in AUDIO SECONDS, shared by ALL users.
# The provider bills this quota per ORGANIZATION, so the free tier's 28,800/day
# is ~5 ninety-minute lectures for the entire app. Raise this after moving to a
# paid provider tier. Defaults to 25,000 if unset.
supabase secrets set LECTURE_DAILY_AUDIO_SECONDS=25000
```
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into edge functions — just confirm they resolve.
- **`BLOCK_SANDBOX_PRO` stays UNSET / false** — you test the paid tier via sandbox. (Deliberate; do not enable.)

## 4. Push notifications (re-engagement)
- Provide an **APNs key** to EAS: `eas credentials` (bundle `com.rajeshpanta.syllabussnap`, team `7T9897GFKH`).
- Build via EAS **production** profile so the binary gets `aps-environment: production`.
- Enable Postgres extensions: `create extension if not exists pg_cron; create extension if not exists pg_net;`
- Write the re-engagement cron job (NOT in repo — it needs your product judgment on *who* to nudge):
  a `cron.schedule(...)` that selects lapsed / new-semester user_ids and `net.http_post`s to the
  `send-push` function URL with header `Authorization: Bearer <PUSH_SEND_SECRET>` and body
  `{ user_ids, title, body }`. Store the secret in Supabase Vault, not inline.

## 5. Google Calendar sync (dark-launched — OFF by default)
- Currently `GOOGLE_CAL_ENABLED = false` in `lib/googleCalendar.ts`; the UI is hidden.
- Before enabling: the **sensitive `calendar.events` scope needs Google OAuth-consent-screen
  verification** in Google Cloud Console (a review process — start it early).
- Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` as Supabase secrets (server auth-code exchange).
- Then flip `GOOGLE_CAL_ENABLED = true` and ship a JS update.

## 6. Native rebuild (required — Wave 2 added native code)
```
npx expo prebuild --clean
eas build -p ios --profile production
```
Unlocks: the **"Due This Week" widget** (new Swift) and the **share-my-semester image**
(`react-native-view-shot`). Until a native build ships, the widget won't appear and the
share button shows an "update to share" message.

## 7. App Store submission
- `eas submit -p ios` (config already in `eas.json`).
- Privacy: `docs/privacy.html` updated (analytics, uploaded notes, push, referrals, Google Cal) —
  **re-check the App Store privacy "nutrition labels"** to match.
- **Screenshots**: regenerate to feature the Workload Dashboard (new hero) + study tools.
  `store-screenshots/gen.js` renders HTML→PNG; update the HTML to show the new screens.
- Paywall feature list already refreshed to describe the new Pro value.

## 8. Post-deploy smoke tests
- Scan a syllabus (quota counts correctly; recycled-date banner on an old PDF).
- Buy Pro in sandbox → dashboard/flashcards/tutor unlock.
- Redeem a referral link on a 2nd account → both get a promo month; relaunch → Pro persists (the §1 `is_pro` check).
- Share a course → open the link on another device/account (signed out → sign in → import resumes).
- Send a test push via `send-push` with the secret → device receives it.

## Accuracy eval (optional, ongoing)
`scripts/eval-syllabi/` replays golden syllabi through `parse-syllabus` and scores field
accuracy. Use a dedicated Pro test account (free accounts hit the 2-scan cap). Collect ~20 real
syllabi as `fixtures/real-*` before quoting any accuracy number publicly.

---

# Record Lecture completion (branch `lecture-recording-complete`, 2026-09-16)

**Status 2026-09-17: COMPLETE (owner sign-off).**
- Server: migrations 140, 142–148 applied; lecture-transcribe v29 and lecture-study-kit v24 deployed.
- App code: the final code (`c30a0d1`) is live over the air on every iOS runtime —
  `56f713eb` → 1.13/1.14 (`e88b9845…`), `caee0fd9` → 1.15 build 59 (`bdc3c682…`),
  `e06dd657` → 1.15 build 60 (`7491078…`).
- 1.15 is in App Review with build **59**, and the owner chose to let it ship. Build 60's native
  fixes (the lock screen no longer shows a running clock after the app dies, `getStatus.active`,
  Android auto-recovery) ship as **1.15.1**. That needs a fresh build: build 60 belongs to the
  1.15 train and cannot be attached to 1.15.1. Changing only the version keeps runtime `7491078…`.
- Proven in production: two ~56-minute lectures recorded with the phone locked, nothing missing,
  notes not cut off.
- Built and unit-tested but not run on a physical device (they need Pro on a test account): the
  lock-screen Pause/Mark/Stop buttons, a phone call mid-lecture, and stopping while offline.
- Groq stays on the free tier (owner decision); revisit only if the logs show the daily quota hit.
- Left after release: `LECTURE_MIN_VERSION`/`LECTURE_MIN_BUILD` once 1.15 is live (R3), and an
  Android build containing the native recorder (Record stays hidden on Android until then).

Plan: `docs/audits/record-lecture-report-and-plan-2026-09-16.md`. Every step
below needs the owner's explicit yes, one step at a time.

## R1. Migrations — in this order
```
140_…                                   # already in the folder; must go first
142_a_part_is_never_lost_to_a_busy_provider.sql
143_a_finished_lecture_says_what_it_has.sql
144_lecture_health_is_watched.sql       # adds the hourly semora-lecture-health cron
145_a_lecture_remembers_its_moments.sql # timings + Mark important (additive, nullable)
```
- `141` is parked in `supabase/migrations-held/` and must NOT be applied (143 supersedes it).
- Before `db push`: `supabase migration list --linked` must show exactly 140, 142–145 pending.
- Tests (throwaway Postgres only): `supabase/tests/lecture/harness.sql` then 142/143/144/145 `.test.sql`.
  Every migration was also run twice to prove it is idempotent.
- **147 (2026-09-16, after 140–146 went live):** `147_the_server_side_of_the_audit.sql` — part
  numbers to 999, declared counts only grow, transcribed audio deleted while a lecture is live,
  the arrival job's circuit breaker, the 12-hour quota-hold bound and the 30-minute NO_AUDIO rule
  in the sweep, ordered alert fingerprints, and `semora-finish-lecture-notes` every 2 minutes.
  Test: `supabase/tests/lecture/147.test.sql` after 140, 142–147 (run 147 twice — idempotent).
  Check after applying: `select schedule from cron.job where jobname = 'semora-finish-lecture-notes';`
  → `*/2 * * * *`.
- After applying, sanity checks (read-only):
  ```sql
  select has_function_privilege('anon', 'public.sweep_stalled_lectures(integer)', 'execute');   -- false
  select jobname, schedule from cron.job where jobname = 'semora-lecture-health';               -- '17 * * * *'
  ```
- A document note must still be creatable from the app (142 names its NOT NULL columns in the insert guard).

- 142 adds an INSERT trigger limiting part numbers to 0–999 (existing rows untouched and still updatable).

## R2. Edge functions — after the migrations
```
supabase functions deploy lecture-transcribe --no-verify-jwt   # the arrival job's `recover` carries
                                                               # only the cron secret (see §2 note)
supabase functions deploy lecture-study-kit --no-verify-jwt
```
(`lecture-retention` has no code change: its new rules live in 142's SQL. No redeploy.)
Order matters: `lecture-transcribe` calls `lecture_charge_usage`, `lecture_count_transcription`
and `lecture_assemble_transcript`, and writes `timings`; `lecture-study-kit` reads
`lecture_note_sections` and `important_marks`. Deploying either before the migrations breaks recording.

Behaviour changes to expect after deploy:
- Transcripts over 30,000 characters (about 45+ minutes) are written section by section: 2–4 model
  calls plus an overview instead of one, over 2–3 back-to-back runs. A rewrite of an existing
  lecture in that range switches to the sectioned layout and marks its quiz as out of date.
- A rate-limited part waits up to 12 hours for the provider. Past that the lecture is finished from
  the parts it has (parts missing, partial notes now) and the part keeps being retried by the
  arrival job; a late success is folded in. A spent DAILY provider quota is worded as such to the
  student (`PROVIDER_QUOTA_DAY`), and a 429 on transcription is no longer retried inside one call.
- The arrival job dispatches one probe part per minute while the provider is failing half of recent
  requests. Every 4th part of a language-locked lecture is sent without the lock; two parts heard in
  another language make it `mixed`. Quizzes follow the notes' language. A recording still named
  "<Course> · Tue, Sep 16" / "Lecture" is renamed after its notes' headline.

## R3. Secrets (all optional; unset = the safe default)
```
# Longest recording, seconds (default 5400 = 90 min; max 14400). Raise to 10800 only
# together with the paid Groq tier (D1) and a higher LECTURE_DAILY_AUDIO_SECONDS,
# because every start reserves this much of the shared daily pool.
supabase secrets set LECTURE_MAX_SECONDS=10800
supabase secrets set LECTURE_DAILY_AUDIO_SECONDS=...

# Update gate (D3). Set ONLY after 1.15 is live in the App Store and Play.
supabase secrets set LECTURE_MIN_VERSION=1.15
supabase secrets set LECTURE_MIN_BUILD=<first 1.15 iOS build number>

# Kill switches (plan Phase 5). "off" restores the old behaviour, no app release.
supabase secrets set LECTURE_SILENCE_FILTER=off
supabase secrets set LECTURE_AUTO_LANGUAGE=off
supabase secrets set LECTURE_COURSE_VOCABULARY=off
supabase secrets set LECTURE_BACKGROUND_UPLOADS=off
supabase secrets set LECTURE_SECTIONED_NOTES=off

# Feature kill switches (147, audit). For a provider outage, a billing incident or a bad build.
# Unset (or anything but "off") = on. Secrets take effect on the next cold start of the function.
supabase secrets set LECTURE_RECORDING=off   # `start` answers the localized "not available right now"
                                             # 503 (NOT_CONFIGURED) before any reservation or mic;
                                             # lectures already under way keep uploading/transcribing
supabase secrets set LECTURE_RECOVERY=off    # the arrival job's `recover` calls answer
                                             # {ok:true,status:'paused'}: no attempt spent or refunded,
                                             # nothing written off, parts wait where they are
supabase secrets set LECTURE_NOTES=off       # lecture-study-kit `notes` (app and scheduler) answers
                                             # the transient 503 without claiming the lecture or
                                             # calling the model; quizzes unaffected
# After lifting LECTURE_NOTES=off: the scheduler stamps notes_auto_attempts BEFORE each request it
# sends, so lectures that waited through a long switch-off may be at 3 and no longer asked for:
#   update lecture_recordings set notes_auto_attempts = 0
#   where status = 'transcribed' and notes_md is null and notes_auto_attempts >= 3;
```
When `LECTURE_MAX_SECONDS` is raised, also pass the new limit (minutes) to the sweep's cron
command: `perform public.sweep_stalled_lectures(180);`, and the health check's hourly/daily
caps if the Groq tier changed: `select public.lecture_health_check(<hour cap>, <day cap>);`.

## R4. App
- **OTA fingerprint trap (found 2026-09-16):** `eas fingerprint:compare <live runtime hash>` in the
  publish tree must say MATCHES. The main tree's `node_modules/react-native-iap` had Android build
  output and a vim swap file inside it, which changed the fingerprint; restoring the pristine
  package (`npm pack react-native-iap@<locked version>` → rsync into the publish tree's
  node_modules) restored the live hash `e88b9845…`.
- **OTA to 1.13/1.14 (JS only):** must be published from a tree WITHOUT `modules/semora-recorder`,
  the `targets/widget/LectureRecordingActivity.swift` change and the `NSSupportsLiveActivities`
  app.json key — those change the runtime fingerprint. Checkpoint patch
  `03-phase2-ota-candidate` is that tree; verify `npx expo-updates fingerprint` matches the live
  runtime before publishing. Without the native module the app uses the expo-audio engine.
- **1.15 build (App Store + Play):** includes the native recorder, the Live Activity, and the
  Android foreground service. `--clean` prebuild. Android Record stays hidden unless the build
  contains the native module.
- Physical-device matrix: plan Phase 3.8 (locked 3 h, calls, Siri, AirPods, kill mid-chunk,
  offline, Live Activity Stop/Pause/Mark, Android 12/14/15 screen-off).
