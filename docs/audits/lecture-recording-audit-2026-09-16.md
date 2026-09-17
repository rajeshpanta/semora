# Record Lecture — full audit, 2026-09-16

Scope: only the Record Lecture feature (capture → upload → transcribe → notes → what the student sees).
Evidence window: the last 7 days of production data (read-only queries; nothing was changed).

## What production is actually running

- Server: migrations up to **139** applied; `lecture-transcribe` v26, `lecture-study-kit` v21, `lecture-retention` v8. All four lecture crons succeed.
- Phone: **none of the 09-14 branch work (`codex/lecture-audio-phase-1`) has shipped.** No lecture OTA since then; migrations 140/141 are not applied.
- **7 of 15 recording starts this week came from app 1.7 and 1.12.** Those phones carry no OTA `bundle` tag and cannot receive an OTA fix; only an App Store update reaches them.

## The week in numbers

- 18 recorded lectures. **4 lost parts** yet show `ready`: e3c08b90 (7 missing), 04cd64e7 (4), 85d74b59 (2), 09e936c7 (1).
- At least 2 more **lost most of the lecture without being counted as missing**: 25d20046 and 130e778d each stopped for good at 5:00. 644aeee6 lost ~23 minutes mid-lecture and reports 0 missing.
- **11 of 11 recordings over ~40 min have notes cut at exactly 12,000 characters**, mid-word. The end of the lecture, plus the Key terms and Action items sections, never reach the student.
- Transcription itself is healthy: 147 Groq calls, 0 failures, 0 rate limits, peak day 12.7k of 28.8k audio-seconds.

## Findings, most harmful first

### 1. CRITICAL: the 5-minute part rotation kills recording when the phone is locked or in the background
- The recorder makes each 5-minute part by stopping the mic and starting it again (`lib/lectureRecorder.ts` `rotateSegment`: `stop` → `prepareToRecordAsync` → `record`).
- expo-audio 1.1.1 `prepare()` re-activates a non-mixable audio session on every rotation (`node_modules/expo-audio/ios/AudioRecorder.swift:68-76`). From the background, iOS can refuse that. Once the mic stops, the app also loses its background-audio keep-alive and can be suspended.
- **Evidence:** all 6 `lecture_recording_interrupted` events this week landed within ±2 s of a 300 s multiple (5:00, 5:00, 5:02, 39:58, 44:58, 5:00). After them, capture either stopped for good or resumed only when the student reopened the app (23 min later on 644aeee6).
- **Aggravated by the timer lying.** Native `startRecording()` ignores `AVAudioRecorder.record()`'s return value, and `durationMillis` is wall-clock time, not captured audio (`AudioRecorder.swift:49-66, 102-119`).
  - The screen keeps counting while nothing records.
  - Groq measured **0 s** in parts the phone called 300 s (09e936c7 seq 8, e3c08b90 seq 5).
  - The phone's saved duration was 4,309 s against 3,587 s of real audio on 09e936c7.
- **Status on the branch:** NOT addressed. Rotation is still stop→prepare→record, and dead-recorder detection still trusts the flag that lies.
- **Fix direction:**
  - Rotate without the mic ever going idle: start part N+1 on a second recorder before stopping part N, so the session stays active and parts overlap by about 1 s instead of leaving a gap.
  - Detect a dead recorder from the file actually growing, not from `isRecording`.
  - Do the timer and the 90-minute cap from measured audio.
  - This must be proven on a real locked iPhone across several boundaries before release. If JS-level overlap can't do it, the fallback is a native segmenting recorder, which needs a new binary.

### 2. CRITICAL: notes are truncated at 12,000 characters
- `supabase/functions/lecture-study-kit/index.ts:36` has `MAX_NOTES_CHARS = 12_000`, applied at `:396` and `:560`.
- The model's longest output this week was about 5.4k tokens (~27k characters), so the cut is ours, not the model's.
- Nothing downstream needs the cap. The DB has no length constraint, Tutor reads ≤8k, flashcards ≤24k, and the detail screen has no limit.
- **Fix:** raise it to ~40k. Also raise `MAX_TRANSCRIPT_CHARS` from 80k to ~120k: the longest transcript this week was already 62.8k, and dense lectures project to ~96k at 90 minutes.
- **Then regenerate** the 11 truncated lectures. Use a push-free refresh: the existing stale-refresh path would send an untrue "the rest of your recording arrived" push. That needs a production write, so it needs an explicit yes.

### 3. HIGH: a recording can run for days and capture audio outside class
- e3c08b90: started 09-14 14:28 on app 1.12 and never stopped. The phone locked, and the locked-phone sign-out bug (`auth_session_read_degraded`) followed.
- The recorder woke and captured at 18:50, 22:15, 06:41, 13:52, 17:47 and finally auto-saved at **00:51 two days later**, when its wall-clock timer hit "90 minutes". The result is one "lecture" stitched from three days.
- This is a privacy problem as well as a garbage transcript.
- Branch: NOT addressed.
- **Fix:**
  - Add a wall-clock limit: auto-stop and save once the session spans more than ~3 h, or whenever the app returns from a long suspension.
  - On foreground, tell the student plainly that recording stopped.

### 4. HIGH: the student is told everything is fine when it isn't
- The detail screen shows plain "ready" for lectures with missing parts. The push says "Your lecture notes are ready." The incomplete banner exists only on the unshipped branch.
- The recording screen always says "Recording resumed after an interruption. A short gap is marked" — even when recording did **not** resume.
- "Semora keeps uploading if you leave" is not true once the app is backgrounded.
- These strings are English-only on the record screen.

