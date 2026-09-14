# Lecture audio — implementation plan

Written 2026-09-14. Baseline commit `8cea350`. This is a plan, not a record of
shipped work.

**Scope decision (owner, 2026-09-14): recovery of audio already stranded on
phones is OUT.** Students rarely reopen an old lecture, so the legacy scan is not
worth building. The consequence is accepted: every part lost before this plan
ships stays lost, including the four from 2026-09-14 09:01.

**Goal.** Every part that is successfully captured and finalised has a
recoverable identity, survives an ordinary app restart, is retried under its
original owner, and is counted in the lecture's completion state. Capture
failures become visible instead of silent. No software recovers microphone audio
that was never captured, and iOS does not promise transfers continue after a user
force-quits.

---

## Two findings that set the order

**`LectureRecoveryRuntime` is dead code.** It is defined at `app/_layout.tsx:1423`
and rendered nowhere. The once-per-launch recovery pass has never run for any
user. Mounting it is the cheapest item in this document.

**`lecture_rebuild_transcript` returns early.** In migration 138 as applied, it
returns at line 369 when the word content is unchanged, and
`lecture_set_parts_missing` is called at line 386, after it. A recovered silent
part therefore never reduces the missing count.

Also confirmed: `supabase/config.toml` does not exist in the repo. Every other
file named below does.

---

## Baseline measured 2026-09-14 (7 days)

| measure | count |
|---|---|
| lectures with parts | 12 |
| students who recorded | 9 |
| students who lost parts | 4 |
| parts expected | 86 |
| parts lost | 14 |
| upload failures logged | 14, across 4 devices |
| failures carrying a usable error code | 0 |

Server state: migrations 138 and 139 applied; `semora-lecture-arrivals` running
every minute with no failures; the `lectures` storage bucket holds **zero**
objects. Nothing that failed this week ever reached the server, so the arrival
job could not have helped.

Worked example, lecture `04cd64e7`, 2026-09-14:

| time (LA) | event |
|---|---|
| 09:01 | recording starts |
| 09:07 | part 0 upload fails, logged with no signed-in user |
| 09:13 | app reopened, so it had been suspended |
| 09:20 | part 1 upload fails |
| 09:24 / 09:29 / 09:35 | parts 2, 3, 4 upload |
| 09:35 | app reopened again |
| 09:38 | part 5 upload fails |
| 09:44 | part 6 uploads |
| 09:48 | part 7 row written, no audio. This is Stop |
| 10:10 | server records 4 parts missing |
| 10:35 | student receives "your notes are ready" |

Three distinct shapes: no row at all (parts 0 and 5), a row with no audio (parts
1 and 7), and four that worked. The app's own retry looks only for rows marked
`pending`, so it matches none of them.

---

## Phases

