# Lecture Recording — App Store Review notes

Paste the **Reviewer notes** section verbatim into App Store Connect → the build's
"Notes for Review" field. Microphone recording plus a background audio mode is the
combination reviewers scrutinise hardest, and an unexplained `UIBackgroundModes: audio`
is a common rejection. Everything below describes what the shipped build actually does.

---

## Reviewer notes (paste this)

**Lecture Recording**

How to test: open the app, tap the **+** button in the middle of the tab bar, choose
**Record lecture**. Tap "I have permission to record" on the consent sheet, then allow
microphone access. A red recording indicator, a live timer and an input-level meter
appear. Lock the device or background the app — capture continues. Unlock and tap
**Stop & save** to produce the transcript and notes.

*Why `UIBackgroundModes: audio` is declared (2.5.4):* the app captures microphone audio
for the full duration of a lecture the student explicitly started, which commonly runs
50–90 minutes with the screen locked in a lecture hall. "audio" is the only background
mode that permits continued microphone capture. The audio session is activated only when
the user taps Record and is deactivated immediately on Stop, Discard, or when the screen
is dismissed; the app never holds a background audio session while idle.

*Consent (2.5.14):* recording cannot begin until the user taps "I have permission to
record" on a blocking sheet that explains other people's voices will be captured and that
local law may require their consent. The acknowledgement is stored per account, so a
different student signing in on the same device is asked again. A persistent red
indicator and timer are shown for the entire session, including when paused.

*Third-party processing (5.1.2):* audio is uploaded to the student's own private storage
and sent to our transcription provider, which is disclosed in the consent sheet and in the
privacy policy at https://semoraai.com/privacy. The audio file is deleted from our storage
as soon as the transcript is created — typically within a minute of the user stopping the
recording. Only the text remains.

*Scope (5.2.1):* recordings are private to the student who made them. There is no sharing,
no export of the audio file, no public or cross-user library, and no marketplace. The app
tells students to follow their instructor's and school's rules.

---

## App Privacy (nutrition label) — what changes

Add under **User Content**:

| Data type | Linked to user | Tracking | Purpose |
|---|---|---|---|
| Audio Data | Yes | No | App Functionality |
| Other User Content (transcripts, notes) | Yes | No | App Functionality |

Tracking stays **No** — there is no ATT prompt and no advertising SDK in the build.
Disclose a transcription provider under Third-Party Partners.

The generated `PrivacyInfo.xcprivacy` is produced from `expo.ios.privacyManifests` in
`app.json` (it previously declared `NSPrivacyCollectedDataTypes` as an empty array, which
was already inaccurate). Do not hand-edit `ios/` — it is generated and gitignored.

---

## Marketing copy rules

- "Record **your own** lectures", never "record any lecture".
- Never "never attend class again" or anything implying the app replaces attendance.
- Keep "Check your instructor's policy before recording" in the App Store description.
- Do **not** add audio sharing, raw-audio export, or a cross-user recording library.
  Those are what turn a low 5.2.1 copyright risk into a real one, and they widen the
  wiretap-consent exposure from one student to a distribution chain.
