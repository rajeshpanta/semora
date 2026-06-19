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
`consumed_transactions`, `receipt_validation_log`

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
- **Semora:** `is_pro`, `current_user_is_pro`, `delete_user_account`, `handle_new_user`,
  `enforce_free_scan_limit`, `enforce_free_course_limit`, `enforce_free_semester_limit`,
  `*_assert_parent_owner` (tasks/courses/course_meetings/course_office_hours/parse_runs/syllabus_uploads),
  `parent_row_user_id`
- **Citizen:** `whisper_rate_limit_ok` ← DO NOT modify from Semora

## Storage buckets
- `syllabi` (private) — **SEMORA only**, per-user RLS policies. Citizen has no bucket.

## Rules to avoid cross-app accidents
1. Only `DROP`/`ALTER`/`TRUNCATE` a table whose comment names **your** app (or that's listed above under your app).
2. For shared `analytics_events`: always scope by `app_name`; never bulk-delete unscoped.
3. Any new **shared** table must carry an `app_name` column.
4. Apply Semora schema changes via **committed migrations** in `supabase/migrations/` so they're tracked (ad-hoc changes look "orphaned" to other sessions and may get cleaned up).
5. When unsure, read the table's `COMMENT` in the dashboard before changing anything.

_Last verified against the live schema: 2026-06-19 (full audit: 14 tables, RLS, functions, triggers, storage, FKs)._
