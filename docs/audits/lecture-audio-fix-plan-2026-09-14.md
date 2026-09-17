# Semora lecture audio — complete implementation and release guide

Prepared September 14, 2026. Source baseline: `8cea350`. This is an implementation plan, not a claim that the fixes have shipped. Only this document was added for this request.

The required outcome is: every successfully finalized audio part has a recoverable identity, survives ordinary app restarts, is retried under its original owner, and is accounted for in the lecture's completion status. Recording failures must be visible. No software can recover microphone audio that was never captured or finalized, and iOS does not promise continued transfers after a user force-quits.

## Navigation

| Step | Work | Result required before moving on |
|---|---|---|
| [0](#step-0--establish-the-baseline) | Baseline and release controls | Reproducible defects and known deployed versions |
| [1](#step-1--add-diagnostics-at-the-failure-boundaries) | Diagnostics | Failures identify the stage and affected part |
| [2](#step-2--create-the-local-recovery-journal) | Persistent local journal | Recovery no longer depends on a server row |
| [3](#step-3--serialize-recording-and-fix-stop) | Recording lifecycle | Stop cannot overtake saving; navigation is safe |
| [4](#step-4--make-upload-and-acknowledgment-independent-of-transcription) | Transfer and server acknowledgment | AI processing cannot strand later uploads |
| [5](#step-5--run-one-recovery-worker-throughout-the-app) | Recovery worker | All eligible local parts are eventually considered |
| [6](#step-6--recover-files-from-older-app-versions) | Legacy recovery | Existing recoverable audio is included |
| [7](#step-7--correct-server-completeness-and-retry-contracts) | Server corrections | Late/silent parts and partial notes are counted correctly |
| [8](#step-8--make-the-screens-and-notifications-tell-the-truth) | UI and notifications | Saved locally, uploaded, and complete are distinct |
| [9](#step-9--make-discard-deletion-and-retention-safe) | Deletion and retention | Retries cannot resurrect deleted recordings |
| [10](#step-10--add-and-verify-background-transport) | Native background behavior | Supported transfers survive suspension and reconcile on reopen |
| [11](#step-11--run-the-release-gates) | Automated and device tests | Failure boundaries pass reproducible tests |
| [12](#step-12--release-in-order-and-monitor-the-outcome) | Release and monitoring | Compatible rollout with observable recovery and rollback |

Steps describe a dependency order. Diagnostics and server/UI corrections can be developed alongside the journal. Do not enable a new uploader until its recovery, ownership, and deletion rules are working.

## File map

Existing files to inspect or change:

| File | Responsibility |
|---|---|
| [lib/lectureRecorder.ts](/Users/smile/Desktop/semora/lib/lectureRecorder.ts) | Capture, rotation, Pause/Resume/Stop, local persistence |
| [lib/lectureRecordingOptions.ts](/Users/smile/Desktop/semora/lib/lectureRecordingOptions.ts) | Chunk duration, limits, recording settings |
| [app/lecture/record.tsx](/Users/smile/Desktop/semora/app/lecture/record.tsx) | Recorder controls, leaving the screen, Stop navigation |
| [lib/lectures.ts](/Users/smile/Desktop/semora/lib/lectures.ts) | Segment data, transfer, retry, progress, deletion |
| [lib/httpUpload.ts](/Users/smile/Desktop/semora/lib/httpUpload.ts) | Current XHR transport and error normalization |
| [lib/lectureRecovery.ts](/Users/smile/Desktop/semora/lib/lectureRecovery.ts) | Existing limited recovery pass |
| [app/_layout.tsx](/Users/smile/Desktop/semora/app/_layout.tsx) | Mounting recovery and session lifecycle |
| [app/lecture/[id].tsx](/Users/smile/Desktop/semora/app/lecture/[id].tsx) | Recovery controls, progress, notes completeness |
| [lib/offlineSync.ts](/Users/smile/Desktop/semora/lib/offlineSync.ts) | Existing connectivity subscription to reuse |
| [lib/supabase.ts](/Users/smile/Desktop/semora/lib/supabase.ts) | Existing session-storage fix; preserve its behavior |
| [lib/analytics.ts](/Users/smile/Desktop/semora/lib/analytics.ts) | Redacted, Semora-scoped diagnostics |
| [lib/appUpdate.ts](/Users/smile/Desktop/semora/lib/appUpdate.ts) | Reload safety once recovery runs beyond the recorder route |
| [lecture-transcribe/index.ts](/Users/smile/Desktop/semora/supabase/functions/lecture-transcribe/index.ts) | Owner validation, claims, processing and finalization |
| [lecture-study-kit/index.ts](/Users/smile/Desktop/semora/supabase/functions/lecture-study-kit/index.ts) | Notes generation and revision-safe refresh |
| [lecture-retention/index.ts](/Users/smile/Desktop/semora/supabase/functions/lecture-retention/index.ts) | Server audio cleanup |
| [Migration 138](/Users/smile/Desktop/semora/supabase/migrations/138_a_lecture_is_not_finished_until_its_parts_are.sql) | Completeness, transcript rebuild, stale notes, notifications |
| [Migration 139](/Users/smile/Desktop/semora/supabase/migrations/139_audio_that_arrives_is_audio_that_gets_transcribed.sql) | Arrival recovery, orphan classification, scheduling |
| [app.json](/Users/smile/Desktop/semora/app.json), [eas.json](/Users/smile/Desktop/semora/eas.json) | Native runtime, background recording, release channels |

Suggested new modules: `lib/lectureJournal.ts`, `lib/lectureUploadWorker.ts`, `lib/lectureReconciliation.ts`, and small pure state/transition helpers with adjacent tests. These names are proposals, not existing functionality. Keep the hook responsible for capture and presentation; the queue must outlive that screen.

## Step 0 — Establish the baseline

1. Create an implementation branch using the `codex/` prefix. Preserve unrelated work and record the starting commit.
2. Save the current Stop-during-rotation reproduction as a proper regression test around the extracted lifecycle logic. The previous audit's controlled test confirmed Stop clears lecture identity before the outstanding rotation persists its file.
3. Record the deployed iOS binary, runtime fingerprint, OTA update ID, function versions, and database migration versions. Source code being fixed does not establish that affected phones received it.
4. Capture aggregate counts of missing parts, pending/failed parts, stale notes, and upload failure stages. Keep production diagnosis metadata-only unless an affected user authorizes deeper inspection.
5. Use a dedicated test account and synthetic speech/silence files for fault injection. Determine how preview builds connect to the test backend before uploading fixtures.

Prior audit baseline: migrations 138/139 were applied; the arrival job ran every minute; four of thirteen recent recordings reported missing parts, including three marked ready. Fourteen generic failure events had no useful error code. Those numbers are a dated snapshot, not a permanent dashboard or proof of a particular device failure.

**Pass condition:** the team can reproduce the Stop ordering and misleading progress calculation, and knows which deployed runtime it is fixing.

## Step 1 — Add diagnostics at the failure boundaries

1. Define stages: `capture_prepare`, `capture_finalize`, `local_commit`, `session`, `register`, `sign_url`, `transfer`, `acknowledge`, `transcribe_dispatch`, `finish_declare`, and `reconcile`.
2. Give each failure an explicit normalized code, retry classification, attempt number, opaque lecture/part identity, HTTP status where available, app version, and update/runtime identity.
3. Distinguish network timeout, authorization unavailable, storage refusal, local file missing/corrupt, provider busy, and an ambiguous upload acknowledgment. A missing code becomes a deliberate `UNKNOWN_*` classification with a known stage, not an empty value.
4. Keep a small bounded local diagnostic history so an offline failure is available after restart. Flush later through the existing redaction/analytics layer; avoid turning logging failure into recording failure.
5. Do not log signed URLs, credentials, raw filesystem paths, audio, or transcript text. Query `semora_events` or explicitly filter `app_name='semora'` in the shared table.

**Pass condition:** forced failures at each boundary identify the correct stage. A successful upload followed by an AI error never increments a “bytes failed to upload” metric.

## Step 2 — Create the local recovery journal

The remote database cannot be the only index of audio that has not reached it.

1. After an authorized `startLecture` succeeds, persist the owning user ID and immutable lecture ID before starting capture. Preserve the existing start entitlement/consent checks; this plan does not introduce unlimited offline lecture creation.
2. Store journal data in the app's persistent document storage, scoped by owner and lecture. Record the active recorder URI after preparation and before recording starts, so a restart can inspect an interrupted capture. The current native recorder initially writes to cache.
3. Use a versioned journal with an immutable generation identifier. Persist new snapshots to temporary files, validate them, and move them to unique committed names; retain a previous readable generation. Serialize writes. Do not delete the last valid manifest before writing its replacement.
4. Treat file and metadata writes as separate crash boundaries. A directory scanner must recover a finalized file whose metadata commit was interrupted, and must tolerate incomplete temporary files. Verify these operations on the installed filesystem API; do not assume JavaScript can provide a transactional filesystem or unconditional power-loss durability.
5. Once finalized, each part's bytes and sequence are immutable. Record at least:

```text
lecture: schemaVersion, ownerId, lectureId, captureGeneration,
         captureState, activeCaptureUri, finalExpectedParts,
         recordedDuration, stopIntent, discardIntent

part:    seq, relativeFilePath, duration, hasGap, byteLength,
         contentIdentity, state, attemptCount, nextAttemptAt,
         serverSegmentId, lastAcknowledgment, lastFailureStage
```

`contentIdentity` should use a supported content digest where available; size alone is not proof of identical audio. Do not add a new native hashing dependency to an OTA release without checking compatibility.

6. Model `capturing → finalizing → saved_locally → queued → transferring → awaiting_ack → server_received → transcribed`. Recovery-required, auth-blocked, and discarded are explicit conditions. Server-received and transcribed remain different facts.
7. Persist Stop intent and final expected count even when the network is unavailable. A count of zero must not erase already acknowledged parts. After a crash without a final declaration, label the recovered capture interrupted and derive the known parts conservatively; do not pretend its original intended duration is known.

**Pass condition:** terminate after every journal/file boundary. On relaunch, every valid finalized test part is discoverable with its original identity, or is explicitly quarantined when identity cannot be established.

## Step 3 — Serialize recording and fix Stop

1. Replace the boolean-only rotation guard with a shared in-flight operation promise or serialized capture controller. Timer, interruption, Pause, Resume, Stop, and Discard must all use it.
2. Capture lecture identity, generation, sequence, URI, and measured duration before awaiting native operations. Do not read a mutable lecture reference later to decide where an old chunk belongs.
3. Stop requests shutdown synchronously, prevents restart/rotation scheduling, awaits the rotation already in progress, and finalizes any remaining active capture exactly once.
4. Commit the finalized file and journal before clearing active identity. Remove the preemptive destination deletion in `persistSegment`; an unexpected existing destination requires reconciliation, not overwriting.
5. Treat finalization failure or an unreadable file as an explicit recoverable error. Do not swallow it and claim successful capture. A nonzero file size is only a preliminary check; validate playability/duration using supported native capabilities and device tests.
6. Resume waits until Pause's finalization has completed. If Stop or Discard arrived while Resume was waiting, Resume must not restart the microphone. Match late native callbacks to the capture generation that created them; an old completion must not finalize a new recording. Disable transitional controls until their operation resolves.
7. Once local capture and Stop intent are durably committed, release the audio session and hand work to the app-wide queue. Stop should not await every transcription request. Return a structured result such as `saved_locally`, `needs_recovery`, or `discarded` with a lecture identity where valid.
8. Update the caller at `app/lecture/record.tsx`. It currently permits gestures and shows Leave during `finishing`, which starts before local finalization is complete. Keep navigation protected during `finalizing_local`; allow leaving after `saved_locally/queued`. Apply the same rules to manual Stop, automatic duration limit, back gestures, and screen dismissal.
9. Set `finishedLectureId` only after the safe local handoff; show a meaningful save error when that handoff fails. Make repeated Stop taps idempotent.

**Pass condition:** Stop during timer rotation, Pause then immediate Stop/Resume, repeated Stop, and automatic-limit Stop preserve the last part, the correct count, and the correct lecture directory without overlapping recorder operations.

## Step 4 — Make upload and acknowledgment independent of transcription

1. Refactor `uploadSegment` into registration/reconciliation, transfer, acknowledgment, and optional transcription dispatch. Transfer a file directly where supported instead of reading the entire file through base64 into XHR memory.
2. Before transfer, confirm the signed-in user is the journal owner and reconcile server state. Never rebuild a storage path from whichever account happens to be current.
3. Preserve the canonical path required by migration 139: `<ownerUuid>/<lectureUuid>/seg_###.m4a`, sequence below 200. The parent must exist, belong to that owner, and have `source='recording'`. A different path format requires coordinated parser, policy, and cleanup changes.
4. Avoid unconditional upserts of bytes. Prefer create-only upload signing and reconcile conflicts. A completed or currently transcribing part must not be overwritten because a local retry still exists. The segment-row protection trigger does not prevent the existing upload code from attempting to overwrite the storage object afterward.
5. Add an owner-authenticated prepare/acknowledge contract where existing queries cannot distinguish the necessary states. It should return `already_transcribed`, `received`, `processing`, `needs_upload`, `retry_later`, or `not_allowed` with explicit meaning. Validate ownership and expected path on the server. Do not give the client a service-role key or access to the cron-only recovery action.
6. Establish the acknowledgment rule before deleting local files: either the server confirms that the exact accepted object exists and is eligible for processing, or the corresponding immutable part is already transcribed. An HTTP response, progress reaching 100%, or a `failed` row alone is insufficient. In particular, `action:'segment'` can return 200 for a part it did not claim; that response is not an upload receipt.
7. A timed-out PUT is ambiguous. Reconcile whether the object or transcript exists before resending. Retrying a row update must not reset a done/transcribing part to pending.
8. Check returned errors from every database mutation. If bytes arrived but the status update failed, record `awaiting_ack` and let server reconciliation/arrival takeover complete the handoff.
9. Schedule transcription separately. The existing arrival job supplies a fallback if the phone disappears before the nudge. A provider timeout must not block uploading the next finalized part.
10. Signed upload URLs expire. Supabase documents a two-hour lifetime; store issuance/expiry metadata, renew when needed under the correct account, and never blindly retry an expired capability forever. [Supabase signing documentation](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl).

**Pass condition:** PUT success followed by lost response, failed acknowledgment, or failed AI dispatch converges to a received/transcribed part without loss, overwrite, or an indefinitely blocked later upload.

## Step 5 — Run one recovery worker throughout the app

1. Mount `LectureRecoveryRuntime` inside the authenticated provider tree. It is currently defined but not rendered.
2. Replace the current five-lecture status query as the source of work. Enumerate the current owner's local journal first; server status is a reconciliation input, not proof that no local work exists.
3. Wake on launch, foreground, restored connectivity, successful sign-in/auth recovery, newly finalized parts, and an explicit Retry action. Reuse the existing connectivity layer where practical.
4. Give the worker a single-flight guard. Startup, the detail screen, and reconnect events must signal the same worker rather than each starting uploads independently.
5. Persist work progress and retry times. Use bounded batches with fairness across lectures; continue later batches until all eligible entries are considered. Remove permanent starvation of entries older than the newest five lectures.
6. Start with one transfer at a time; tune concurrency after measurement. An individual corrupt file must not block every later good file. A network outage should pause network work, while a permanent per-file error should quarantine that part and let unrelated work proceed.
7. Use bounded exponential backoff with jitter. Resume auth-blocked work only after account/session recovery. Do not sign the user out because one upload fails.
8. Replay pending Stop declarations independently of transfers. Prefer a server operation that preserves the maximum acknowledged expectation and cannot regress a completed lecture's processing status. Handle a recording with zero usable finalized parts explicitly as a capture failure/cancellation case; do not leave it waiting forever for a positive segment count.
9. On account switch or sign-out, stop scheduling the old account, cancel/reconcile its active tasks according to the transport, and retain its files under the original owner. Never transfer them as the next user.

**Pass condition:** offline-at-launch then reconnect, ready/failed lectures with local backlog, missing server rows, and more than five lectures all recover without requiring the recording detail screen to remain open.

## Step 6 — Recover files from older app versions

1. Scan the legacy `documents/lectures/<lectureId>/seg_###.m4a` layout as well as new journal directories. Do this in bounded batches and record migration progress.
2. Resolve the parent lecture using the authenticated account. A successful authorized lookup must establish ownership. A network error or temporarily unavailable session must never be treated as proof that the lecture was deleted.
3. Use server metadata when available. When no segment row exists, inspect playable duration and filename sequence; mark unavailable historical metadata as unknown. Do not invent interruption flags or original total lecture duration.
4. Add verified files to the new journal before retrying. Mark already-transcribed duplicates acknowledged rather than re-uploading them.
5. Handle abnormal directories such as `lectures/null` separately. The confirmed Stop race can lose association. Do not assign those files to a lecture based only on timestamps or the currently signed-in user. Keep them quarantined for an authenticated, explicit recovery association if reliable evidence is unavailable.
6. Inspect recorded active-cache URIs when a journal identifies them. An orphan cache file from an older version with no identity may be unrecoverable automatically; acknowledge this limit.
7. Surface a count of recovered parts and parts requiring attention. Do not promise the historical “twenty minutes” until the actual files have been found, validated, and incorporated.

**Pass condition:** fixtures covering pending, failed, ready, absent-row, duplicate, unowned, malformed-path, and corrupt legacy files take the appropriate action without silently deleting uncertain audio.

## Step 7 — Correct server completeness and retry contracts

Add new migrations for changes; do not edit already-applied migrations 138/139 as the deployment mechanism.

1. Preserve arrival takeover. It already discovers eligible row-less audio and dispatches bounded recovery every minute. It cannot discover bytes still on the device. Keep its owner/path validation and claim/retry protections.
2. Correct `lecture_rebuild_transcript`: it currently returns early when normalized words did not change, before calling `lecture_set_parts_missing`. Recalculate completeness independently of textual changes. A recovered silent part must reduce the missing count and update relevant duration/count metadata without needlessly regenerating notes.
3. Audit all terminal and late-arrival paths against the same completeness rule. Do not shrink a known declared count to the number of rows that happened to arrive. A crash with unknown expected count should remain explicitly unknown until reconciled.
4. Preserve revision-based notes refresh: keep existing notes visible while replacement notes are generated; clear stale state only for the transcript revision actually used. Recovered words must invalidate stale notes; recovered silence must not trigger unnecessary AI work.
5. Make any new prepare/acknowledge/finish endpoint check owner, lecture existence/source, part identity, and state on every call. Keep entitlement enforcement at the authorized start and existing server charging rules. Recovery must neither bypass entitlements nor double-charge a completed lecture.
6. The normal user `segment` action does not claim pending/failed rows; the cron recovery path does. Do not simply widen client retry statuses and assume the same function call now repairs every state. Use the prepare/acknowledge result or the existing server arrival path to establish recoverability.
7. Review `notify_lecture_notes_ready` alongside the UI. “Notes updated” is valid when more text arrives; “covers the whole lecture” requires known complete capture and no unresolved parts. Do not infer completeness from `ready` alone.
8. Verify the function gateway configuration. There is no checked-in `supabase/config.toml`, and the lecture-transcribe deployment line in `DEPLOY_CHECKLIST.md` predates cron-secret recovery. Deployments for this dual-auth handler must allow the request to reach its own authentication logic; use `--no-verify-jwt` where appropriate while preserving handler-side user JWT and cron-secret checks. Test no-credential rejection, user ownership rejection, and authenticated scheduler success.
9. Verify actual function responses and resulting state transitions, not merely cron SQL `succeeded`. A successful queued HTTP request can still be rejected downstream.

**Pass condition:** late spoken and silent parts reconcile accurately; stale notes clear only for the right revision; unauthorized callers fail; recovery and user requests racing do not corrupt bytes or completed state.

## Step 8 — Make the screens and notifications tell the truth

1. Extend `LectureRecording` to expose the server fields needed for completeness: missing parts, missing-since/unrecoverable markers, notes stale/refreshed state, and transcript revision as applicable. Decode older/missing fields conservatively.
2. Replace progress based only on server row count. Combine local expected parts, upload acknowledgments, server done states, and explicit unknowns. Use one consistent query result shape; the existing segment hooks reuse the same query key for different data shapes and should be consolidated or assigned distinct keys during this change.
3. Show understandable states:

| Condition | Example UI |
|---|---|
| Final file is being committed | “Saving this recording on your phone…” |
| Safely local, pending transfer | “Saved on this phone. 2 parts waiting to upload.” |
| Session unavailable | “Your recording is saved here. Sign in to continue uploading.” |
| Server accepted all known parts | “Audio received. Preparing your transcript.” |
| Notes exist with missing parts | “These notes are incomplete. 2 parts are still missing.” |
| New text arrived after notes | “Updating notes with recovered audio…” |
| No unresolved parts and notes current | “Your lecture notes are ready.” |

4. Keep a visible Retry action for locally recoverable work, including ready lectures. Explain when missing audio may remain on the original recording device.
5. Permit leaving after local save, with wording that matches the installed transport. “Saved here; uploads resume when possible” is safer than promising continued uploads on every app exit.
6. Do not claim “all audio uploaded” when expected count is unknown. Do not treat a failed segment as uploaded without an acknowledgment. Keep silence distinct from missing audio.
7. Localize the new strings through the existing translation approach and preserve accessible progress/error announcements.

**Pass condition:** eight server rows out of ten locally known parts cannot display complete, and partial notes remain clearly labeled after leaving and reopening the screen.

## Step 9 — Make Discard, deletion, and retention safe

1. Route recorder Discard and `useDeleteLecture` through the worker coordinator. Persist a discard/deletion tombstone first, stop new scheduling, then cancel/reconcile active transfers and request server deletion.
2. Keep deletion intent until the server deletion succeeds. Reopening offline must not resurrect the lecture or silently resume its uploads.
3. Account for an already-issued signed URL or an OS transfer completing after cancellation. Reconcile and clean up the accepted path after completion; the server must refuse to transcribe an object whose parent was deleted. A one-time storage delete before canceling in-flight uploads is insufficient.
4. Check returned deletion errors instead of swallowing them. Show pending cleanup when remote deletion is unavailable, while honoring local deletion intent.
5. Delete local acknowledged audio according to the chosen handoff policy. For the initial repair release, preserve unacknowledged files until receipt or explicit owner discard; do not add silent expiry while rescuing the backlog. Any later retention deadline needs visible notice, a recovery opportunity, and consistent cleanup behavior. Do not introduce an automatic seven-day local deletion merely because a server comment says phones keep files seven days—the current client does not implement that promise.
6. Align server object age limits, missing-part labels, orphan cleanup, local retention, and user-facing disclosures. Server recovery's seven-day window is based on stored-object age; it is not proof of a local file's age or recoverability.
7. Make journal migrations backward-readable during rollout. Rollback must not lose the index of newly saved files or forget tombstones. Integrate with `lib/appUpdate.ts`: a safe application reload must not interrupt an uncommitted capture transition simply because the user has left the recorder route. Committed queue work must resume after reload.

**Pass condition:** Discard/Delete during transfer, then process death and reopen, cannot restart uploads or regenerate notes for the deleted lecture; failed remote cleanup stays visible to the cleanup process.

## Step 10 — Add and verify background transport

**Intermediate release:** the installed Expo FileSystem legacy implementation already uses file-backed iOS background URLSession uploads. It can replace XHR without adding a native module if the shipped runtime contains the required API. Use binary file upload, persistent journal state, finite resource/retry policies, and reconcile completion after foregrounding. [Expo SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem-legacy/).

**Full native lifecycle:** the installed implementation uses a random background session identifier and in-memory task mappings. For reliable process-relaunch reconciliation, use a native uploader with a stable session identifier, persistent task-to-part identity, discovery of existing tasks, and durable completion receipts. Do not edit `node_modules` as the maintained solution; use an appropriate supported module or a repository-owned Expo module/config plugin. Native interface changes require a compatible new binary.

1. Reattach existing transfers before scheduling duplicates on launch. JS and native code must not independently overwrite one journal snapshot; define which component owns transfer state and merge native receipts idempotently.
2. Validate file/keychain accessibility while locked after first unlock and after a device reboot. The existing session fix is useful but does not guarantee network access or background execution.
3. Background uploads cannot finish a recording file or rotate the microphone. Test the native recorder's cache location, finalization, five-minute rotation, and duration limit under background conditions. If JavaScript rotation fails the test, implement native-managed persistent capture/segmentation as part of the binary work.
4. Distinguish suspension, OS termination, and user force-quit in testing and copy. Apple cancels background transfers after user force-quit and does not automatically relaunch the app; retained finalized files should retry when the owner reopens it. [Apple background sessions](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background%28withidentifier%3A%29).
5. Use upload-from-file tasks for background transfer. Apple documents that data/stream uploads do not provide the same after-exit behavior. [Apple background transfer guidance](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background).
6. Test Android separately if shipping this feature there. Passing iOS tests does not establish Android process/foreground-service behavior. Web recording is currently unsupported; guard native journal/transport imports appropriately.

**Pass condition:** the physical-device matrix passes for every promised platform state. Document the current unfinalized chunk as a separate capture risk; do not advertise absolute zero-loss or a five-minute maximum without evidence.

## Step 11 — Run the release gates

Implement tests alongside the relevant changes. Extract lifecycle/reconciliation logic into testable modules rather than only checking source strings or mirroring implementation details.

| Test | Required invariant |
|---|---|
| Stop during rotate, double Stop, Pause→Resume/Stop | One finalization; identity/count correct; no premature navigation |
| Failure after each file/journal write | Last valid manifest survives; completed audio is discoverable |
| Offline/session unavailable at chunk close | Local save succeeds; account-bound work waits |
| Reconnect after offline launch | Worker wakes without opening the lecture |
| PUT succeeds but response/ack is lost | Reconciliation recognizes success before retry |
| AI dispatch timeout/429 | Later audio still uploads; processing retries separately |
| Ready/failed parent, no segment row, >5 lectures | Eligible work is not excluded or starved |
| Same part retried by two triggers | Single worker/claim; immutable bytes; no duplicate charge |
| Silent recovered part | Missing count decreases without unnecessary notes regeneration |
| Notes generation overlaps recovery | Revision check prevents stale completion |
| Delete/Discard races a transfer | Tombstone wins; late bytes are cleaned up |
| Switch accounts with backlog | No upload under the new account; owner data stays isolated |
| Legacy/null/corrupt files | Safe import or visible quarantine; no guessed ownership |
| Low disk, microphone interruption, cache loss | Explicit capture error; no false saved/complete state |
| Long recording, lock, airplane mode, OS termination, force-quit/reopen | Finalized parts reconcile; actual duration/sequence checked |
| Old client plus new server; old compatible runtime | No protocol regression or unsupported native call |

Use the repository's existing Deno configuration for pure client logic. Representative commands, to run after the proposed test files exist:

```bash
npx tsc --noEmit
~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lectureJournal.test.ts lib/lectureReconciliation.test.ts lib/lectureLifecycle.test.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-transcribe/index.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-study-kit/index.ts
deno check --node-modules-dir=none --no-lock supabase/functions/lecture-retention/index.ts
npm run build:web
```

Check only changed functions as needed; run broader existing checks when shared changes justify them. Use `supabase/tests/` for migration regression cases against an isolated test database. Do not run mutation fixtures against production. Preserve the existing Deno configuration approach so tests do not rewrite React Native's `node_modules`.

Physical-device evidence must include actual captured duration, number of finalized files, server-received parts, final transcript/notes state, and installed build/update identity. Use spoken sequential markers/timecodes and silence fixtures to detect missing or duplicate boundaries. Repeat the rotation/Stop boundary across at least 20 controlled attempts, test a full-length recording, and cover the oldest supported iOS/device class plus a current supported device in a release build. A green unit test or successful web build is not evidence of background recording reliability.

## Step 12 — Release in order and monitor the outcome

1. Review the diff and test evidence. Deploy additive, backward-compatible server contracts/completeness fixes first, then verify them with existing clients. Use the next available migration number; do not assume 140 will still be unused.
2. Confirm the lecture-transcribe, study-kit, and retention authentication settings allow their intended scheduler requests and still reject unauthorized requests. Repair the stale deploy checklist as part of the implementation.
3. Ship the journal/lifecycle/recovery/UI release to a controlled preview cohort. Steps 1–9 are primarily application/server work, but OTA eligibility depends on the actual native fingerprint. The app uses `runtimeVersion.policy='fingerprint'` and checks updates on load.
4. Verify effective preview channel routing: `eas.json` defines preview and production, while `app.json` explicitly contains a production update request header. Inspect the generated build/update configuration instead of assuming a profile name guarantees isolation.
5. Promote only a runtime-compatible OTA. Changes to native code/modules or their interface require a new binary; never force an old runtime to accept an incompatible update. [Expo runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).
6. Release the native transport/capture changes through a tested binary when needed. Confirm journal compatibility across upgrade, fallback, and rollback. Do not use a marketing-site deployment to distribute a native recording fix.
7. Recover legacy files after the new worker is verified, beginning with controlled affected-device testing. Monitor by installed update ID so healthy old/new traffic is not mixed.
8. Before broad rollout, require all deterministic regression tests to pass, no false completion in the fault matrix, no cross-account/deletion resurrection, and no unresolved finalized-file loss in device testing. A finite test suite supports a release decision; it does not prove failure is impossible.
9. Monitor transfer failure stages, oldest pending local work when devices report it, missing-part counts, recovered parts, stale-note age, failed function responses, duplicate processing cost, crashes, and journal errors. Compare only known-finalized parts when measuring delivery; offline devices cannot report immediately.
10. Treat queue corruption, owner mismatch, unexpected deletion, or new finalized-file loss as rollout-stopping defects. Pause new transport scheduling while retaining capture/journal and recovery-readable data. Roll back code compatibly; do not erase journals or reverse additive database columns to hide a failure.

**Completion evidence:** the intended versions are installed, eligible legacy audio has been recovered or explicitly classified, new finalized parts pass the failure matrix, partial lectures remain honestly labeled, and no growing eligible backlog appears in the observed rollout cohort.

## What the owner needs to provide during implementation

The investigation and plan required no new credentials. Physical-device verification needs a test iPhone and, for historical recovery, access through the affected user's signed-in app. Native releases need the existing EAS/App Store access if it is unavailable in the implementation environment. Credentials should be supplied through the normal sign-in flow, not pasted into chat. This report does not authorize contacting affected students or claim access to their phones.

The recommended first implementation milestone is Steps 1–3 with their regression tests, while Step 7's completeness correction and Step 8's truthful messaging are prepared in parallel. The next milestone is safe transfer/recovery/deletion, followed by the validated background/native release. Mounting one component or switching upload APIs alone is not completion of this plan.