| Phase | Steps | Ships as |
|---|---|---|
| [0](#phase-0--know-what-you-are-fixing) | 0 | nothing |
| [1](#phase-1--stop-losing-new-audio) | 1, 2, 3 | over the air |
| [2](#phase-2--get-the-bytes-off-the-phone) | 4, 5, 9 | over the air |
| [3](#phase-3--make-the-truth-visible) | 7, 8 | migration + over the air |
| [4](#phase-4--survive-suspension) | 10 | binary |
| [5](#phase-5--prove-it-and-release) | 11, 12 | n/a |

Phase 3 can be built alongside 1 and 2. Do not enable a new uploader until its
recovery, ownership and deletion rules work.

Milestones: Phase 1 with its regression tests first, Phase 3 in parallel; then
Phase 2; then the validated Phase 4 binary.

---

## File map

| File | Responsibility |
|---|---|
| `lib/lectureRecorder.ts` | Capture, rotation, Pause/Resume/Stop, local persistence |
| `lib/lectureRecordingOptions.ts` | Chunk duration, limits, recording settings |
| `app/lecture/record.tsx` | Recorder controls, leaving the screen, Stop navigation |
| `lib/lectures.ts` | Segment data, transfer, retry, progress, deletion |
| `lib/httpUpload.ts` | Current XHR transport and error normalisation |
| `lib/lectureRecovery.ts` | Existing limited recovery pass |
| `app/_layout.tsx` | Mounting recovery, session lifecycle |
| `app/lecture/[id].tsx` | Recovery controls, progress, notes completeness |
| `lib/offlineSync.ts` | Existing connectivity subscription to reuse |
| `lib/supabase.ts` | Existing session-storage fix; preserve its behaviour |
| `lib/analytics.ts` | Redacted, Semora-scoped diagnostics |
| `lib/appUpdate.ts` | Reload safety once recovery runs beyond the recorder route |
| `supabase/functions/lecture-transcribe/index.ts` | Owner validation, claims, processing, finalisation |
| `supabase/functions/lecture-study-kit/index.ts` | Notes generation, revision-safe refresh |
| `supabase/functions/lecture-retention/index.ts` | Server audio cleanup |
| `supabase/migrations/138_*.sql` | Completeness, transcript rebuild, stale notes, notifications |
| `supabase/migrations/139_*.sql` | Arrival recovery, orphan classification, scheduling |
| `app.json`, `eas.json` | Native runtime, background recording, release channels |

Proposed new modules: `lib/lectureJournal.ts`, `lib/lectureUploadWorker.ts`,
`lib/lectureReconciliation.ts`, plus small pure state helpers with adjacent
tests. The hook keeps capture and presentation; the queue must outlive that
screen.

---

## Phase 0 — Know what you are fixing

**Step 0.**

1. Branch with the `codex/` prefix. Preserve unrelated work, record the starting
   commit.
2. Turn the Stop-during-rotation reproduction into a regression test around
   extracted lifecycle logic. Stop clears lecture identity before the outstanding
   rotation saves its file.
3. Record the deployed binary, runtime fingerprint, OTA update id, function
   versions and migration versions. Fixing source proves nothing about phones.
4. Capture the starting counts above. They are the before-and-after measure even
   though the backlog is not being repaired.
5. Set up a test account and synthetic speech and silence files. Work out how
   preview builds reach the test backend before uploading fixtures.

**Pass:** the Stop ordering bug and the false progress number are reproducible,
and the runtime being fixed is known.

---

## Phase 1 — Stop losing new audio

### Step 1 — Diagnostics at the failure boundaries

1. Name the stages: `capture_prepare`, `capture_finalize`, `local_commit`,
   `session`, `register`, `sign_url`, `transfer`, `acknowledge`,
   `transcribe_dispatch`, `finish_declare`, `reconcile`.
2. Every failure carries a normalised code, a retry classification, attempt
   number, opaque lecture and part identity, HTTP status where there is one, app
   version, and update identity.
3. Separate network timeout, authorisation unavailable, storage refusal, missing
   or corrupt local file, provider busy, and an ambiguous upload acknowledgment.
4. A missing code becomes a deliberate `UNKNOWN_*` with a known stage, never an
   empty string. This is the gap that left 14 failures unexplained.
5. Keep a small bounded local diagnostic history so an offline failure survives a
   restart; flush later through the existing redaction layer. Logging must never
   break recording.
6. Never log signed URLs, credentials, raw paths, audio or transcript text. Read
   `semora_events`, or filter `app_name='semora'` in the shared table.

**Pass:** a forced failure at each boundary names the right stage, and a
successful upload followed by an AI error never counts as a failed upload.

### Step 2 — The local recovery journal

The server database cannot be the only index of audio that has not reached it.

1. After an authorised `startLecture`, persist the owning user id and lecture id
   before capture starts. Keep the existing entitlement and consent checks; this
   is not unlimited offline lecture creation.
2. Store the journal in persistent document storage, scoped by owner and lecture.
   Record the active recorder URI after preparation and before recording begins,
   because the native recorder first writes to cache.
3. Version the journal with an immutable generation id. Write snapshots to
   temporary files, validate, then move to unique committed names. Retain the
   previous readable generation. Serialise writes. Never delete the last valid
   manifest before its replacement exists.
4. Treat file writes and metadata writes as separate crash boundaries. A
   directory scan must find a finalised file whose metadata commit was
   interrupted, and must tolerate half-written temporary files. Verify against
   the real filesystem API rather than assuming JavaScript can offer transactions
   or power-loss durability.
5. Once finalised, a part's bytes and sequence are immutable. Record:

```text
lecture: schemaVersion, ownerId, lectureId, captureGeneration,
         captureState, activeCaptureUri, finalExpectedParts,
         recordedDuration, stopIntent, discardIntent

part:    seq, relativeFilePath, duration, hasGap, byteLength,
         contentIdentity, state, attemptCount, nextAttemptAt,
         serverSegmentId, lastAcknowledgment, lastFailureStage
```

6. Use a supported content digest for `contentIdentity`. Size alone does not
   prove two files are the same audio. Do not add a native hashing dependency to
   an over-the-air release without checking compatibility.
7. Model: `capturing → finalizing → saved_locally → queued → transferring →
   awaiting_ack → server_received → transcribed`. Recovery-required, auth-blocked
   and discarded are explicit conditions. Server received and transcribed stay
   separate facts.
8. Persist Stop intent and the final expected count even with no network. A count
   of zero must never erase parts already acknowledged. After a crash with no
   final declaration, mark the capture interrupted and derive parts
   conservatively rather than guessing the intended duration.

**Pass:** kill the app after every journal and file boundary; on relaunch every
valid finalised test part is discoverable with its original identity, or is
explicitly quarantined.

### Step 3 — Serialise recording and fix Stop

1. Replace the boolean rotation guard with a shared in-flight promise or a
   serialised capture controller. Timer, interruption, Pause, Resume, Stop and
   Discard all go through it.
2. Capture lecture identity, generation, sequence, URI and measured duration
   before awaiting any native call. Never read a mutable lecture reference later
   to decide where an old chunk belongs.
3. Stop shuts down synchronously, blocks restart and rotation scheduling, awaits
   the rotation already running, and finalises the remaining capture exactly once.
4. Commit the finalised file and the journal before clearing active identity.
   Remove the preemptive destination delete in `persistSegment`; an unexpected
   file at the destination needs reconciliation, not overwriting.
5. A finalisation failure or unreadable file is an explicit recoverable error,
   not a silent success. Non-zero size is a preliminary check only; validate
   playability and duration on device.
6. Resume waits for Pause's finalisation. If Stop or Discard arrived while Resume
   was waiting, Resume must not restart the microphone. Match late native
   callbacks to the generation that created them. Disable transitional controls
   until their operation resolves.
7. Once local capture and Stop intent are durably committed, release the audio
   session and hand off to the app-wide queue. Stop must not await transcription.
   Return `saved_locally`, `needs_recovery` or `discarded` with a lecture identity
   where valid.
8. Fix `app/lecture/record.tsx`. It currently allows gestures and shows Leave
   during `finishing`, which begins before local finalisation completes. Protect
   navigation during `finalizing_local`; allow leaving at `saved_locally` or
   `queued`. Same rule for manual Stop, the automatic duration limit, back
   gestures and screen dismissal.
9. Set `finishedLectureId` only after a safe local handoff, show a real error when
   that handoff fails, and make repeated Stop taps idempotent.

**Pass:** Stop during rotation, Pause then immediate Stop or Resume, repeated
Stop, and the automatic limit all preserve the last part, the right count and the
right directory, with no overlapping recorder operations.

---

## Phase 2 — Get the bytes off the phone

### Step 4 — Make upload and acknowledgment independent of transcription

1. Split `uploadSegment` into register/reconcile, transfer, acknowledge, and
   optional transcription dispatch.
2. Transfer the file directly where supported instead of reading it through
   base64 into XHR memory.
3. Before transfer, confirm the signed-in user is the journal owner and reconcile
   server state. Never rebuild a storage path from whichever account is current.
4. Keep the path migration 139 parses: `<ownerUuid>/<lectureUuid>/seg_###.m4a`,
   sequence below 200. The parent must exist, belong to that owner, and have
   `source='recording'`. Changing the format means changing parser, policy and
   cleanup together.
5. Stop unconditionally upserting bytes. Prefer create-only signing and reconcile
   conflicts. A done or transcribing part must never be overwritten because a
   local retry still exists. The row trigger does not stop the upload code
   overwriting the storage object.
6. Add an owner-authenticated prepare/acknowledge contract returning
   `already_transcribed`, `received`, `processing`, `needs_upload`, `retry_later`
   or `not_allowed`. The server validates ownership and expected path. The client
   never gets a service-role key or the cron-only recovery action.
7. Acknowledgment rule before any local file is deleted: either the server
   confirms the exact accepted object exists and is eligible, or that part is
   already transcribed. An HTTP response, a progress bar at 100%, or a `failed`
   row is not enough. A 200 from `action:'segment'` is **not** an upload receipt;
   it can return 200 for a part it did not claim.
8. A timed-out PUT is ambiguous. Check whether the object or transcript exists
   before resending, and never let a retry reset a done or transcribing part back
   to pending.
9. Check the returned error on every database mutation. If bytes arrived but the
   status update failed, record `awaiting_ack` and let server reconciliation
   finish the handoff.
10. Schedule transcription separately. The arrival job is the fallback if the
    phone disappears. A provider timeout must not block the next finalised part.
11. Signed upload URLs expire after about two hours. Store issuance and expiry,
    renew under the correct account, never retry an expired capability forever.

**Pass:** a successful PUT with a lost response, a failed acknowledgment, or a
failed AI dispatch all converge on a received or transcribed part, with no loss,
no overwrite and no permanently blocked queue.

### Step 5 — One recovery worker for the whole app

1. Mount `LectureRecoveryRuntime` inside the authenticated provider tree. It is
   currently defined and never rendered.
2. Stop using the five-lecture status query as the source of work. Enumerate the
   owner's local journal first; server status is a reconciliation input, not proof
   there is no local work.
3. Wake on launch, foreground, restored connectivity, successful sign-in or auth
   recovery, a newly finalised part, and an explicit Retry. Reuse the existing
   connectivity layer.
4. Single-flight guard, so startup, the detail screen and reconnect events signal
   the same worker instead of each starting uploads.
5. Persist progress and retry times. Bounded batches with fairness across
   lectures, continuing until everything eligible has been considered. Remove the
   permanent starvation of anything older than the newest five lectures.
6. Start with one transfer at a time and tune after measurement. A corrupt file
   must not block every good file behind it. A network outage pauses network work;
   a permanent per-file error quarantines that part and lets the rest proceed.
7. Bounded exponential backoff with jitter. Resume auth-blocked work only after
   session recovery. Never sign the user out because an upload failed.
8. Replay pending Stop declarations independently of transfers. Preserve the
   highest acknowledged expected count, never regress a completed lecture, and
   handle a recording with zero usable finalised parts explicitly instead of
   leaving it waiting forever.
9. On account switch or sign-out, stop scheduling for the old account, cancel or
   reconcile its active tasks, and keep its files under the original owner. Never
   upload them as the next user.

**Pass:** offline at launch then reconnect, ready and failed lectures with a local
backlog, missing server rows, and more than five lectures all recover without the
detail screen being open.

### Step 9 — Make Discard, deletion and retention safe

1. Route recorder Discard and `useDeleteLecture` through the worker coordinator.
   Write the tombstone first, stop scheduling, then cancel or reconcile active
   transfers, then request server deletion.
2. Keep the deletion intent until server deletion actually succeeds. Reopening
   offline must not resurrect the lecture or quietly resume its uploads.
3. Handle a signed URL already issued, or an OS transfer completing after
   cancellation. Clean up the accepted object afterwards, and make the server
   refuse to transcribe an object whose parent is gone. Deleting storage once
   before cancelling in-flight uploads is not enough.
4. Check returned deletion errors instead of swallowing them. Show pending
   cleanup when remote deletion is unavailable, while honouring local intent.
5. **Local retention rule, decided now that the backlog rescue is out of scope.**
   Keep a failed part until it is acknowledged or the student discards the
   lecture, with an explicit ceiling rather than an open-ended hold. Any deadline
   needs visible notice and a recovery opportunity. Do not add a seven-day local
   delete because a server comment mentions one; the client does not implement
   that promise today.
6. Align the server object age limit, missing-part labels, orphan cleanup, local
   retention and user-facing wording. The server's seven-day window is about
   stored object age, not the age of a file on a phone.
7. Make journal migrations backward-readable during rollout. A rollback must not
   lose the index of newly saved files or forget tombstones. Wire this to
   `lib/appUpdate.ts` so a safe reload cannot interrupt an uncommitted capture
   transition just because the user left the recorder route, and so committed
   queue work resumes after the reload.

**Pass:** Discard or Delete during a transfer, then process death and reopen,
cannot restart uploads or regenerate notes; a failed remote cleanup stays visible.

---

## Phase 3 — Make the truth visible

### Step 7 — Server completeness and retry contracts

Add new migrations. Do not edit 138 or 139 to deploy changes. Use the next free
number; do not assume 140 is unused.

1. Keep arrival takeover as it is, including owner and path validation and its
   claim and retry protections. It cannot see bytes still on a phone; that is not
   a defect.
2. Fix `lecture_rebuild_transcript` so completeness is recalculated independently
   of whether the text changed. A recovered silent part must reduce the missing
   count and update duration and count metadata without regenerating notes
   needlessly.
3. Audit every terminal and late-arrival path against the same rule. Never shrink
   a declared count to the number of rows that happened to arrive. A crash with an
   unknown expected count stays explicitly unknown until reconciled.
4. Keep revision-based notes refresh. Existing notes stay visible while
   replacements generate; stale state clears only for the revision actually used.
   Recovered words invalidate stale notes; recovered silence does not trigger AI
   work.
5. Any new prepare/acknowledge/finish endpoint checks owner, lecture existence and
   source, part identity and state on every call. Entitlement stays enforced at
   the authorised start. Recovery neither bypasses entitlements nor charges a
   completed lecture twice.
6. The user `segment` action does not claim pending or failed rows; only the cron
   path does. Do not widen the client's retry statuses and assume the same call
   repairs every state. Use prepare/acknowledge or the arrival path.
7. Review `notify_lecture_notes_ready` together with the wording. "Notes updated"
   is fair when more text arrives; "covers the whole lecture" requires known
   complete capture and no unresolved parts. Never infer completeness from a
   status of `ready`. This is what sent a cheerful push at 10:35 on 2026-09-14.
8. Verify the function gateway settings. There is no checked-in config, and
   `DEPLOY_CHECKLIST.md` predates cron-secret recovery. These dual-auth handlers
   must be deployed so the request reaches their own auth logic, with
   `--no-verify-jwt` where appropriate and handler-side JWT and cron-secret checks
   intact. Test a no-credential rejection, an ownership rejection and an
   authenticated scheduler success.
9. Verify actual function responses and resulting state, not a cron job reporting
   success. A queued HTTP request can still be rejected downstream.

### Step 8 — Make the screens and notifications tell the truth

1. Extend `LectureRecording` to expose missing parts, missing-since and
   unrecoverable markers, notes stale and refreshed state, and transcript
   revision. Decode older or missing fields conservatively.
2. Replace progress based on server row count. Combine local expected parts,
   acknowledgments, server done states and explicit unknowns. Consolidate the
   segment hooks, which currently reuse one query key for different shapes, or
   give them distinct keys.
3. Show these states:

| Condition | Example |
|---|---|
| Final file being committed | "Saving this recording on your phone…" |
| Safely local, pending transfer | "Saved on this phone. 2 parts waiting to upload." |
| Session unavailable | "Your recording is saved here. Sign in to continue uploading." |
| Server accepted all known parts | "Audio received. Preparing your transcript." |
| Notes exist with missing parts | "These notes are incomplete. 2 parts are still missing." |
| New text arrived after notes | "Updating notes with recovered audio…" |
| No unresolved parts, notes current | "Your lecture notes are ready." |

4. Keep a visible Retry for locally recoverable work, including on ready
   lectures. It means a part from a recent recording that has not uploaded yet,
   not an archaeology tool for old lectures. Word it that way.
5. Allow leaving after local save, worded to match the transport actually
   shipped. "Saved here, uploads resume when possible" is honest until Phase 4
   proves otherwise.
6. Never claim all audio uploaded when the expected count is unknown, never show
   a failed part as uploaded without an acknowledgment, and keep silence distinct
   from missing audio.
7. Localise the new strings and keep accessible progress and error announcements.

**Pass:** eight server rows against ten locally known parts cannot render as
complete, and partial notes stay labelled after leaving and reopening.

---

## Phase 4 — Survive suspension

**Step 10.** Two releases.

**Intermediate, possibly over the air.** The installed Expo legacy filesystem
already uses file-backed iOS background uploads, so it can replace XHR with no
new native module — if the shipped runtime has that API. Use binary file upload,
persistent journal state, finite retry policies, and reconcile on foregrounding.

**Full, needs a binary.** The installed implementation uses a random background
session identifier and in-memory task mappings, which cannot survive a process
relaunch. Use a stable session identifier, persistent task-to-part identity,
discovery of existing tasks and durable receipts. Do not patch `node_modules` as
the answer; use a supported module or a repository-owned Expo module with a
config plugin.

1. Reattach existing transfers before scheduling duplicates at launch. Decide
   whether JavaScript or native owns transfer state, and merge native receipts
   idempotently.
2. Validate file and keychain access while locked after first unlock, and after a
   reboot. The session fix helps but does not guarantee network access or
   background execution.
3. Background uploads cannot finalise a recording file or rotate the microphone.
   Test the recorder's cache location, finalisation, five-minute rotation and
   duration limit under background conditions. If JavaScript rotation fails that
   test, native capture and segmentation becomes part of the binary work.
4. Distinguish suspension, OS termination and user force-quit in testing and in
   copy. Apple cancels background transfers after a force-quit and does not
   relaunch the app; retained finalised files retry when the owner reopens it.
5. Use upload-from-file tasks. Apple is explicit that data and stream uploads do
   not get the same after-exit behaviour.
6. Test Android separately if shipping there. Passing on iOS proves nothing about
   Android foreground services. Web recording is unsupported, so guard the native
   journal and transport imports.

**Pass:** the physical-device matrix passes for every promised state. Document the
unfinalised current chunk as a separate capture risk; do not advertise zero loss
or a five-minute maximum without evidence.

---

## Phase 5 — Prove it and release

### Step 11 — Release gates

Write tests next to the changes, against extracted logic, not by matching source
strings.

| Test | Invariant |
|---|---|
| Stop during rotate, double Stop, Pause then Resume or Stop | One finalisation, right identity and count, no early navigation |
| Kill after each file and journal write | Last valid manifest survives, finished audio discoverable |
| Offline or no session at chunk close | Local save succeeds, account-bound work waits |
| Reconnect after an offline launch | Worker wakes without opening the lecture |
| PUT succeeds, response lost | Reconciliation sees success before retrying |
| AI dispatch timeout or 429 | Later audio still uploads, processing retries separately |
| Ready or failed parent, no row, more than five lectures | No eligible work excluded or starved |
| Same part retried by two triggers | One worker and claim, immutable bytes, no double charge |
| Silent recovered part | Missing count drops without regenerating notes |
| Notes generation overlaps recovery | Revision check blocks stale completion |
| Delete or Discard races a transfer | Tombstone wins, late bytes cleaned up |
| Account switch with a backlog | Nothing uploads under the new account |
| Corrupt file in the journal | Visible quarantine, unrelated work proceeds |
| Low disk, mic interruption, cache loss | Explicit capture error, never a false saved state |
| Long recording, lock, airplane mode, OS kill, force-quit and reopen | Finalised parts reconcile, real duration checked |
| Old client on new server, old runtime | No protocol or native regression |

Representative commands, once the test files exist:

```bash
npx tsc --noEmit
~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json \
  lib/lectureJournal.test.ts lib/lectureReconciliation.test.ts lib/lectureLifecycle.test.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-transcribe/index.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-study-kit/index.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-retention/index.ts
npm run build:web
```

Put migration regressions in `supabase/tests/` against an isolated database.
Never run mutation fixtures against production.

Device evidence must record actual captured duration, number of finalised files,
parts the server received, final transcript and notes state, and the installed
build and update id. Use spoken timecodes and silence fixtures to catch missing or
duplicated boundaries. Repeat the rotation and Stop boundary at least 20 times, do
one full-length recording, and cover the oldest supported device and a current
one, in a release build. A green unit test is not evidence of background
reliability.

### Step 12 — Release in order and monitor

1. Review the diff and the evidence. Deploy the additive, backward-compatible
   server contracts and completeness fixes first, and verify against existing
   clients.
2. Confirm the auth settings on lecture-transcribe, study-kit and retention let
   the scheduler through and still reject strangers. Fix the stale deploy
   checklist while you are there.
3. Ship the journal, lifecycle, recovery and UI release to a controlled preview
   cohort. Over-the-air eligibility depends on the real native fingerprint. The
   app uses `runtimeVersion.policy='fingerprint'` and checks updates on load.
4. Check effective channel routing. The `eas.json` profiles and the production
   update header in `app.json` are separate things; inspect the generated
   configuration rather than trusting a profile name.
5. Promote only a runtime-compatible update. Native changes need a new binary.
6. Ship transport and capture changes as a tested binary. Confirm journal
   compatibility across upgrade, fallback and rollback. Never distribute a
   recording fix through a website deploy.
7. Monitor by installed update id so healthy old and new traffic do not blur.
8. Gate the broad rollout on: every deterministic test passing, no false
   completion anywhere in the fault matrix, no cross-account or deletion
   resurrection, and no unresolved finalised-file loss on device.
9. Monitor failure stages, oldest pending local work when devices report it,
   missing-part counts, stale note age, failed function responses, duplicate
   processing cost, crashes and journal errors. Compare only parts known to be
   finalised; offline devices cannot report yet.
10. Treat queue corruption, owner mismatch, unexpected deletion or new
    finalised-file loss as rollout-stopping. Pause transport scheduling while
    keeping capture, the journal and recovery data readable. Roll back
    compatibly. Never erase journals or reverse additive columns to hide a
    failure.

**Completion evidence:** the intended versions are installed, new finalised parts
pass the failure matrix, partial lectures stay honestly labelled, and no growing
eligible backlog appears in the observed cohort.

---

## What the owner supplies

No new credentials for the work itself. A test iPhone for device verification.
Existing EAS and App Store access for the native release. Nothing here authorises
contacting affected students.

---

## Phase 0 record — 2026-09-14

Branch `codex/lecture-audio-phase-1`, cut from `8cea350`.

| Thing | Value |
|---|---|
| Store binary | 1.14, build 58 |
| Runtime fingerprint shipped in that binary | `e88b9845…` (baseline, recorded for 1.13/57) |
| Fingerprint of this working tree | `8436c8c1…` — **drifted** |
| Bundles live today | embedded `ae1f6b03` (1.14), `e36abd90` (1.13), OTA `01a09d94`, `01a09bc6`, `01a094f0` |
| Migrations applied | through 139 |
| `lecture-transcribe` | v26, deployed 2026-09-13 23:11, `verify_jwt=false` |
| `lecture-study-kit` | v21, deployed 2026-09-13 21:56, `verify_jwt=false` |
| `lecture-retention` | v8, deployed 2026-09-13 23:11, `verify_jwt=false` |

**The fingerprint drift is local, not committed.** The only native-relevant file
changed since build 58 is `app.json`, and only `android.versionCode` 3 → 4, which
`ExpoConfigVersions` already excludes. The cause is the gitignored `ios/` and
`android/` directories, regenerated by the Android prebuild after 2026-09-11.

Consequence for this plan: **Phases 1 to 3 cannot be published over the air from
this working tree.** The update would carry `8436c8c1…`, which no installed binary
has, so it would reach nobody and report no error. Publish from a clean isolated
worktree, or restore the tree to the fingerprint the binary has, and re-run
`scripts/check-native-fingerprint.sh` until it matches before any publish.

Still owed for Step 0: a test account, synthetic speech and silence fixtures, and
the route preview builds take to the test backend. Those need the owner.

### Progress — 2026-09-14

| Step | State |
|---|---|
| 0 Baseline | Done, except the test account and audio fixtures |
| 1 Diagnostics | Done — stages, codes, and a bounded on-device buffer that survives a restart and flushes on the recovery triggers |
| 2 Local journal | Done — `lectureJournal.ts`, 18 tests killing the filesystem at each boundary |
| 3 Recording lifecycle | Done, less the port onto `lectureLifecycle.ts`; the rules are applied in the hook |
| 4 Upload and acknowledgment | Done, less the transport itself. See below |
| 5 One recovery worker | Done — mounted, single-flight, journal-driven, wakes on foreground and reconnect |
| 6 Legacy recovery | Out of scope by the owner's decision |
| 7 Server completeness | Migrations 140 and 141, **neither applied** |
| 8 Screens tell the truth | Done, in English and Spanish |
| 9 Deletion and retention | Done — tombstone first, receipts gate the local delete |
| 10 Background transport | **Not built.** Needs a binary and a device |
| 11 Release gates | Unit gates green. Device matrix not run |
| 12 Release | Not started, blocked on the fingerprint |

### Two things deliberately not done

**The transport is unchanged.** The upload still reads the file through base64
into an XHR. Switching to file-backed background uploads is the single change
most likely to break recording for everyone, it cannot be verified without a
device, and this plan's own rule is not to enable a new uploader before its
recovery, ownership and deletion rules are working. Those rules are working now,
so the transport is the next thing — with the Step 11 matrix in front of it, not
behind it.

**No new prepare/acknowledge endpoint.** The rule it exists to enforce is that a
local file is deleted only against a server receipt. The segment row moving to
`uploaded` is that receipt and it already exists, so the rule is enforced without
a new surface to secure. If the background transport needs a richer contract,
build it then.

### Owed before any of this reaches a student

1. **The fingerprint, now confirmed against live data.** Every update on the
   `production` branch carries `e88b9845…`, and devices on 1.14 are taking them
   (bundle `01a09d94`, 21 devices, from 2026-09-13 19:29). So the installed
   binaries have `e88b9845…`. This tree computes `8436c8c1…`. The whole of
   `ios/` was regenerated at 2026-09-11 02:19, forty minutes after the baseline
   was recorded, and `ios` is a fingerprint source. `.xcode.env.local` is not
   the cause: removing it changes nothing. An update published from here would
   be tagged `8436c8c1…`, which no installed binary has, and would reach nobody
   while reporting no error. Publish from a clean isolated worktree — see the
   `ota-from-isolated-worktree` note — and re-run
   `scripts/check-native-fingerprint.sh` until it matches before any publish.
2. **Migrations 140 and 141.** Written, checked against the live signatures and
   columns, not applied and not dry-run. Nothing in the client depends on either.
3. **Device testing.** None of the capture work has been on a phone. This is the
   gate that matters most: the Stop boundary twenty times, a full-length
   recording, a lock, airplane mode, and a force-quit and reopen.
