# Record Lecture — verified report, market research, and completion plan

Prepared 2026-09-16. Supersedes `lecture-recording-audit-2026-09-16.md` (first pass) and the unexecuted plan in `lecture-audio-fix-plan-2026-09-14.md`. The plan in Part 3 was revised after an independent adversarial review.

Everything here was read-only. Nothing was changed, deployed, committed or sent anywhere.

## How this was verified

- **First pass:** code on `main` (what students run), the native expo-audio source, and 7 days of production data.
- **Second pass, three independent tracks:**
  - the recorder lifecycle and its edge cases;
  - everything after capture (screens, server, notes, security);
  - a lecture-by-lecture reconstruction of every recording this week from events, part rows, Groq logs, cron runs and storage.
- **Technical track:** researched the correct recording architecture (Apple and Android rules, expo-audio source and changelog, libraries).
- **Market tracks:** two covered competitors — student lecture apps, and the big transcription products.
- **Final check:** every headline claim was re-checked against the code and the live database before it went into this report.

**On "never worry about it again":** no software can promise zero issues forever. iOS updates, new phones and new app versions keep changing the ground. This plan does two things:
1. Removes every defect found today.
2. Adds automatic health checks, so any new failure shows up in the owner's alerts within a day instead of in a student's lost lecture.

The second part is what makes "done" stay done.

---

# PART 1 — What is wrong (verified)

## The headline

**Only 8 of the 17 finished recordings this week (47%) captured the whole class and delivered all of it.**
- 3 had small gaps or lost parts.
- 6 were badly broken:
  - 3 lost 40–56% of the class;
  - 2 died for good at 5:00;
  - 1 ran away across two days.
- A 19th recording (c1c66744, started 10:08 today) has produced no audio since 10:58 and was never saved. It is almost certainly a dead recorder right now.
- On top of that, **13 of 20 note sets are cut off at exactly 12,000 characters**, including every recording over 38 minutes and both document imports.
- Transcription (Groq) and notes generation (OpenAI) are healthy:

| Service | Calls | Failures | Median | p95 |
|---|---|---|---|---|
| Groq transcription | 147 | 0 | 1.2 s | 3.1 s |
| OpenAI notes | 33 | 0 | 18 s | 44 s |

- **The losses happen on the phone and in our own caps, not at the providers.**

