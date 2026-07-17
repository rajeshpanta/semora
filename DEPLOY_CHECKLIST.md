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

## 2. Edge functions
```
supabase functions deploy parse-syllabus                 # Wave 1 changes (quota fix, multi-page, dateless)
supabase functions deploy tutor-chat
supabase functions deploy share-course
supabase functions deploy redeem-referral
supabase functions deploy send-push --no-verify-jwt      # MUST use the flag (shared-secret auth, not JWT)
supabase functions deploy google-cal-sync                # only needed when you enable Google Cal (see §5)
```

## 3. Secrets
```
supabase secrets set PUSH_SEND_SECRET=<long-random-value>
# optional Wave-1 cost guard (defaults to 1500/24h if unset):
supabase secrets set GLOBAL_DAILY_CAP=1500
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
