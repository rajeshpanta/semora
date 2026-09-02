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
supabase functions deploy lecture-transcribe             # 065 — lecture recording pipeline
supabase functions deploy lecture-study-kit --no-verify-jwt  # MUST use the flag — see the note below
supabase functions deploy lecture-retention --no-verify-jwt   # 117 — MUST use the flag (shared-secret auth, not JWT)
supabase functions deploy generate-flashcards            # 065 — per-note context cap fix
# 065-067 migrations MUST be applied before deploying lecture-transcribe:
# it calls reserve_lecture_for_recording / release_lecture_reservation.
```

### lecture-study-kit and `--no-verify-jwt`: same trap, second door

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
