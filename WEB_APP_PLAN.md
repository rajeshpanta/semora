# Semora Web App Plan

## Product goal

Deliver the complete Semora student workspace in a modern desktop browser while
preserving the existing iPhone app and one shared source of truth for data,
business rules, and feature access.

## Architecture

- Keep Expo Router and React Native Web so every course, task, grade, planner,
  collaboration, and study flow remains shared with iOS.
- Keep Supabase authentication, row-level data access, realtime collaboration,
  storage, and edge functions as the shared backend.
- Add browser-specific adapters only at native capability boundaries:
  Google OAuth, App Store billing, notifications, calendar integration, secure
  storage, file picking, and dialogs.
- Use a desktop app frame at large widths and retain the mobile tab bar at
  narrow widths. This makes the same URL usable on phones, tablets, laptops,
  and desktop monitors.
- Export as a single-page web app so deep links and OAuth callbacks can be
  handled consistently by the router.

## Experience model

### Desktop

- Persistent left navigation for Today, Courses, Calendar, syllabus import, and
  every study tool.
- Account switchboard anchored at the bottom.
- Fast actions for creating a task and searching, including keyboard shortcuts.
- Wider responsive content grids without allowing long-form content to become
  unreadable.

### Mobile web

- Preserve the familiar five-tab Semora navigation.
- Keep all controls touch-sized and every existing route reachable.

### Browser-native behavior

- Google sign-in uses Supabase browser OAuth and returns to the current origin.
- Multi-action alerts render as accessible in-app dialogs instead of relying on
  the no-op React Native Web alert implementation.
- File and syllabus import use the browser picker.
- Existing App Store Pro access is read from the server. New subscriptions and
  subscription management remain in the iPhone app.
- Device-only features clearly explain their browser limitations instead of
  failing silently.

## Feature parity

| Area | Web behavior |
| --- | --- |
| Authentication | Google OAuth and existing email/password sign-in |
| Today and tasks | Full parity |
| Courses and semesters | Full parity |
| Calendar and ICS export | Full parity |
| Syllabus scanning | PDF/image browser upload |
| Grades, GPA, insights | Full parity |
| Planner, flashcards, tutor, focus timer | Full parity |
| Collaboration and sharing | Full parity where Web Share/clipboard is available |
| Notifications and widgets | iPhone-only |
| Apple/Google device calendar sync | iPhone-only; ICS export remains available |
| Pro purchasing | Purchased/managed in iPhone app; entitlement works on web |

## Delivery phases

1. Stabilize the browser bundle and remove native-only import failures.
2. Add responsive desktop navigation and widen data-heavy screens.
3. Replace broken browser primitives with accessible web behavior.
4. Verify TypeScript, production export, routing metadata, and asset packaging.
5. Publish the validated build and monitor authentication redirects and error
   telemetry after launch.

## Acceptance criteria

- Production web export completes without TypeScript or bundling errors.
- A signed-in desktop user can reach every major feature without the mobile tab
  bar.
- A narrow browser retains the existing touch-first navigation.
- Google sign-in returns to Semora and creates/restores a Supabase session.
- Every confirmation dialog presents all actions and invokes the selected
  callback.
- Pro status is respected on web without attempting a browser App Store
  purchase.
