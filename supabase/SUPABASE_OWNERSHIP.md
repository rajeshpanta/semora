# Supabase Ownership Map — READ BEFORE CHANGING ANYTHING

This Supabase project (`usglgeosqhtxbyxsugre`) is **SHARED by two separate apps**:

- **Semora** (this repo) — AI syllabus scanner
- **Citizen** — whisper / voice app (separate codebase)

A change to the wrong app's objects can break the other app. **Every table is also
tagged in the database via `COMMENT ON TABLE`** (visible in the Supabase dashboard
Table Editor). Before any `DROP` / `ALTER` / `DELETE` / `TRUNCATE`, confirm the
object belongs to the app you're working on.

## Tables

### 🟦 SEMORA (this app) — safe to manage from this repo
`tasks`, `courses`, `semesters`, `course_meetings`, `course_office_hours`,
`profiles`, `syllabus_uploads`, `parse_runs`, `gemini_call_log`, `entitlements`,
`consumed_transactions`, `receipt_validation_log`,
`push_tokens` (023),
`decks`, `cards` (024, flashcards),
`tutor_conversations`, `tutor_messages`, `course_notes`, `tutor_usage` (025, AI tutor),
`course_shares` (026, share-a-course),
`google_calendar_tokens`, `google_calendar_event_map` (027, Google Calendar sync),
`referral_codes`, `referral_redemptions`, `promo_grants` (028, referrals),
`grade_categories`, `study_blocks` (029–036),
`lms_connections`, `lms_course_links`, `course_collaborations`,
`course_collaboration_members`, `course_collaboration_invites`,
`shared_deadlines`, `group_assignments` (037–039, connected learning platform)

### 🟩 CITIZEN (other app) — DO NOT TOUCH from Semora
`whisper_usage` — whisper/voice usage + rate-limit log (`client_id`-based, anonymous,
no `user_id`). RLS enabled with no client policies → written server-side only.

### 🟨 SHARED — both apps write here
`analytics_events` — every row carries an **`app_name`** column (`'semora'` | `'citizen'`).
- Always **filter by `app_name`** when reading.
- **NEVER `DELETE` / `TRUNCATE` without an `app_name = '...'` filter** — unscoped wipes BOTH apps' events.
- RLS: open `INSERT` for `anon` + `authenticated` (anonymous, device-based analytics).
- Indexes: `idx_analytics_events_app_name (app_name, created_at desc)`, `idx_analytics_events_name_created (event_name, created_at desc)`.

## Functions / triggers
- **Semora:** `is_pro` (redefined in 028 to also honor `promo_grants`), `current_user_is_pro`, `delete_user_account`, `handle_new_user`,
  `enforce_free_scan_limit`, `enforce_free_course_limit`, `enforce_free_semester_limit`,
  `*_assert_parent_owner` (tasks/courses/course_meetings/course_office_hours/parse_runs/syllabus_uploads/decks/cards/tutor_*/course_notes/course_shares),
  `parent_row_user_id`, `resolve_course_share` (026), `try_consume_tutor_usage` (025), `try_redeem_referral` (028),
  `apply_lms_assignment_sync`, `semora_collaboration_role`, `create_course_collaboration`,
  `create_course_collaboration_invite`, `join_course_collaboration`,
  `set_collaboration_local_course`, `sync_collaboration_to_planner`,
  `publish_course_deadlines` (037)
- **Citizen:** `whisper_rate_limit_ok` ← DO NOT modify from Semora

## Edge functions
- **Semora:** `parse-syllabus`, `validate-receipt`, `send-push` (deploy `--no-verify-jwt`),
  `tutor-chat`, `share-course`, `google-cal-sync`, `redeem-referral`, `lms-sync`

## Shared decks (migration 051) — **SEMORA only**
- `shared_decks`, `shared_deck_cards` — a flashcard deck published into a course
  space. Content only; no SM-2 state is ever published.
- RPCs: `publish_deck_to_collaboration(uuid, uuid)`, `sync_collaboration_decks(uuid)`.
- Columns added to existing Semora tables: `decks.source_shared_deck_id`,
  `decks.source_content_hash`, `cards.source_shared_deck_id`.
- Neither table takes direct client writes — both writers are SECURITY DEFINER
  RPCs, and the only write policy is a DELETE for the author or space owner.

## Storage buckets
- `syllabi` (private) — **SEMORA only**, per-user RLS policies. Citizen has no bucket.
- `course-notes` (private, 025) — **SEMORA only**, per-user RLS. AI-tutor uploaded notes.

## Rules to avoid cross-app accidents
1. Only `DROP`/`ALTER`/`TRUNCATE` a table whose comment names **your** app (or that's listed above under your app).
2. For shared `analytics_events`: always scope by `app_name`; never bulk-delete unscoped.
3. Any new **shared** table must carry an `app_name` column.
4. Apply Semora schema changes via **committed migrations** in `supabase/migrations/` so they're tracked (ad-hoc changes look "orphaned" to other sessions and may get cleaned up).
5. When unsure, read the table's `COMMENT` in the dashboard before changing anything.

_Last verified against the live schema: 2026-06-19 (full audit: 14 tables, RLS, functions, triggers, storage, FKs)._