### 5. HIGH: parts that fail while signed out are never retried (live code)
- The upload does `getSession` before creating the server row, so a signed-out failure leaves no row and the local file is forgotten.
- This week it hit 1.7, 1.12 and 1.14 devices (e.g. 21efc577 seq 0, b3e0689b seq 7, 9c0fb14d nine parts).
- Branch: MOSTLY fixed (journal + recovery runtime mounted on launch/foreground/network return), with new defects listed under "Branch review" below.

### 6. HIGH: the transcript hides the holes, so notes paper over missing minutes
- The SQL paths that assemble a transcript (stall sweep and rebuild in migration 138) join parts with a space and no gap markers. Only `maybeFinalize` inserts "[Part of this recording could not be transcribed.]".
- The prompt's "do not invent across marked gaps" rule never fires on those 4 lectures.
- **Fix:** build markers from missing seqs and `has_gap` in SQL.

### 7. MEDIUM: one slow transcription call blocks all later uploads
- Each upload awaits the `lecture-transcribe` call inline, with no timeout.
- The same seq shows "uploaded" then "upload_failed" minutes later (seq 0 on 644aeee6 after 23 min; seq 7, seq 17): the bytes arrived, but the transcribe request hung while the app was suspended.
- It's reported as an upload failure and holds up every later part.
- Branch: PARTIAL. It no longer counts as an upload failure, but it is still awaited inline with no timeout, in recovery too.

### 8. MEDIUM: Stop right after Pause can still lose the last part (branch)
- The branch fixed Stop racing the 5-minute timer rotation, but not Pause→Stop within ~8 s.
- `pause()` doesn't await its rotation, and `stop()` only rotates while `phase === 'recording'`.
- Offline, the file can land in `lectures/null/`, which recovery deliberately ignores.

### 9. MEDIUM: near-silent parts add invented words
- Parts Groq measured at 0–2 s still returned 9–19 characters of text (e3c08b90 seq 0 and 5, 09e936c7 seq 8, f0056f8c seq 0), which get folded into transcripts.
- **Fix:** drop text when provider seconds are below ~5 s.

### 10. MEDIUM: the daily Groq cap doesn't meter real usage
- `lecture_quota_day` only holds reservations (5,400 s per active lecture) that release on finish, so it limits concurrent lectures (~4), not audio per day.
- Nothing stops a busy day from passing Groq's 28,800 s. That's not hit yet (peak 12.7k).

### 11. LOW
- Recovered parts are transcribed as English: the cron recovery path never sends a locale. That will break Spanish recoveries.
- The boundary-word hint is skipped after a gap.
- `duration_seconds` undercounts when parts fail (04cd64e7 shows 1,200 s for 8 declared parts).

## Branch review (`codex/lecture-audio-phase-1`, unshipped)

`tsc` is clean and 55 Deno tests pass. Findings 1 and 3 are not addressed, 5 is mostly addressed, and 7 and 8 are partial.

**Do NOT apply migration 141 as written.**
- It rewrites `notify_lecture_notes_ready` from an older copy.
- It drops the live "Your notes now cover the whole lecture" loop and its `notes_refreshed_at` filter: 141 has zero references to either, 138 has four.
- It needs rebuilding from the live 138 definition.
- That loop also needs a `parts_missing = 0` check it lacks today.

Migration 140 is safe (additive `create or replace`, compatible with 1.7–1.14 clients).

New defects the branch introduces:
1. **Local lecture folders are never cleaned up.** Recovery rescans every lecture ever recorded, rewrites its journal and re-calls transcribe on every foreground. The cost grows without bound.
2. **Recovery ignores the journal's `ownerId`.** A second account on the same phone retries the first account's parts forever (blocked by RLS, but classified as retryable).
3. **Discard during a rotation** can recreate a journal without the discard flag. The thrown-away audio is retried forever and stays on the phone.
4. **Separate journal store instances are not serialized** against each other, so a recovery pass during recording can drop a part's metadata and upload it as 0 seconds.
5. **Retries are unbounded.** The "three attempts" in the comments isn't enforced.
6. **The lifecycle tests test a model nothing imports.** The real hook's Stop fix and the Pause→Stop gap have no test.

## Recommended order

1. **Server, safe and immediate**
   - Raise the notes cap to ~40k and the transcript cap to ~120k.
   - Drop text from sub-5 s parts.
   - Add gap markers in SQL.
   - Fix recovery locale.
   - Rebuild 141 from the live definition; gate the "whole lecture" push on `parts_missing = 0`.
   - Apply 140.
   - *(deploy + migration: needs a yes)*
2. **Regenerate the 11 truncated notes** via a push-free refresh. *(production write: needs its own yes)*
3. **Phone, capture reliability:**
   - overlap rotation (never idle the mic);
   - dead-recorder detection from file growth;
   - timer and cap from real audio;
   - wall-clock auto-stop;
   - honest interruption and "recording stopped" messaging.

   Prove it on a locked physical iPhone first.
4. **Phone, delivery:**
   - Take the branch's journal/recovery, but fix its six defects.
   - Put a timeout on the transcribe call and move it out of the upload chain.
   - Close the Pause→Stop gap.
   - Ship the incomplete-notes banner.
5. **Release:** an OTA reaches 1.13/1.14 only. 1.7 and 1.12 students (about half of this week's recordings) need an App Store build plus an update prompt, which is an owner decision.