| Lecture | App | Result | Cause |
|---|---|---|---|
| 7cb3877f, 01ae7190, c97c76b1, 09a4831d, 6a4b7201, 91965b5d, 913b3781, f0056f8c | 1.13/1.7/1.14 | Full | — (f0056f8c's Save hung 3 min on a transcribe call) |
| 85d74b59 | 1.12 | 2 parts lost | Signed out on a locked phone; parts never retried |
| b522f1a0 | 1.14 | ~1.5 min gap | Mic died at a 5-min boundary (39:58) |
| e60cf6ba | 1.7 | ~4 min gap | Mic died at a boundary (44:58) |
| 644aeee6 | 1.14 | 23 min lost | Mic died at 5:00, back only when the app reopened |
| 04cd64e7 | 1.14 | 26 of 46 min lost | Locked phone: mic died at 5:02, signed-out parts lost, app killed |
| 09e936c7 | 1.7 | ~39 min lost | Mic died mid-part (178 s) with no event; an empty part followed |
| 25d20046, 130e778d | 1.14 | Died at 5:00 | Same student twice. They stopped using that phone for lectures |
| e3c08b90 | 1.12 | Runaway, 34 h | Never stopped; captured overnight at random until the fake timer hit 90 min |

By app version: 1.13 was 4/4 full; 1.7 was 3/5; 1.14 was 1/6; 1.12 was 0/2.

The recorder code is identical in every version. The difference is how each student used the phone: every recording with evidence of a locked or backgrounded phone failed at a boundary.

## Master issue list

Each issue has an ID the plan refers to. Severity reflects student impact.

### A. Capture (the microphone side)

| ID | Sev | Issue | Evidence |
|---|---|---|---|
| C1 | CRITICAL | **The 5-minute part change restarts the microphone, and iOS refuses to restart it on a locked or backgrounded phone.** Apple: recording "must begin when the app is in the foreground", and once recording stops, a background app is suspended. Capture dies until the student reopens the app. | `lib/lectureRecorder.ts` `rotateSegment` (stop→prepare→record). All 6 `interrupted` events fell at 5:00/5:00/5:00/5:02/39:58/44:58. Apple forums 751866, 760896, 813278 |
| C2 | CRITICAL | **The timer lies.** expo-audio ignores `record()`'s success flag and counts wall-clock time, not captured audio. The screen keeps counting on a dead mic, parts called "300 s" contain 0 s, and the 90-min cap counts phantom time. | `node_modules/expo-audio/ios/AudioRecorder.swift:49-66,102-119`. Groq measured 0 s on 09e936c7#8 and e3c08b90#5 |
| C3 | HIGH | **Any other audio stops the recording on a locked phone:** a video, a call, Siri, an alarm. The session is `doNotMix`, and the app's 250 ms poll stops the paused recorder, defeating expo-audio's own resume. | `lectureRecorder.ts:126,549-556`; `AudioModule.swift:383-418` |
| C4 | HIGH | **The mic can die mid-part with no event and nothing notices.** Detection relies on `isRecording`, which reports expo's bookkeeping, not the real recorder. | 09e936c7 part 6 ended at 178 s; `AudioRecorder.swift:155` |
| C5 | HIGH | **Runaway recording.** No wall-clock limit. A never-stopped recording captured audio at 18:50, 22:15, 06:41, 13:52 and 17:47, then auto-saved at 00:51 two days later. This is a privacy problem as well as a garbage lecture. | e3c08b90 event timeline |
| C6 | HIGH | **Some navigation silently closes the recorder mid-lecture.** Tapping a push type the build doesn't know (e.g. the weekly digest) or a signed-out redirect replaces the screen, and the recorder unmounts and stops. The live part stays in Caches, never uploaded, and the lecture row is stuck `recording`. | `app/_layout.tsx:1053` (`replace`), `:935`; `lib/pushRouting.ts:122,129` |
| C7 | HIGH | **An app update can restart the app during a lecture.** The reload guard protects only the recorder's route. Opening any other screen on top (e.g. a "notes ready" push) makes the next foreground reload the app. 17 automatic reloads happened in 7 days. | `lib/appUpdate.ts:48-61`; `components/AppUpdateGate.tsx:187-192` |
| C8 | HIGH | **AirPods, headsets and car Bluetooth take over as the mic.** The narrowband mic sits near the student, not the lecturer. Nothing pins the built-in mic. | `AudioModule.swift:563-570` (`allowBluetoothHFP`) |
| C9 | HIGH (dormant) | **Android background recording is broken.** Recorders pause in background, and a restart from background is forbidden on Android 12+/14. The notification's Stop doesn't actually stop. The + menu offers recording on Android. | `expo-audio/android/.../AudioModule.kt:217-233`, `AudioRecordingService.kt:51,116-121,143-149` |
| C10 | MEDIUM | **Pause→Resume→Pause quickly leaves the mic live while the screen says "Paused".** The break is recorded, then thrown away. | `lectureRecorder.ts:267,402-421,430` |
| C11 | MEDIUM | **Stop right after Pause loses the last part.** `stop()` only rotates when the phase is `recording`. On the branch, offline, the part can land in `lectures/null/`, which recovery ignores. | `lectureRecorder.ts:430`; branch `:504,:527,:596` |
| C12 | MEDIUM | **The media-services-reset handler can never fire:** native hardcodes `false`. | `AudioRecorder.swift:157`; `lectureRecorder.ts:572-581` |
| C13 | MEDIUM | **Capture failures are invisible.** These have no event: rotation failure, file move failure, finish/finalize failure, resume failure, keep-awake failure, discard purge failure. 23 upload failures carry an empty code. `recorder.error` is never shown. | `lectureRecorder.ts:194,305,470` |
| C14 | LOW | **A start failure from an expired session** shows English "Invalid or expired session" with no sign-in prompt. | 09-14 09:48 device f82690b6 |
| C15 | PRODUCT | **90-minute hard cap.** Labs and seminars run 2–3 h; Goodnotes transcribes up to 3 h. | `lectureRecordingOptions.ts` `MAX_RECORDING_SECONDS` |

### B. Getting audio to the server

| ID | Sev | Issue | Evidence |
|---|---|---|---|
| U1 | HIGH | **A part that fails while signed out leaves no server row and is never retried.** The local file is forgotten. | `lib/lectures.ts uploadSegment` (session before row). 04cd64e7 parts 0 and 5, 85d74b59 parts 5 and 7 |
| U2 | HIGH | **Each upload waits on the transcribe call, which has no timeout.** One hung call (23 min while suspended) blocks every later part and Save. | f0056f8c Save hung 3 m 16 s; 644aeee6 |
| U3 | MEDIUM | **Local audio can stay on the phone forever** (Documents, backed up to iCloud) when a part never uploads. That contradicts the privacy policy and consent sheet ("deleted automatically"). | `lectureRecorder.ts:241`; `privacy/page.tsx:66,192`; `LectureConsentSheet.tsx:78` |
| U4 | MEDIUM | **After Stop, uploads only run while the app is open.** "Semora keeps uploading if you leave" is not true once the app is backgrounded. | `record.tsx` finishing note |
| U5 | LOW (security) | **`storage_path` is client-written and unchecked.** A crafted request could make cancel/retention delete another user's audio path. 0 of 380 paths are bad today. | `lecture-transcribe/index.ts:495-502,1043-1061` |
| U6 | HIGH | **A recording the phone never finished waits 3 quiet hours** before the server completes it. Notes arrive 3.5 h late (130e778d). | migration 138 abandon rule |
| U7 | — | **Unshipped branch defects** (must be fixed before reuse). 7a: lecture folders are never cleaned, so recovery rescans everything forever. 7b: recovery ignores the journal owner, so a second account on the phone retries the first account's parts forever. 7c: Discard during a rotation resurrects thrown-away audio. 7d: journal stores aren't serialized, so a part can be uploaded as 0 s. 7e: retries are unbounded. 7f: lifecycle tests test a model nothing imports. 7g: the hook reads the lecture id after awaits. | branch `codex/lecture-audio-phase-1` |

### C. Transcription (server)

| ID | Sev | Issue | Evidence |
|---|---|---|---|
| S1 | HIGH (latent) | **A Groq 5xx, network error or hang permanently fails a part,** and there's no fetch timeout. About 30 min of Groq outage uses all 3 recovery attempts, then the audio is deleted. A call killed at 150 s stays `transcribing` forever with its audio kept forever. | `lecture-transcribe/index.ts:808-810,986`; `_shared/ai.ts` (no AbortSignal) |
| S2 | MEDIUM | **A Pro subscription lapsing mid-lecture** makes every later part 402, the lecture is marked failed, and the audio is kept forever. | `index.ts:606-614` |
| S3 | MEDIUM | **Silence becomes invented text.** Parts with 0–4 s of speech returned 9–19 chars; 300 s silent parts returned ~1,000 chars (09e936c7#9, f0056f8c#1). | Groq usage rows |
| S4 | HIGH | **Transcripts assembled by the SQL paths join parts with a space and no gap markers,** so the notes model stitches across missing minutes. The prompt's "don't invent across marked gaps" rule never fires. | migration 138 lines 353/449/539; `index.ts:1236-1246` |
| S5 | LOW-MED | **Transcription language is forced to the app's language**, and cron recovery always uses English. A Spanish-UI student in an English class, a mixed-language class, or any Spanish recovery gets garbage. | `index.ts:225,773,955` |
| S6 | LOW | **The boundary-word hint is skipped after a gap.** | `index.ts:740-751` |
| S7 | MEDIUM | **The daily cap meters reservations, not real audio.** Nothing stops a busy day passing Groq's 28,800 s/day, 2,000 requests/day or 20 requests/min, which are org-wide on the free tier. | `lecture_quota_day`; Groq rate-limit docs |
| S8 | LOW | **`duration_seconds` undercounts** when parts fail or are silent (04cd64e7 shows 1,200 s of 46 min). | — |
| S9 | LOW | **Tail losses where Stop never reached the server aren't counted as missing.** Parts refused by the 90-min cap count as missing forever. | migration 138/140 |

### D. Notes, quiz, flashcards

| ID | Sev | Issue | Evidence |
|---|---|---|---|
| N1 | CRITICAL | **Notes are cut at 12,000 characters.** The model writes ~27k; our code slices it. The end of class, Key terms and Action items (deadlines) are lost. **13 of 20 note sets.** | `lecture-study-kit/index.ts:36,396,560` |
| N2 | MEDIUM | **Transcript input to notes is cut at 80,000 chars.** Longest this week was 62.8k; dense lectures project to ~96k at 90 min, and far more at 3 h. | `study-kit:28,455` |
| N3 | QUALITY | **Notes are one pass over the whole transcript.** No sections, no timestamps, no link back to the transcript. Will not scale to 3 h. | — |
| N4 | MEDIUM | **A free student's one action is charged before notes are written** (documents), and not refunded on failure; retry then says "free action used". | `study-kit:351,385` |
| N5 | MEDIUM | **Near-empty lectures sit in `transcribed` forever** with a "Writing notes" spinner, still charged. A free student's only lecture is one of them. If the phone's own notes call fails with anything but NOTES_FAILED, the spinner stays and there is no retry. | a946c6aa, a9e7da56, 364c3afd; `[id].tsx:436` |
| N6 | LOW | **Two concurrent notes requests both pay for a model call.** | `study-kit:367-378,414` |
| N7 | LOW | **`quiz_generating` is never reset by the server** (the app polls every 3 s forever). Quizzes and decks aren't rebuilt after notes refresh. | `lectures.ts:198` |
| N8 | MEDIUM | **No way to regenerate notes without a push.** The only path sends an untrue "rest of your recording arrived" push. | `study-kit:509` |
| N9 | MEDIUM | **When the phone's notes request fails** (signed out), notes wait on cron: 25–47 min late. Missing-part lectures were only picked up when the student reopened them. | 85d74b59, c97c76b1, 09e936c7 |

### E. What the student sees

| ID | Sev | Issue |
|---|---|---|
| X1 | HIGH | **Lectures missing parts say "ready"** and the push says "Your lecture notes are ready". No incomplete warning is shipped. |
| X2 | HIGH | **"Recording resumed after an interruption. A short gap is marked" shows even when recording did not resume.** |
| X3 | MEDIUM | **"Semora keeps uploading if you leave" is untrue.** |
| X4 | MEDIUM | **"This recording didn't finish… your free lecture wasn't used"** appears after 15 quiet minutes on lectures the server keeps and charges. It offers only Delete and stops polling. 3 of 18 lectures hit this state this week. |
| X5 | LOW | **List pills ignore notes-done and stalled states; the list never polls.** |
| X6 | MEDIUM | **Most lecture strings are English in Spanish mode:** record screen, detail cards, busy messages, quiz and cards buttons, alerts, list pills, and the "N of M parts" pattern. |
| X7 | LOW | **Notes and transcript can't be copied, shared, exported or searched.** The 67k-char transcript renders as one `<Text>` (risk of clipped text on Android). Lectures can't be renamed. The course picker only shows the current semester. |
| X8 | MEDIUM | **No retry button after the phone's own notes or quiz call fails.** |
| X9 | MEDIUM | **Partial results reach no one.** All 3 server-finished lectures were never opened; the student had given up. |

### F. Release, monitoring, live state

| ID | Sev | Issue |
|---|---|---|
| R1 | CRITICAL (if applied) | **Unshipped migration 141 would delete the live "Your notes now cover the whole lecture" push.** It rewrites the function from an older copy: 0 references to it vs 4 in 138. Do not apply as written. Migration 140 is safe. |
| R2 | MEDIUM | **The "whole lecture" push doesn't check `parts_missing`,** so it can lie. |
| R3 | CRITICAL (rollout) | **8 of 18 recordings came from app 1.7/1.12.** 1.7 cannot receive OTA updates at all. 1.12 has its own OTA mailbox (a separate fingerprint), but no update has ever been published to it: its events carry no `bundle` tag. In practice, phone fixes reach these students only through an App Store update, or a separately built 1.12 OTA. Confirm 1.13 and 1.14 share one runtime before any Phase 2 publish. |
| R4 | HIGH | **Nothing alerts on audio loss.** 0 lecture `ops_alerts` in a week where 6 of 17 recordings lost ≥40%. Every cron reported "succeeded". |
| R5 | LIVE | **c1c66744 (started 10:08 today) has had no audio since 10:58 and no Save.** |
| R6 | TRUST | **Student 95c92b23 lost two lectures at 5:00 on 1.14** and moved to an old phone. That recording is R5. |

### G. Found by the independent plan review (not in the earlier passes)

| ID | Sev | Issue | Evidence |
|---|---|---|---|
| G1 | HIGH | **The server rejects any part over 12 MiB (~52 min at 32 kbps)**, marking it failed with `SEGMENT_NO_AUDIO`. | `lecture-transcribe/index.ts:94,762-766` |
| G2 | MEDIUM | **Parts are uploaded by reading the whole file into JS as base64.** Fine at 1.2 MB, but a memory-kill risk for any long part. | `lib/lectures.ts:331-336` |
| G3 | MEDIUM | **Groq's free tier also caps 7,200 audio-seconds per hour, org-wide.** | Groq rate-limit docs |
| G4 | MEDIUM | **Retry and claim limits are hardcoded in SQL** (`recovery_attempts < 3`, 10-min claim window, `p_max_attempts` 3), not only in the function. `callWithRetry` already makes 3 attempts per call with no overall deadline, against a 150 s platform limit. | migrations 127/139; `_shared/ai.ts:132-133` |
| G5 | MEDIUM | **The client-column trigger silently drops any column not on its allow-list**, and `updated_at` still bumps. A new client column (e.g. a heartbeat) would look like it works but never be stored. | `138_*.sql:200-222`; `065` updated_at trigger |
| G6 | MEDIUM | **Low storage mid-lecture:** the live part sits in Caches, which iOS can purge. Free space is checked only at start. | `lectureRecordingOptions.ts MIN_FREE_BYTES` |
| G7 | MEDIUM | **Battery:** no warning or safe save when the battery runs low during a long recording. | — |
| G8 | LOW | **Clock changes** (time zone, manual clock) can break any wall-clock limit that uses `Date.now()` alone. | — |
| G9 | MEDIUM | **Two devices on one account can record at once and both are charged**; nothing warns. | `lecture-transcribe/index.ts:76` |
| G10 | MEDIUM | **A quiet lecturer or a phone in a bag** gives a near-empty transcript with no warning during class. | — |
| G11 | MEDIUM | **Account deleted or session revoked mid-lecture:** queued retries must stop, not retry toward another account. | — |
| G12 | LOW | **VoiceOver:** recorder states and controls lack complete accessibility labels and announcements. | `app/lecture/record.tsx` |
| G13 | LOW | **Keyboard dictation inside Semora** takes the mic and interrupts Semora's own recording. | iOS audio session behavior |
| G14 | MEDIUM | **expo-audio's automatic resume after an interruption also restarts a recorder the student had paused** (mic live while the screen says Paused). | `AudioModule.swift:440-450` |
| G15 | MEDIUM | **The notes request waits 10–15 min after the last part** regardless of how the lecture ended. | `138_*.sql:631-640` |
| G16 | LOW | **The slowest notes call on record was 148.5 s,** right at the 150 s platform ceiling. Retries have no overall deadline. | `lecture-study-kit` comment; `_shared/ai.ts` |

**Checked and fine:**
- Row security on lecture tables, and a private, folder-scoped bucket.
- The free allowance can't be reset by deleting.
- Deletion cascades.
- Notes-ready push timing and language.
- The start funnel: 21 consents became 21 starts.
- No orphan audio in storage.
- Web recording is blocked everywhere.
- Swipe-dismiss is locked while live.
- Watch, widget and Siri can't open the recorder.
- The 32 kbps mono AAC format is fine for Whisper.
- Transcription and notes latency.

---

# PART 2 — Market research: how competitors do it

Sources are in the appendix. Findings verified as of September 2026.

## Who we compete with

| App | Strength | Weakness | Price |
|---|---|---|---|
| **Coconote** (bought by Quizlet, Feb 2026) | Record/PDF/video/links; notes, quizzes, flashcards, games, AI podcasts; iPhone, Watch, Mac, Android, web; 100+ languages | Reviews: "Recorded a whole 15 minute lecture and it saved 10 seconds", loses recordings off Wi-Fi, stops on phone calls | $9.99–$152.99; free ≈ one note |
| **Turbo AI** (TurboLearn) | Record + PDF/slides/YouTube; STEM formulas; chat; #28 Education | Upload stuck at 91%, "only uploaded 10 minutes", lost a 2-hour lab to a frozen button | $9.99/week–$119.99/yr; free 2 h/mo |
| **Notability** | Audio synced to handwriting (tap ink → hear it); star bookmarks; Learn: summaries, flashcards, 200-question quizzes | Live transcript Pro-only | $19.99–$99.99/yr |
| **Goodnotes** | Tap handwriting → jump to audio; free on-device transcription; summaries link back to the moment | Transcript stops at 3 h | ~$35.99/yr |
| **Genio Notes** (ex-Glean) | Timestamped labels, slides, live captions, LMS/LTI, disability-services market | New iPhone app 1.8★; "swiping out of the app while recording can corrupt a file" | £12/mo |
| **StudyFetch / Knowt / Mindgrasp** | Tutors, practice tests, shared libraries | Single language/speaker; billing complaints | $8–$25/mo |
| **Otter** | Records offline and caches, lock-screen pause/resume, live transcript, speaker labels | Tells users to "keep the app open until the recording finishes uploading"; 30-min free cap; consent class action | .edu $79.99/yr |
| **Apple Notes / Voice Memos** | Free, on-device, Live Activity, highlighted playback | 30–70 min recordings stuck on "Transcribing…"; "40 minutes recorded but only 2 minutes saved" | Free |

## Where they beat Semora today

1. **Recording survives a locked phone, other apps and calls,** with a Live Activity / Dynamic Island timer (Voice Memos, Otter, Notion, new small apps).
2. **Honest status:** Recording → Uploading x/y → Processing → Ready/Failed–Retry; failed audio kept for a week for retry (Notion).
3. **Tap notes or transcript to jump to that moment** (Goodnotes, Notability, Granola, Otter outline).
4. **Mark important during class** (Genio labels, Notability star).
5. **Notes in sections with timestamps** (Otter outline, map-reduce for long recordings).
6. **Chat with the lecture** (Coconote, Turbo, Jamworks).
7. **Import audio/video/slides, not just the mic** (Turbo, Coconote).
8. **Longer recordings:** 3 h+ (Goodnotes 3 h, Plaud 20 h).
9. **Photos of slides placed at their timestamp** (Genio).
10. **Search, copy, share, export** (Apple, Google Recorder, Word).
11. **Course vocabulary for accuracy:** Whisper prompt with terms plus the previous part's tail (OpenAI guidance).
12. **Silence filtering to stop invented text** (WhisperX, classroom study: 9.5% word error with VAD vs 30–39%).
13. **Lock-screen / Watch controls** (Otter, DictaWiz).

## Where every competitor is weak — Semora's opening

- **Nobody is trusted to never lose a lecture.** It is the #1 complaint for Coconote, Turbo, Genio, Otter and Apple Notes. **A visible "every minute saved" guarantee is the strongest possible position.**
- **Nobody connects a lecture to the student's real semester.** Semora already has courses, a class timetable (Canvas), tasks, grades and a Tutor. Only Semora can:
  - auto-file lectures to the right course;
  - remind the student to record when class starts;
  - turn "due Friday" / "on the exam" into tasks and exam dates;
  - build quizzes around upcoming exams;
  - let the Tutor answer across a whole semester of lectures.
- **Price:** every paid rival except Notability Plus costs more than $4.99/mo.
- **Spanish/English done right,** including mixed-language classes (StudyFetch forces one language).
- **Consent:** no student app handles recording consent. Semora already has a consent sheet.

## Transcription provider check

| Provider | Word error* | $/hour |
|---|---|---|
| ElevenLabs Scribe v2 | 2.2% | ~$0.22 |
| AssemblyAI Universal-3 Pro | 3.1% | $0.21 |
| OpenAI GPT-4o Transcribe | 4.0% | ~$0.36 |
| **Groq Whisper v3 Turbo (current)** | **4.6%** | **$0.04** |
| Deepgram Nova-3 | 5.2% | ~$0.26 |

\* Artificial Analysis leaderboard; not lecture-hall audio.

**Keep Groq.** Accuracy is within ~2 points of the leader at 5–9x lower cost. Its free tier is org-wide (8 audio-hours/day, 2,000 requests/day, 20/min), so moving to the paid Developer tier is what makes the feature scale. Evaluate Scribe v2 later only for mixed Spanish/English classes.

---

# PART 3 — The plan (revised after independent review)

This plan was reviewed adversarially against the code before it was finalized. The review found 3 blockers, 8 major and 6 minor problems in the first draft. All of them are corrected below. The review's checked facts are marked ✔.

## Architecture decision (verified)

**Replace "restart the mic every 5 minutes" with a native Semora recorder that turns the microphone on once and keeps the audio engine running until the student taps Stop — including while paused.**

- **iOS engine:** one `AVAudioEngine` input tap. Buffers are copied off the real-time thread to a serial queue that converts to 16 kHz mono and writes AAC `.m4a` in closed 2-minute chunks.
- **Android engine:** `AudioRecord` → `MediaCodec` → `MediaMuxer`, inside Semora's own microphone foreground service.
- **Guarantees:**
  - Nothing is ever *started* in the background, which is what iOS forbids.
  - Pause keeps the engine and session alive and discards buffers, so Resume is never a background start. The orange mic indicator therefore stays on while paused, and the screen says so.
  - A crash or kill loses at most the open chunk (≤2 min).
  - The recorder reports real captured seconds (frames ÷ sample rate).
  - Interruptions, engine configuration changes (route changes stop the engine), media-services resets and stalls are handled natively and reported honestly.
- **Why 2-minute chunks:** Groq's org-wide request limits (2,000/day, 20/min on free) and 10 s minimum billing. A 3-hour lecture stays at 90 requests.

**Alternatives rejected:**

| Option | Why not |
|---|---|
| Overlapping two expo recorders | Undocumented, still a background start, failures stay invisible |
| One continuous m4a | A kill loses everything |
| WAV/CAF | Too large, and Groq doesn't take CAF |
| Upgrading expo-audio | No SDK 54 fix; 58.x needs four SDK jumps and still ignores `record()`'s result |
| `react-native-audio-api` | Open interruption crash |
| `@siteed/audio-studio` | Streams through JS for hours |

This needs **a new App Store build and a new Play build (1.15).** A stopgap OTA for 1.13/1.14 ships first, and server fixes ship before either; they help every version.

## Owner decisions (recommended answers assumed)

| # | Decision | Recommended |
|---|---|---|
| D1 | Move Groq to the paid Developer tier (~$0.04/audio-hour) | **Yes — a hard prerequisite for Phase 2.** Free tier limits are org-wide: 28,800 s/day, **7,200 s/hour**, 2,000 requests/day, 20/min, 25 MB files |
| D2 | Raise the recording limit from 90 min to 3 h (native recorder only) | **Yes** |
| D3 | Tell 1.7/1.12 students to update, from the server at recording start, once 1.15 is live | **Yes** (step 1.10) |
| D4 | Hide Record on Android until the native Android recorder passes device tests | **Yes** |
| D5 | Optional "Keep audio for playback (30 days)", opt-in, with the EN+ES privacy policy updated first | **Yes, Phase 4**; the default stays "delete after transcription" |
| D6 | Regenerate the 13 truncated note sets without a push | **Yes**, after 1.1 and 1.11 deploy (a production write) |
| D7 | Contact students who lost audio this week | Owner's call; not required |

## Rules for every step

- **Production writes, migrations, deploys, OTA and App Store submissions each need the owner's explicit yes in its own sentence.** Commits and pushes too.
- **No production deletes.** Flag or orphan instead.
- **Each fix starts with a test that fails on today's code.**
- **Every migration is dry-run in a rolled-back transaction** on real rows.
- **Log checks use a 7-day window.**
- **Standing constraints to keep:**
  - the free allowance is charged when the first part transcribes;
  - recovery never waives the allowance;
  - `lecture_recordings` has no INSERT policy;
  - audio is deleted after transcription (published privacy promise).
- **Use the next free migration number.** Park 141 rather than reuse its number.

---

## PHASE 0 — Today

| Step | What | Fixes | Done when |
|---|---|---|---|
| 0.1 | **Follow c1c66744** read-only until it finishes. Confirm notes reach the student; note the 3 h wait (fixed by 1.8) | R5 | Explained or `ready` |
| 0.2 | **Park migration 141** in `supabase/migrations-held/` (as 108 was), so `supabase db push` cannot apply it | R1 | `supabase migration list` no longer shows 141 as pending |

## PHASE 1 — Server (every app version benefits)

One or more migrations plus `lecture-transcribe`, `lecture-study-kit` and `lecture-retention` deploys (`--no-verify-jwt` as today). Migration first, then functions. Update `DEPLOY_CHECKLIST.md`.

**1.1 Notes length** (N1, N2, G16)
- Raise `MAX_NOTES_CHARS` to 48,000; that matches `max_output_tokens` 12,000.
- Detect cut-off output from the API's `incomplete_details.reason === 'max_output_tokens'` (logged and alerted), not a guess.
- Confirm the notes model's real context window (`modelFor(AiTask.contentGeneration)`) before raising `MAX_TRANSCRIPT_CHARS`. Raise it to the largest safe value (target 200k) only if one call's worst-case time stays well under 150 s. Otherwise transcripts over the single-pass size go to step 3.1's sectioned notes.
- Give notes calls one overall deadline (≈120 s) instead of 3 unbounded attempts.
- **Test:** a 62k-char fixture gives notes >12k chars ending in Key terms; a forced max-tokens stop raises the alert.

**1.2 Provider failures and timeouts** (S1, G4)
- One deadline for the whole transcription call (≈110 s, 150 s platform limit); each retry is capped to the time left.
- 5xx, network errors and timeouts: part back to `uploaded`, recovery attempt refunded (like 429/503), backoff.
- A part becomes `failed` only after 6 retryable failures spread over ≥6 h, or a non-retryable 4xx.
- A `transcribing` claim older than 5 min is reclaimable.
- Change the SQL limits in the same migration: `recovery_attempts` bound and claim window in 139, `p_max_attempts` in 127/139.
- Retention eventually deletes audio of parts that are terminal or exhausted after the limit, so none is kept forever.
- **Test:** a simulated 3 h Groq 503 outage loses 0 parts; a 150 s kill is reclaimed.

**1.3 Silence and hallucination** (S3)
- The code already requests `verbose_json` ✔.
- Rebuild each part's text from Whisper segments that pass all of:
  - `no_speech_prob ≤ 0.6` or `avg_logprob ≥ -1.0`;
  - `compression_ratio ≤ 2.4`.

  Do not use `data.text`.
- Store `speech_seconds` = the sum of kept segment durations; Groq's `duration` is file length ✔.
- Store the dropped-segment count for monitoring.
- **Test:** fixtures like 09e936c7#8/#9 and f0056f8c#1 lose their invented text; a real speech part is unchanged.

**1.4 One transcript assembler** (S4, S6)
- A single SQL function used by `maybeFinalize`, the stall sweep and the rebuild.
- It inserts a gap marker (student's language) for every missing seq and every `has_gap`, and compares by words so notes aren't rewritten needlessly.
- The boundary-word hint for part N uses the nearest earlier `done` part's tail when part N−1 is missing.
- **Test:** seq 5 missing → a marker between 4 and 6 in all three paths.

**1.5 Rebuild 141 from the live definition** (R1, R2, X1-push)
- Start from `pg_get_functiondef` of the live `notify_lecture_notes_ready`, keeping both loops and `notes_refreshed_at`.
- Add "ready — N parts missing" wording to both loops. Send "covers the whole lecture" only when `parts_missing = 0`.
- Apply 140 with it (140 is safe ✔).
- **Test:** covers both loops; a dry run on 04cd64e7-style rows uses the missing-parts wording.

**1.6 Transcription language** (S5)
- Stop forcing the app locale.
- Detect language from the first part with ≥60 s of kept speech. Map Groq's language name to `en`/`es` only; anything else → the owner's profile language.
- Save it as `lecture_recordings.language`, used by later parts and recovery. Until detected, use `profiles.preferred_language`.
- If later parts detect a different language repeatedly (mixed class), keep per-part detection instead of locking.
- **Test:** a Spanish-UI account recording English → English transcript; cron recovery uses the saved language; a near-silent part 0 doesn't set the language.

**1.7 Charging and entitlement** (S2, N4, N5, N6, N7)
- (a) `start` stamps a server-only `authorized_pro_at` on Pro lectures. Only lectures with that stamp may finish after Pro lapses mid-lecture. This keeps the no-bypass rule: no stamp, no exemption.
- (b) Document notes charge only after the notes are saved.
- (c) Lectures with <10 s of `speech_seconds` or <200 chars finish as `NO_SPEECH`. The refund sets a status on the usage row that `free_action_used()` ignores; no row is deleted. The student is told no speech was detected. Their audio is deleted per policy.
- (d) The notes claim returns early when it matches nothing.
- (e) A server job resets `quiz_generating` older than 5 min.
- **Test:** one per case; a946c6aa/a9e7da56/364c3afd become NO_SPEECH in a dry run.

**1.8 Heartbeat and faster finish** (U6, N9, G5, G15)
- A `lecture_heartbeat(lecture_id, state)` RPC (`security definer`, owner check) writes `last_heartbeat_at` + `capture_state` (`recording`|`paused`). It does not go through a table update, which the client-column trigger would silently drop ✔.
- Finish rules:
  - Heartbeat-recording lectures finish after 30 min without a heartbeat.
  - Paused lectures keep the 12 h rule.
  - Lectures with zero parts are never marked failed for a stale heartbeat. They wait for the journal (the phone may be offline with audio).
  - The "notes ready" push for a lecture finished this way waits until the student has been gone 60 min.
- Notes are requested immediately at finish for heartbeat lectures (a change to `request_pending_lecture_notes`).
- Old clients keep today's rules.
- **Test:** a stale recording heartbeat at 31 min finalizes; paused doesn't; zero parts never fails; old-client rows are unchanged.

**1.9 Security and accounting** (U5, S7, S8, S9)
- (a) CHECK constraint on `storage_path` = `user_id/lecture_id/seg_NNN.m4a`. Validate first: 0 of 380 bad today ✔.
- (b) The daily ledger adds provider audio seconds at transcription, and alerts at 80% of the Groq daily and hourly caps.
- (c) `duration_seconds` = provider seconds of done parts + an estimated `missing_seconds`.
- (d) Parts refused by the length cap are labelled, not "missing".
- **Test:** 0 constraint violations; the ledger matches the Groq usage sum.

**1.10 Reach old phones** (R3, D3)
- ✔ The old apps show the server's error text in the "Couldn't start recording" alert.
- ✔ No app build sends a version header.
- Step 1: read the edge logs for the `User-Agent` of lecture calls (iOS usually sends `Semora/<build> CFNetwork…`). Map builds: 1.7 = 47, 1.12 = 56, 1.13 = 57, 1.14 = 58; confirm each.
- Step 2: the Phase 2 OTA adds an `x-semora-app-version` header.
- Step 3: after 1.15 is live in the App Store, `start` returns "Please update Semora from the App Store to record lectures reliably." for recognised builds below 1.15. Unrecognised or missing identity is **allowed, never blocked**.
- **Test:** a 1.12 build sees the message; unknown agents still start.

**1.11 Push-free notes rewrite** (N8, N7, D6)
- A `notes_rewrite_requested` flag handled by the notes cron: regenerate without a push, keep old notes visible until new ones land, and set a "quiz/deck out of date — rebuild" flag.
- The same flag is set on every notes refresh.
- Then, with the owner's yes, flag the 13 truncated lectures.
- **Test:** one dry-run rewrite; no push row.

**1.12 Lecture health monitor** (R4)
- An hourly check plus a nightly report into `ops_alerts`:
  - lectures with missing parts;
  - captured seconds vs heartbeat wall time below 95%;
  - runaway sessions (wall > recording limit + 30 min);
  - any state stuck > 1 h;
  - notes cut at max tokens;
  - a silence-filter spike;
  - Groq failure rate;
  - usage > 80% of daily/hourly caps.
- First confirm how `ops_alerts` reach the owner; wire delivery if they don't.
- **Test:** replaying this week's rows raises an alert for every broken lecture in the table.

**1.13 Accept long parts** (G1, prerequisite for 2.1)
- Raise `MAX_SEGMENT_BYTES` to 24 MiB (Groq free file limit 25 MB ✔; dev 100 MB).
- The 1.2 deadline scales with part size; confirm Groq handles a 90-min file well inside ≈110 s. If not, the stopgap caps a backgrounded part at the size that fits.
- **Test:** a 90-min 32 kbps fixture transcribes end to end.

## PHASE 2 — Phone stopgap (OTA to 1.13/1.14, JS only)

**Prerequisites:**
- D1 (paid Groq) done;
- 1.13, 1.8, 1.10 step 1 deployed;
- 1.13 and 1.14 confirmed on one runtime;
- publish from an isolated worktree.

**2.1 No part change while not active** (C1; trade-off stated)
- When AppState is not `active`, the current part keeps recording; no rotation.
- The part is cut only when AppState is `active` again, or at Stop. A cut already in progress aborts cleanly if AppState changes.
- **Trade-off, stated in the plan and to support:** if iOS kills the app while it is backgrounded, the whole backgrounded stretch is lost (an unfinished m4a is unplayable). Today it is lost anyway from the first 5-min boundary, so this is strictly better. The native recorder removes the risk.
- The journal records each part's start time, so a loss can be named exactly ("10:12–11:05 could not be saved").
- Spike: check whether ADTS `.aac` (crash-safe) is accepted by Groq; if yes, adopt it for background parts.
- **Device test:** locked 60 min → one continuous transcript; locked 90 min on a paid Groq org.

**2.2 Dead-mic detection** (C2, C4, X2)
- First a device spike: does the recording file grow steadily while writing?
- Signals, used together:
  - `recorder.currentTime` (the native AVAudioRecorder value) stops advancing;
  - metering pinned at −160 dB;
  - file size unchanged for 30 s.
- The on-screen timer and the 90-min cap use the sum of closed parts' native durations + `currentTime`, not wall clock.
- Foreground: restart and flag the gap.
- Background: record when capture died. On return, show "Recording stopped at 10:42. Continue recording / Save now".
- **Test:** another app grabs the mic → the timer freezes and the correct prompt shows.

**2.3 Interruptions** (C3, G13, G14)
- Use `interruptionMode: 'mixWithOthers'` ✔ supported, so videos and music in other apps don't stop capture. Calls, Siri, alarms, dictation and other recorders always interrupt.
- Never stop a paused recorder in the poll. Treat expo-audio's automatic resume (only on `shouldResume`) as best-effort, verified by 2.2's signals.
- If the student had paused before the interruption, re-pause after any automatic resume (expo restarts paused recorders ✔).
- The recorder screen notes that dictation interrupts recording.
- **Test:** YouTube while locked keeps capturing; a call while locked resumes or shows the honest prompt; paused stays paused.

**2.4 Wall-clock limit** (C5, G8)
- Store the session start time (`Date.now()`) and track elapsed with a monotonic clock while JS runs.
- On every foreground, if wall time since start exceeds the recording limit + 30 min, save the lecture and say "Your recording was saved at [time]". Never keep capturing across that limit.
- **Test:** a simulated 4 h session auto-saves; a clock change doesn't break it.

**2.5 Keep the built-in mic** (C8)
- After prepare, `setInput` to the built-in mic, found by name/uid (✔ `getAvailableInputs`/`setInput` exist; `type` is the raw port type).
- Check `getCurrentInput` every 5 s and re-apply; expo emits no route events ✔.
- Show "Using iPhone microphone". The full fix is in 3.2.
- **Test:** connect AirPods mid-lecture → the input returns to built-in within 5 s.

**2.6 Nothing closes or reloads the recorder** (C6, C7)
- While recording is live:
  - push taps use `push`, never `replace`;
  - the sign-in redirect is held until Stop;
  - app update reload is blocked by a module-level `recordingActive || uploadsPending` flag (not the route).
- `uploadsPending` stops blocking once parts are in "needs attention", so updates can't be blocked forever.
- **Test:** digest push, notes push, pending update and foreground cycle mid-lecture → recording continues.

**2.7 Pause/Resume/Stop race-proof** (C10, C11, U7g)
- One in-flight operation promise. Taps during a transition are ignored.
- Lecture id, seq and uri are captured before any await. Stop checks the native recorder in every phase.
- **Test:** 20 rapid sequences → correct part count, mic off whenever the screen says Paused.

**2.8 Upload pipeline** (U1, U2, U7a–f, G2, G11) — salvages the branch, with fixes:
- (a) delete a lecture's local folder once every part is confirmed done, or on delete/discard;
- (b) recovery processes only journals whose `ownerId` equals the signed-in user;
- (c) Discard waits for the in-flight rotation and writes the tombstone before and after;
- (d) one shared journal store per lecture (module singleton), so writes are serialized;
- (e) up to 10 attempts with backoff, then "needs attention" in the UI;
- (f) the transcribe nudge has a 30 s timeout and runs outside the upload chain;
- (g) row and path always use the journal's owner, never the current session;
- (h) upload with `FileSystem.uploadAsync` (binary PUT from file) instead of base64;
- (i) stop retrying permanently on account deleted, session revoked (403/permanent 401) or owner mismatch, keeping the files for that owner;
- (j) replace the lifecycle tests' unused model with tests of the real extracted controller the hook uses.
- **Test:** sign out mid-lecture then back in → all parts upload; switch accounts → no cross-upload; discard during rotation → nothing resurrects; 40 MB part → no memory spike.

**2.9 Local audio cleanup** (U3)
- Delete local parts once the server confirms a terminal state.
- At launch, sweep Caches `.m4a` orphans older than 24 h that no journal references.
- A part that can never upload is deleted 7 days after the queue first saw it, with a visible note.
- **Excluding files from iCloud backup is not possible from JS** ✔. It moves to 3.2.
- **Test:** after a full lecture, `documents/lectures/<id>` is gone.

**2.10 Heartbeat**
- Call `lecture_heartbeat` every 60 s while recording or paused (pairs with 1.8).
- **Test:** the server row updates each minute; paused state is recorded.

**2.11 Diagnostics** (C13)
- Every catch sends a stage + code, following the branch's `lectureFailure.ts` taxonomy.
- Add `lecture_app_backgrounded`/`foregrounded` during a recording, `lecture_capture_stalled` (seconds lost), and the `x-semora-app-version` header.
- No paths, URLs or text.
- **Test:** a forced failure at each stage emits the right stage.

**2.12 Honest screens in EN and ES** (X1–X6, X8, C14)
- Record screen states:
  - "Recording";
  - "Paused — microphone still on";
  - "Microphone stopped at hh:mm";
  - "Saved on this phone · N parts waiting";
  - "Sign in to finish uploading".
- Remove "keeps uploading if you leave".
- Detail screen:
  - an incomplete-notes banner;
  - stalled logic matching the server;
  - "Try again" after a phone-side notes/quiz failure;
  - "free lecture wasn't used" only when true;
  - slow polling instead of stopping.
- List: correct pills and polling.
- A 401 at start → "Please sign in again".
- All strings in `lib/i18n.ts` + `es.ts`, with a test that fails on hardcoded English in `app/lecture/*`.
- **Test:** EN/ES snapshots of every state; 8 of 10 parts never shows complete.

**2.13 Recovered-recording prompt** (U1, X9)
- At launch, if the journal has unfinished parts: "We saved 34 minutes from your 10:08 recording. Upload now / Discard". Name any unsaved stretch.
- **Test:** kill mid-lecture, relaunch → correct minutes.

**2.14 Hide Record on Android** (C9, D4)
- **Test:** no Record entry on the Android build.

**2.15 During-recording safeguards** (G6, G7, G9, G10, G12)
- Free storage re-checked every 5 min: warn under 300 MB, cut and upload the part in the foreground under 150 MB.
- Battery: warn at 10% unplugged; at 5%, cut the part if foreground, otherwise let the journal protect closed parts.
- Too quiet: metering below −45 dB for the first 60 s → "It's very quiet — move closer or take the phone out of your bag".
- Another device live: `start` returns the other live lecture → "You're already recording on another device".
- VoiceOver: labels and state announcements on every recorder control and state.
- **Test:** one each.

**Release gate for the OTA:**
- `tsc`, all unit tests and the i18n test green.
- On-device Release builds on an older and a current iPhone:
  - locked 60 min and locked 90 min;
  - 20 foreground boundaries;
  - YouTube while locked;
  - a call while locked;
  - AirPods mid-lecture;
  - pending update + push tap;
  - sign-out mid-lecture;
  - killed mid-lecture (verify the stated loss window);
  - offline the whole lecture;
  - low storage;
  - Pause ×20.
- Watch `lecture_capture_stalled` and the 1.12 monitor for 48 h.

## PHASE 3 — Native recorder (App Store + Play build 1.15)

**3.1 Sectioned notes (server, can ship first)** (N3, G16)
- Split at ~10-min part boundaries.
- One edge invocation per section, chained by cron with saved progress (no single call runs long). Each section gets a heading + time range.
- A final merge call writes the overview, Key terms and Action items. No truncation at any length.

**3.2 `modules/semora-recorder` (iOS)** (C1–C4, C8, C12, U3)
- Follows the pattern of `modules/semora-watch-bridge`.
- Started in the foreground only. The engine runs until Stop, and Pause discards buffers.
- Tap → serial queue → `AVAudioConverter` → `AVAudioFile` AAC, 120 s chunks. On iOS <18, finish a file by releasing the `AVAudioFile` object (`close()` is iOS 18+).
- Handles:
  - `AVAudioEngineConfigurationChange` (restart the engine);
  - interruptions;
  - `mediaServicesWereReset`;
  - stalls (no buffers for 5 s).
- If a restart fails in the background: emit `captureStopped` and post the local notification "Recording paused — tap to continue".
- Pins the built-in mic; uses `mixWithOthers`.
- Sets the excluded-from-backup flag on the lecture folder.
- Emits `chunkClosed(seq, uri, frames, seconds)`.

**3.3 Live Activity + Dynamic Island** (market)
- The app minimum is iOS 15.1 ✔; the widget target is iOS 17. Live Activity is guarded `@available(iOS 16.1)`, and the Stop/Mark buttons use `LiveActivityIntent` on iOS 17+. iOS 15–16.0 gets no Live Activity; the recording still works.
- Needs `NSSupportsLiveActivities`, shared ActivityAttributes between the app and `targets/widget`, and start/update from the native module.
- Shows real timer, saved minutes and a paused/stopped state.
- Adopt `AudioRecordingIntent` on iOS 18+.

**3.4 Background uploads after Stop** (U4, X3)
- A fixed-identifier `URLSession` background configuration in the module, recreated at launch and uploading from files.
- It fetches a fresh signed upload URL before each task (URLs expire in 2 h) and reconciles results into the journal.
- During recording, chunks upload in the foreground as they close.

**3.5 JS integration and the 3-hour limit** (C15, D2)
- `useLectureRecorder` wraps the module; the 2.8 queue is unchanged.
- To reach 3 h, change **all** of these together, with D1:
  - client `MAX_RECORDING_SECONDS`;
  - server `MAX_LECTURE_SECONDS` (`index.ts:51`);
  - the start reservation and `LECTURE_DAILY_AUDIO_SECONDS` capacity secret (a 3 h reservation of 10,800 s would otherwise allow only 2 concurrent lectures app-wide);
  - `STALE_RESERVATION_MINUTES` (180);
  - the sweep's 2 h/3 h rules (138:434-442, 521);
  - the runaway alert threshold (1.12);
  - the seq limit (200 is enough for 90 chunks ✔; leave it).

**3.6 Android recorder** (C9)
- `AudioRecord` → `MediaCodec` AAC → `MediaMuxer` 120 s chunks in Semora's own foreground service (type microphone), started from the visible activity and held until Stop.
- The notification's Stop/Pause route to JS; audio focus loss is handled.
- Record re-enabled only after the Android matrix passes.

**3.7 Watch control**
- Start, stop and mark important from the Watch via `semora-watch-bridge`.

**3.8 Release**
- Local build (`scripts/build-ios-local.sh`, `--clean` prebuild) and full device matrix.
- Review notes for background audio + Live Activity.
- After it's live, enable 1.10's update message.

**Device matrix for 3.8** — record captured vs wall seconds and speak timecodes to check chunk continuity on every run:
1. Locked 180 min.
2. Call declined, answered, and to voicemail.
3. Siri, alarm, timer, keyboard dictation.
4. Video/music in another app.
5. FaceTime / another recorder.
6. AirPods connect and disconnect, wired headset, car Bluetooth.
7. Low Power Mode, hot device, <1 GB free.
8. Kill mid-chunk: prior chunks intact.
9. Offline the whole lecture, then online while locked.
10. Live Activity Stop from the lock screen and the Dynamic Island.
11. Pause ×20, including a locked Resume.
12. Account switch with a backlog.
13. Upgrade from 1.14 with a pending journal.
14. iOS 15/16 device without Live Activity.
15. Android 12/14/15 (Pixel + Samsung): screen off 180 min, Doze, battery saver, notifications denied, notification Stop.

## PHASE 4 — Best in market

| Step | Feature | Why it wins |
|---|---|---|
| 4.1 | **Course vocabulary in the Whisper prompt** (course name, key syllabus terms, previous tail; ≤224 tokens ✔) | Accuracy on course terms |
| 4.2 | **Segment timestamps saved; transcript shown as timestamped paragraphs; notes sections link to their moment** | Goodnotes/Otter parity |
| 4.3 | **Opt-in 30-day audio keep (D5)** with tap-to-listen; privacy policy EN+ES first | Notability/Apple parity without breaking the default promise |
| 4.4 | **Mark important** (app, Live Activity, Watch), highlighted in notes and weighted in quizzes | Genio/Notability parity, better integrated |
| 4.5 | **Snap slide/whiteboard photos at their timestamp;** OCR text goes to the notes | Genio parity |
| 4.6 | **"Due Friday" / "exam Oct 3" become one-tap Semora tasks and exam dates** | **Only Semora** |
| 4.7 | **Class-start reminder with one-tap Record filed to the course** (from the semester timetable/Canvas) | **Only Semora** |
| 4.8 | **Tutor answers across a lecture or a whole course's lectures,** with timestamp citations | Semester-wide chat |
| 4.9 | **Exam-aware quizzes and flashcards** (upcoming exams, weak grades) | **Only Semora** |
| 4.10 | **Search all lectures; copy/share/export (PDF, text); rename; move to any semester's course;** virtualized transcript | X7 + Apple/Google parity |
| 4.11 | **Import an audio/video file** through the same pipeline | Turbo/Coconote parity |
| 4.12 | **Blind test Groq vs ElevenLabs Scribe v2 on mixed Spanish/English fixtures;** route only mixed lectures if clearly better | Bilingual strength |

## PHASE 5 — Keeping it done (permanent)

1. **Weekly review of the 1.12 monitor.** Targets on the current app version:
   - **≥99% of recorded minutes captured and transcribed;**
   - **0 lectures stuck > 1 h;**
   - **0 notes cut at max tokens;**
   - **0 incomplete lectures without the banner.**
2. **Regression suites kept green:** journal/queue/recovery/lifecycle unit tests, SQL tests for each lecture migration, the i18n hardcoded-string test.
3. **Before every App Store build:** device matrix items 1, 2, 4, 6, 8, 10 (~45 min). Add to the next-build checklist.
4. **Each June:** full matrix on the new iOS beta.
5. **Monthly:** Groq usage vs caps; App Store reviews mentioning record/lecture.
6. **Remote kill switches:** background uploads, silence filter, sectioned notes, auto language detection — each can be turned off without an app update.

## Order and effort

| Order | Work | Ships via | Effort |
|---|---|---|---|
| 1 | Phase 0 | file move | 1 h |
| 2 | D1 (paid Groq) + Phase 1 | migrations + function deploys | 4–5 days |
| 3 | Phase 2 | OTA to 1.13/1.14 | 7–10 days incl. device tests |
| 4 | Phase 3 (3.1 first) | App Store + Play 1.15 | 3–4 weeks incl. review |
| 5 | Phase 4 | server + OTA + builds | 4–6 weeks, interleaved |
| 6 | Phase 5 | ongoing | — |

## Issue → step coverage

| Issue | Step(s) |
|---|---|
| C1 | 2.1, 3.2 |
| C2 | 2.2, 3.2 |
| C3 | 2.3, 3.2 |
| C4 | 2.2, 3.2 |
| C5 | 2.4 |
| C6 | 2.6 |
| C7 | 2.6 |
| C8 | 2.5, 3.2 |
| C9 | 2.14, 3.6 |
| C10 | 2.7 |
| C11 | 2.7 |
| C12 | 3.2 |
| C13 | 2.11 |
| C14 | 2.12 |
| C15 | 3.5 |
| U1 | 2.8, 2.13 |
| U2 | 2.8f |
| U3 | 2.9, 3.2 |
| U4 | 3.4 |
| U5 | 1.9a |
| U6 | 1.8, 2.10 |
| U7a–g | 2.8a–j, 2.7 |
| S1 | 1.2 |
| S2 | 1.7a, 1.2 (audio retention) |
| S3 | 1.3 |
| S4 | 1.4 |
| S5 | 1.6 |
| S6 | 1.4 |
| S7 | 1.9b, D1 |
| S8 | 1.9c |
| S9 | 1.9d |
| N1 | 1.1, 3.1 |
| N2 | 1.1, 3.1 |
| N3 | 3.1 |
| N4 | 1.7b |
| N5 | 1.7c, 2.12 |
| N6 | 1.7d |
| N7 | 1.7e, 1.11 |
| N8 | 1.11 |
| N9 | 1.8 |
| X1 | 1.5, 2.12 |
| X2 | 2.2, 2.12 |
| X3 | 2.12, 3.4 |
| X4 | 2.12 |
| X5 | 2.12 |
| X6 | 2.12 |
| X7 | 4.10 |
| X8 | 2.12 |
| X9 | 2.13, 1.5 |
| R1 | 0.2, 1.5 |
| R2 | 1.5 |
| R3 | 1.10, 3.8 |
| R4 | 1.12, Phase 5 |
| R5 | 0.1 |
| R6 | D7 |
| G1 | 1.13 |
| G2 | 2.8h |
| G3 | D1, 1.9b |
| G4 | 1.2 |
| G5 | 1.8 |
| G6 | 2.15 |
| G7 | 2.15 |
| G8 | 2.4 |
| G9 | 2.15 |
| G10 | 2.15 |
| G11 | 2.8i |
| G12 | 2.15 |
| G13 | 2.3 |
| G14 | 2.3 |
| G15 | 1.8 |
| G16 | 1.1, 3.1 |

---

## Appendix — sources

**Apple and platform:**
- [developer.apple.com/forums/thread/751866](https://developer.apple.com/forums/thread/751866) ("recording must begin when the app is in the foreground")
- [developer.apple.com/forums/thread/760896](https://developer.apple.com/forums/thread/760896)
- [developer.apple.com/forums/thread/813278](https://developer.apple.com/forums/thread/813278)
- [developer.apple.com/forums/thread/805735](https://developer.apple.com/forums/thread/805735)
- [AudioRecordingIntent](https://developer.apple.com/documentation/appintents/audiorecordingintent)
- [isDiscretionary](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/isdiscretionary)
- [Audio guidelines by app type](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioGuidelinesByAppType/AudioGuidelinesByAppType.html)
- [Android FGS background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android 14 FGS types](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [expo-audio CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md)
- [react-native-audio-api #1013](https://github.com/software-mansion/react-native-audio-api/issues/1013)

**Transcription:**
- [Groq speech-to-text](https://console.groq.com/docs/speech-to-text)
- [Groq rate limits](https://console.groq.com/docs/rate-limits)
- [Groq whisper-large-v3-turbo](https://console.groq.com/docs/model/whisper-large-v3-turbo)
- [Artificial Analysis STT leaderboard](https://artificialanalysis.ai/speech-to-text)
- [OpenAI speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Whisper prompting cookbook](https://cookbook.openai.com/examples/whisper_correct_misspelling)
- [WhisperX](https://arxiv.org/pdf/2303.00747)
- [Whisper hallucination on silence](https://arxiv.org/pdf/2501.11378)
- [Classroom ASR study](https://papers.academic-conferences.org/index.php/icair/article/download/4277/3938/15736)
- [Summarization strategies](https://galileo.ai/blog/llm-summarization-strategies)

**Competitors:**
- Coconote: [App Store](https://apps.apple.com/us/app/coconote-ai-note-taker/id6479320349), [reviews](https://justuseapp.com/en/app/6479320349/ai-note-taker-coconote/reviews), [Quizlet acquisition](https://www.prnewswire.com/news-releases/quizlet-supercharges-studying-with-new-product-innovations-and-strategic-acquisition-302679622.html)
- Turbo AI: [App Store](https://apps.apple.com/us/app/turbo-ai-learn-faster/id6502794561), [reviews](https://justuseapp.com/en/app/6502794561/turbolearn-ai-note-taker/reviews)
- Notability: [audio recording guide](https://blog.notability.com/post/become-an-audio-pro-how-to-record-lectures-in-notability), [Notability Learn](https://support.gingerlabs.com/hc/en-us/articles/8073483239834-Notability-Learn)
- Goodnotes: [audio recording](https://www.goodnotes.com/features/audio-recording), [transcription FAQ](https://support.goodnotes.com/hc/en-us/articles/10234247292303-Audio-Transcription-FAQs)
- Genio: [App Store](https://apps.apple.com/us/app/genio-notes/id6758772863), [pricing](https://genio.co/pricing/individuals)
- Otter: [troubleshooting](https://help.otter.ai/hc/en-us/articles/4403627500951-Troubleshooting-audio-problems), [pause/resume/upload](https://help.otter.ai/hc/en-us/articles/40917035359255-Otter-Recording-Best-Practices-Pause-Resume-and-Upload), [consent lawsuit (NPR)](https://www.npr.org/2025/08/15/g-s1-83087/otter-ai-transcription-class-action-lawsuit)
- Notion: [AI meeting notes](https://www.notion.com/help/ai-meeting-notes)
- Granola: [AI-enhanced notes](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes)
- Apple Notes transcription complaints: [discussions.apple.com/thread/255824109](https://discussions.apple.com/thread/255824109)
- Voice Memos lost recording: [discussions.apple.com/thread/253676277](https://discussions.apple.com/thread/253676277)
- Plaud: [offline use](https://support.plaud.ai/hc/en-us/articles/53771056805785-Does-Plaud-NotePin-S-work-offline)
- Recording consent: [RecordingLaw two-party consent states](https://www.recordinglaw.com/party-two-party-consent-states/)
