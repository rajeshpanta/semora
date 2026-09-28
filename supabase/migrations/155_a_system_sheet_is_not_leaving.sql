-- ============================================================
-- SEMORA: A SYSTEM SHEET IS NOT LEAVING THE APP
-- ============================================================
-- The in-session OTA reload (lib/appUpdate.ts, components/AppUpdateGate.tsx)
-- applies a downloaded update at two moments: cold start and "resumed". The
-- first version counted every return to 'active' as resumed. On iOS the app
-- also goes 'inactive' and back while a system sheet sits on top of it, so
-- Apple's payment sheet, the notification prompt and the photo picker each
-- restarted the app mid-task. In the week to 2026-09-24: 18 students, 17 of
-- them brand new, 2 mid-purchase and 4 mid-first-scan.
--
-- Bundles from this migration on read 'auto_update_reload_v2' and count a
-- resume only after a real trip to the background of MIN_AWAY_MS or more that
-- did not begin mid-lecture; a cold start reloads only on the screen the app
-- opens by itself, never on a task a reminder opened.
--
-- The original key has to go OFF, not just be left behind: it is read by
-- every older bundle, including the one built into the 1.15.1 binary, which
-- every fresh install runs for its entire first session. That is where 17 of
-- the 18 happened. Off, those bundles fall back to applying an update on the
-- next launch (the pre-2026-09-04 behaviour), which restarts nobody.
--
-- It takes effect as each app next launches: a running app keeps the value it
-- already read (old bundles cache it for 10 minutes and on disk), so expect a
-- short tail of old-rule reloads right after this is applied.
--
-- ORDER: apply this BEFORE publishing any OTA that carries the v2 reader, and
-- publish that OTA no sooner than ~10 minutes after (hours is better). An OTA
-- published first would sit "pending" on old-rule bundles that still read the
-- old key as on — the exact restart this removes. Publish it only from an
-- isolated per-runtime worktree without native changes, after
-- scripts/check-native-fingerprint.sh passes.
--
-- Never turn 'auto_update_reload' back on. To stop in-session reloads, set
-- 'auto_update_reload_v2' to active=false.
-- ============================================================

insert into public.app_promos (key, active, note)
values (
  'auto_update_reload_v2',
  true,
  'Applies a downloaded OTA in the session it arrives instead of the next launch. Read only by bundles whose resume rule needs a real trip to the background (lib/appUpdate.ts isRealResume). Guarded: a cold start on the Today screen, or a return after 5+ minutes away that did not begin mid-lecture; never on the recorder, sign-in/reset, onboarding, Canvas connect, paywall, scan or syllabus screens, never on a task a reminder opened; max 2 reload attempts per bundle. Not cached on the phone: set active=false and every app stops in-session reloads from its next launch.'
)
-- do nothing, not do update: re-running this file by hand must never switch
-- v2 back on after someone turned it off.
on conflict (key) do nothing;

update public.app_promos
set active = false,
    note = 'RETIRED 2026-09-24 (migration 155). Read by bundles that treat a system sheet (payment sheet, permission prompt, photo picker) as a resume and restart the app mid-task, including the bundle built into the 1.15.1 binary. Must never be turned back on; the switch is auto_update_reload_v2.',
    updated_at = now()
where key = 'auto_update_reload';
