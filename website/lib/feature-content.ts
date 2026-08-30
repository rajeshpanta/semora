import type { FeatureSlug } from './semora-facts';

/**
 * Long-form editorial content for each /features/{slug} page.
 *
 * The short `description` on FEATURES in semora-facts.ts is the one-paragraph
 * summary reused in the nav dropdown and cards; this is the full page body.
 * Every claim here was written directly against the shipping source and then
 * adversarially fact-checked — treat it exactly like semora-facts.ts: do not
 * change a number, a limit, or a tier without re-verifying it in the app.
 */
export interface FeatureSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface FeatureLongForm {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  intro: string[];
  sections: FeatureSection[];
  faq: { question: string; answer: string }[];
}

export const FEATURE_CONTENT: Partial<Record<FeatureSlug, FeatureLongForm>> =
{
  "apple-watch": {
    "metaTitle": "Apple Watch \u2014 Deadlines on Your Wrist",
    "metaDescription":
      "Semora on Apple Watch shows what is due today and what is overdue, puts the counts on your watch face, and lets you tick a task off from your wrist.",
    "h1": "The two numbers that matter, without taking your phone out.",
    "lede":
      "Between classes you do not want an app. You want to know whether anything is due today and whether anything is already late. Semora on Apple Watch answers both from your wrist, and lets you tick something off while you are there.",
    "intro": [
      "A wrist is a terrible place to read a syllabus and an excellent place to answer one question. So the Watch app does not try to be the phone app made small \u2014 it holds the answer a glance can actually carry.",
      "It ships inside the iPhone app on the same purchase, so there is nothing separate to buy and nothing separate to find in a store."
    ],
    "sections": [
      {
        "heading": "What is actually on the watch",
        "paragraphs": [
          "Two counts at the top \u2014 due today, and overdue \u2014 with the list underneath in due order. Each row carries its own label, so you can tell a thing due this afternoon from a thing due Friday without doing arithmetic on a small screen.",
          "Underneath that, honestly, is how fresh the data is. \"Updated 4m ago\" or \"Not synced yet\" is on the screen, because a glanceable surface that quietly shows you yesterday's list is worse than one that admits it is behind."
        ],
        "bullets": [
          "Due today and overdue, as counts you read rather than lists you scan",
          "The tasks themselves, in due order, each with its own date label",
          "How recently the phone synced, stated rather than assumed",
          "Distinct screens for signed out, nothing synced yet, and genuinely all caught up \u2014 three states that look identical if you only handle \"empty\""
        ]
      },
      {
        "heading": "Complications: the answer without opening anything",
        "paragraphs": [
          "The counts also run as watch-face complications in three families \u2014 circular, inline and rectangular \u2014 so they sit on the face you already look at forty times a day. That is the version of this feature that costs a student nothing at all: no tap, no launch, no decision to check.",
          "The complication runs in its own process and cannot talk to the phone directly, so it reads the last snapshot from a shared container the Watch app writes. That is the mechanism behind it staying correct when the app is not open."
        ]
      },
      {
        "heading": "Ticking something off from your wrist",
        "paragraphs": [
          "Tapping a row completes it, and the row tells you where it got to: sending, completed, or \"Didn't send \u00b7 tap to retry\" if the phone was not reachable. No silent failures dressed up as success.",
          "What matters is what happens underneath. A Watch completion is not a separate implementation \u2014 it asks the phone to run the same mutation the Today tab, the task screen, the course screen and search all run. So finishing something from your wrist cancels its reminders, removes its calendar event, schedules the next recurrence if it repeats, and queues offline exactly the way it would have if you had done it on the phone. The Watch does not get its own half-version of that; it gets a way to ask for it."
        ]
      },
      {
        "heading": "It stays right when the phone is not around",
        "paragraphs": [
          "Due labels are recomputed on the watch from the raw dates rather than sent as finished text. A row that read \"Tomorrow\" last night reads \"Today\" this morning, with your phone in another room and no sync in between.",
          "This sounds like a detail and is the difference between a companion you trust and one you check twice. A wrist surface showing a stale word is worse than showing nothing, because you act on it."
        ]
      },
      {
        "heading": "What it needs",
        "paragraphs": [
          "Apple Watch Series 4 or later, on watchOS 10 or newer. That floor was chosen deliberately: the default for this kind of target is watchOS 11, which requires a Series 6, and nothing the app does needs an API that new. A companion whose entire job is glanceability should not exclude a working watch for no reason.",
          "It installs alongside the iPhone app from the same App Store listing \u2014 there is no separate watchOS download and no second purchase. Semora Pro, if you have it, is an account entitlement, so it is already in effect here."
        ]
      }
    ],
    "faq": [
      {
        "question": "Do I have to buy the Watch app separately?",
        "answer": "No. It is part of the same universal listing as the iPhone and iPad app, and it installs from the Watch app on your paired phone once Semora is on it. There is no separate watchOS download, no second purchase, and Pro \u2014 which is an account entitlement rather than a per-device licence \u2014 already applies."
      },
      {
        "question": "Which Apple Watch models work?",
        "answer": "Series 4 and later, running watchOS 10 or newer. The usual default for a companion target like this is watchOS 11, which needs a Series 6 or later; Semora targets 10 on purpose, because reading two numbers off a watch face does not require a recent API and there is no reason to lock out a watch that works."
      },
      {
        "question": "Can I complete a task from the Watch?",
        "answer": "Yes, by tapping the row. The Watch asks your phone to run the same completion the phone's own screens run, so reminders are cancelled, any calendar event is removed, and the next occurrence of a repeating task is scheduled \u2014 all identical to completing it on the phone. If the phone is not reachable the row says so and offers a retry rather than pretending it worked."
      },
      {
        "question": "Does it work if my phone is in another room?",
        "answer": "It shows the last snapshot it received, and it tells you how old that is rather than hiding it. Due labels are recalculated on the watch itself from the underlying dates, so they stay correct across midnight without a fresh sync. What it cannot do without the phone is complete a task, since that has to become a real database write \u2014 the row will say it did not send and let you retry."
      },
      {
        "question": "Is the Watch app included on the free tier?",
        "answer": "Yes. The Watch app reads the deadlines you already track, and deadline tracking, grades and same-day reminders are all on the free tier. Nothing about the Watch is behind Pro."
      }
    ]
  },
  "lecture-recording": {
    "metaTitle": "Lecture Recording \u2014 Notes, Quiz and Flashcards",
    "metaDescription":
      "Record a lecture on your phone. Semora transcribes it and writes structured notes, a practice quiz and a flashcard deck from the same transcript.",
    "h1": "Record the lecture. Get the notes, the quiz and the cards.",
    "lede":
      "Semora records a class from your phone, transcribes it, and turns that transcript into written notes, a multiple-choice practice quiz with explanations, and a flashcard deck \u2014 all from one recording, without you retyping anything.",
    "intro": [
      "Taking notes and following a lecture are two different jobs competing for the same attention. The student writing the fastest is usually the one understanding the least, and the one who chose to listen properly has nothing to revise from three weeks later.",
      "This removes the trade. You press record, you listen, and the writing happens afterwards from what was actually said."
    ],
    "sections": [
      {
        "heading": "What you get from one recording",
        "paragraphs": [
          "A finished lecture produces four things from a single pass, and each of them is derived from the transcript rather than from a separate upload or a second AI action."
        ],
        "bullets": [
          "The transcript itself, searchable, so you can find the ten seconds where the professor said what the exam covers",
          "Structured written notes, organised into headings rather than a wall of speech",
          "A multiple-choice practice quiz, with an explanation attached to every answer rather than just a score",
          "A flashcard deck, generated from the same material, that behaves like every other deck in Semora"
        ]
      },
      {
        "heading": "Recording that survives your phone dying",
        "paragraphs": [
          "Audio is captured in five-minute segments rather than as one long file, and the reason is specific. An .m4a killed before its writer finalises has no moov atom \u2014 the file is not shortened, it is unplayable. A single-file recorder that meets a low-battery shutdown or an aggressive iOS memory reclaim at minute 70 does not hand back 70 minutes. It hands back nothing.",
          "Segmenting turns an unrecoverable loss into a survivable one: the worst case is the last few minutes, and every earlier segment has already uploaded. It also keeps each upload around 1.2 MB, which is what makes this work on campus wifi rather than only on a good connection.",
          "The capture settings are tuned for one voice in a large room \u2014 mono, 32 kbps, speech-range sampling. A 90-minute lecture is roughly 22 MB. The same lecture at the audio presets a recorder ships with by default would be 86 MB."
        ]
      },
      {
        "heading": "The audio is deleted once the transcript exists",
        "paragraphs": [
          "As soon as the transcript is durably written, the recording is deleted. This is not a storage-saving measure and it is not configurable \u2014 playback is deliberately not a feature.",
          "The reasoning is that a lecture recording is not only your data. It contains your instructor's voice and everyone within microphone range of your phone, none of whom chose to be recorded by an app. Keeping that audio after it has served its purpose buys a hosting bill and an erasure obligation and nothing else. The transcript, the notes, the quiz and the cards are yours and they stay."
        ]
      },
      {
        "heading": "Permission comes first, and the app says so",
        "paragraphs": [
          "Before your first recording Semora shows a sheet asking you to confirm you have permission, and pointing you at your instructor's rules and your school's policy. Many courses require permission before you record, some prohibit it, and the law varies by state and country.",
          "That screen exists because an app that makes recording a one-tap action has some responsibility for the moment before the tap. It is not legal advice and it is not a substitute for asking \u2014 it is a prompt to ask."
        ]
      },
      {
        "heading": "Where it sits in the rest of Semora",
        "paragraphs": [
          "Recording lives under Notes in the app, alongside uploads: slides, a chapter, or a photo of the board all go to the same place and produce the same set of outputs. A lecture is one input, not a separate product.",
          "The cards generated from a lecture are ordinary Semora flashcards, so they open in the same reviewer as a deck built from a syllabus. The notes are attached to the course you recorded for, which means the AI tutor can answer from them the same way it answers from a scanned syllabus."
        ]
      },
      {
        "heading": "The limits, plainly",
        "paragraphs": [
          "One recording runs up to 90 minutes, and you are warned before the cap rather than cut off at it. Recording requires the phone app \u2014 iPhone or iPad \u2014 because it needs a microphone and a foreground audio session; the web app can read everything a recording produced, but it cannot capture one.",
          "Semora checks for free space before it starts, because a device that fills up mid-lecture is the one failure with no recovery: the class does not happen twice. It also warns you if the battery is low and you are not plugged in.",
          "On the free tier a lecture spends the account's single lifetime AI action, the same one a syllabus scan would spend. Recording more than one class is a Pro feature."
        ]
      }
    ],
    "faq": [
      {
        "question": "Can I listen back to the recording?",
        "answer": "No, and that is deliberate. The audio is deleted as soon as the transcript is written, so playback is not offered at all. What survives is the transcript, the notes, the quiz and the flashcard deck. If listening back matters more to you than any of those, a plain voice recorder is the better tool and this is not a close call."
      },
      {
        "question": "What happens if my phone dies halfway through the lecture?",
        "answer": "You lose the segment that was in progress, at most the last five minutes, and keep everything before it. Audio is written in five-minute pieces and uploaded as they complete, precisely so that a shutdown, a crash, or iOS reclaiming memory does not cost you the whole class. A single-file recorder in the same situation typically produces a file that will not open at all."
      },
      {
        "question": "Do I need permission to record my lectures?",
        "answer": "Usually, yes. Many courses require it, some prohibit recording entirely, and recording laws differ by state and country. Semora shows a confirmation sheet before your first recording that points you at your instructor's rules and your school's policy. Treat that as a prompt to go and ask, not as clearance \u2014 the app cannot know your institution's policy and does not pretend to."
      },
      {
        "question": "Can I record on the web app?",
        "answer": "No. Recording needs a microphone and a foreground audio session, so it runs in the iPhone and iPad app only. Everything a recording produces \u2014 the transcript, notes, quiz and cards \u2014 is account data, so it is all readable in the browser afterwards on the same account."
      },
      {
        "question": "Is lecture recording free?",
        "answer": "A free account gets one AI action for the lifetime of the account, and a lecture is one way to spend it \u2014 a syllabus scan or a document turned into notes are the others, and you pick. Recording more than one class is part of Pro, at $3.99/month or $19.99/year, which also covers unlimited syllabus scans and courses."
      }
    ]
  },
  "syllabus-scanner": {
    "metaTitle": "AI Syllabus Scanner for College Students",
    "metaDescription": "Turn a syllabus photo, PDF, or pasted text into every deadline, class time, and grade cutoff. Review each item before it saves. Free tier: one AI action per account.",
    "h1": "AI Syllabus Scanner",
    "lede": "Photograph, upload, or paste your syllabus and Semora returns the course, the class schedule, the grading scale, and every deadline it can find. You review the list before a single item is saved.",
    "intro": [
      "Week one hands you four or five syllabi, each eight to twenty pages, and the dates you actually need are buried somewhere between the attendance policy and the academic-integrity statement. When the midterm is. What the final project is worth. Whether Friday is a lecture or a lab. It is all in there, and getting it out means reading every page and then typing all of it into something else.",
      "So most people do neither. The PDF stays in the email attachment, the dates live in your head until they do not, and the first real surprise shows up in week six when two exams land in the same 48 hours and a project you forgot about is worth 25 percent.",
      "The scanner is the shortcut. Photograph the syllabus, upload the PDF, or paste the text, and roughly 10 to 30 seconds later you have a course with an instructor, a class schedule with days and rooms, the letter-grade cutoffs your professor printed, and a list of every assignment, quiz, exam, project, and reading it could find, each with a due date, a due time if one was stated, and its weight toward your final grade. Then it stops. The course, its meeting times and its grading scale are filed for you, but not one deadline is saved until you look at the list and approve it."
    ],
    "sections": [
      {
        "heading": "Four ways in on your phone, two more on the web",
        "paragraphs": [
          "The Scan tab is one screen with a short list of options, because the input is never the same twice. Sometimes the syllabus is a PDF in your inbox. Sometimes it is a stapled handout the professor passed around. Sometimes it is a Canvas page you can select and copy but not download.",
          "Photo scans support up to five pages per scan, and all five count as one scan. The camera path reopens the shutter after every shot and asks whether you want to add another page or scan what you have; the library path lets you multi-select up to five images and keeps them in the order you tapped them, not the order your camera roll happens to be in. PDFs are read in full, so a long syllabus should go in as a PDF rather than as photos.",
          "There is also a size ceiling, and Semora enforces it while you are still capturing rather than after you have finished. The combined raw size of a photo scan is budgeted at 10 MB. The first page is always allowed through; if a later page would push you past the budget, that page is dropped and you get told exactly how many pages the scan will proceed with. The first camera shot is captured at higher quality than the ones after it, on the theory that a single-page scan should be as sharp as possible while five pages need to fit in one request."
        ],
        "bullets": [
          "Take a photo: up to 5 pages in one scan, captured page by page, with a prompt after each shot. Back out mid-way and it asks whether to keep or discard what you already captured.",
          "Upload PDF: the file picker is restricted to PDFs, and the whole document goes to the parser at once. No page cap.",
          "Choose from Photos: multi-select up to 5 images from your library, in your tap order.",
          "Pick from Files: iCloud Drive, Google Drive, or anywhere else the Files app reaches. Accepts PDF, JPG, PNG, HEIC, HEIF, and WEBP; if the storage provider does not report a file type, Semora infers it from the extension instead of guessing PDF.",
          "Drag and drop (web): the scan frame itself is the drop target. Its border lights up and the label changes to \"Drop it here\" while a file is over it.",
          "Paste text (web only): between 20 and 60,000 characters, with a live character counter. This path skips image reading entirely and sends the raw text, which is the fastest and most accurate route when you are on a laptop and can select the syllabus text directly."
        ]
      },
      {
        "heading": "What actually comes off the page",
        "paragraphs": [
          "The extraction is not a wall of text with dates highlighted. The model is asked for one structured object with named fields, and every field is validated on the server before it reaches you, so a mangled value becomes a null instead of a corrupt row in your course.",
          "Meeting times are the part most students do not expect. A class that meets MWF for lecture and Tuesday afternoon for lab comes back as two separate meeting blocks, not one blurred entry, with weekdays mapped to real day numbers, start and end times in 24-hour form, a kind, and a room. Office hours are extracted the same way, including \"by appointment\" blocks that have a location but no fixed days.",
          "Grading scales are the other quiet win. If your syllabus lists cutoffs anywhere in it, they come back as letter plus minimum percentage, sorted from highest to lowest, with plus and minus grades included when the professor specified them. That is what turns a raw weighted average into an actual letter grade later on."
        ],
        "bullets": [
          "Course name and course code, combined into a single readable title like \"CS 101 - Intro to Computer Science\" and trimmed to 50 characters if it runs long.",
          "Instructor name, when it appears on the document.",
          "Meeting blocks: days of the week, start and end time, kind (lecture, lab, discussion, or other), and location. One block per recurring time slot.",
          "Office hours blocks: days, times, and location, with days left empty for by-appointment hours.",
          "Semester name plus term start and end dates, each validated as a real calendar date before it is stored.",
          "Grading scale: letter and minimum percentage, sorted high to low.",
          "Deadlines: title, type (assignment, quiz, exam, project, reading, or other), due date, due time, percentage weight, a description, and a confidence score between 0 and 1."
        ]
      },
      {
        "heading": "Nothing saves until you approve it",
        "paragraphs": [
          "The review screen is not a formality, and it is not skippable. It opens with a count of items found and a count selected, a select-all toggle, and one card per extracted item. Each card has a checkbox and a pencil. The pencil opens type chips and free-text fields for the date, the time, the weight, and the description, so a wrong title or a shifted date is a five-second fix rather than a reason to abandon the import.",
          "The screen also flags its own uncertainty rather than hiding it. Any item the model scored below 0.8 confidence carries a \"Low confidence \u2014 please verify\" badge. Any date that parses but falls outside the plausible window for the term is tagged \"Date looks outside this term \u2014 double-check\" - and the moment you edit that date, the flag clears, because you have now looked at it. If most of the dated items are already in the past, a banner across the top says these dates look like a previous term, which is almost always a professor reusing last year's PDF.",
          "Items the syllabus mentions without a date get their own section at the bottom called \"Needs a date.\" A final exam listed as TBA is not thrown away and not silently saved with a made-up date. It sits there deselected, and you can set a date to include it or leave it out. Select-all deliberately skips that section, and a card never jumps between sections while you are typing a date into it.",
          "Saving is all or nothing. Every selected item goes in as a single batch, so you never end up with nine of your twelve deadlines and no idea which three vanished. If the save fails, you stay on the screen with your selections intact and can retry."
        ]
      },
      {
        "heading": "What Semora builds out of the extraction",
        "paragraphs": [
          "The extraction is only useful if it becomes real structure, so the app files it the way you would have by hand. The semester comes from the syllabus itself when it names one; if it does not, Semora falls back to the term you picked during onboarding (only for your very first semester, so a scan a year later does not land in a stale term) and then to a term inferred from today's date. If a semester with that name already exists, the course joins it instead of creating a duplicate.",
          "Course matching is deliberately strict. Semora matches on the course code as a prefix and then checks that the next character is a real boundary, so scanning \"CS 10\" does not silently merge into your existing \"CS 101.\" A genuinely new course gets a color and an icon picked from the ones you are not already using that semester, so your courses stay visually distinguishable without you choosing anything.",
          "Re-scanning is treated carefully. Meeting times and office hours are written only when the course is newly created, so importing an updated syllabus never wipes out a room number you corrected by hand. The extracted grading scale is applied to a new course, or to an existing one that is still on Semora's default A/B/C/D/F scale, and left alone if you have already customized it. Saved deadlines are tagged as parsed from a scan, reminders are scheduled for each one right after the save commits, and the file you scanned is kept in private storage so you can reopen it from the course screen later through a short-lived signed link. Multi-page photo scans keep every page, and reopening one gives you a page chooser."
        ]
      },
      {
        "heading": "The free limit, stated precisely",
        "paragraphs": [
          "Scanning is a free feature with a real number attached: one AI action for the lifetime of your account. You pick what it buys — a syllabus scan, a lecture recording, or turning a document into notes — and whichever you reach for first is where it goes. Nothing resets. The count is attached to the account rather than to the calendar, so there is no refill waiting on the 1st, and the same single count is used by the app, the server, and the database so the three never disagree with each other about whether you still have it.",
          "You are not left guessing where you stand. The Scan tab shows a pill reading something like \"1 free AI action left,\" which turns red at zero. Before you spend it, Semora interrupts with a confirmation that says exactly that and offers three choices: cancel, upgrade, or go ahead and use it. At zero, the scan buttons say plainly that the free action is used up and offer the upgrade path.",
          "Two other limits are worth knowing because they are separate from the free action. A free account holds unlimited classes synced free from Canvas, Blackboard or Moodle, plus one course you add by hand within one semester, and one semester total. That matters here because a scan that extracts a brand-new course can hit the hand-added course limit even when your free action is still unspent, so the Scan tab says so before you spend it — and points at Canvas, which brings every class across for free and does not touch your AI action. There is also a rolling cap of 20 scan attempts per 24 hours on every account, free or Pro, which exists to stop runaway automation and which no ordinary semester setup will ever approach.",
          "Pro removes the scan and course caps entirely, at $3.99 per month or $19.99 per year, which works out to about $1.67 a month on the annual plan. Pro can be bought two ways \u2014 with a card on the web at app.semoraai.com, where Stripe handles the checkout, or inside the iOS app through the App Store \u2014 and either way the entitlement applies to your whole account, including the web app, so you only ever pay once."
        ]
      },
      {
        "heading": "When the document is not a syllabus, and other awkward cases",
        "paragraphs": [
          "The first thing the model is asked is not \"what are the deadlines\" but \"is this actually a syllabus.\" A receipt, a boarding pass, an article, a random screenshot, or a photo of the wrong page is classified as not-a-syllabus and returned as exactly that, before a single row is written. You get a calm \"Not a syllabus\" message with two buttons, Pick Another and Try Again, instead of a phantom course called Unknown Course full of invented dates. The same gate catches an extraction that comes back completely empty: no course name, no items, no meetings, nothing usable.",
          "That rejection does not spend your free action. Only successful extractions count against it. It does count as one of the 20 attempts allowed in a rolling 24-hour window, so pointing the camera at your lunch receipt eleven times in a row is not free forever, but a genuine mistake costs you nothing that matters.",
          "The other failure modes have their own handling instead of one generic error. A syllabus so dense that the response gets cut off mid-structure returns a specific message suggesting you scan one course, or fewer pages, at a time. If the AI service is overloaded, the request retries with backoff and then falls back to a second model before giving up, so a capacity blip usually resolves itself rather than becoming your problem. A scan that hangs is aborted after 120 seconds, and the abort cancels the in-flight request before any database writes happen, so a timeout never leaves you with a half-created course. If the extraction did finish server-side just as the client gave up, that one still counts \u2014 the work was done and delivered. While a scan is running, the modal is locked - you cannot swipe it away and strand an extraction you will never see.",
          "Re-scanning a syllabus you already imported is caught too. Semora tells you the course already exists in that semester and offers two honest options: open the existing course, or create a separate duplicate. It does not offer to merge, because the review screen has no per-item comparison against your existing tasks and merging would silently double every deadline you already have."
        ]
      },
      {
        "heading": "Multi-page scans and genuinely long syllabi",
        "paragraphs": [
          "Paper syllabi are usually stapled, and a schedule table almost never fits on one page. When you take several photos in one go, they are sent to the model together with an explicit instruction that the images are sequential pages of the same document and must be read as one thing, then returned as one combined result. Without that, each photo would be treated as its own syllabus and you would get three fragmentary courses instead of one complete one.",
          "Five pages is the photo ceiling, and the app tells you when you hit it rather than silently disabling the shutter: it says photo scans support up to five pages, offers to scan what you captured, and points you at PDFs for longer documents. That advice is real. PDFs are inherently multi-page and are sent whole, so a 14-page syllabus is a better PDF than a photo set - and if it is dense enough that the structured response gets truncated, the fix is to scan one course at a time rather than to try again identically.",
          "Every page you scan is kept. The first page is stored at the path recorded on the scan, and the rest land beside it with numbered suffixes, so the course screen can offer you a page chooser later without any of it depending on a page having uploaded successfully. A page whose upload failed is skipped in the chooser rather than renumbering the others, because storage is treated as non-critical: losing a copy of a photo must never fail the scan that produced your deadlines."
        ]
      },
      {
        "heading": "Where a scan shows up in the rest of Semora",
        "paragraphs": [
          "The scan is the front door, not a standalone tool. Everything it produces is ordinary Semora data from the moment you save it, which is why the scanner is free: it is what makes the rest of the app worth opening.",
          "Deadlines become tasks on your Today tab \u2014 sorted into overdue, due today, and this week \u2014 with same-day reminders on the free tier. Weights become the input to grade tracking, so a weighted average appears as soon as you start entering scores - and because the scanner pulled the grading scale off the syllabus, that percentage maps to the letter your professor actually uses rather than a generic 90/80/70. Meeting blocks become your class schedule. The stored syllabus file stays one tap away on the course screen. All of it syncs across iPhone, iPad, and the web app on one account.",
          "On the Pro side, the same extraction feeds Smart Plan's study schedule and the Workload dashboard's crunch-week view, both of which are only as good as the deadlines they have. The AI Tutor answers from the syllabus you scanned and the deadlines it produced. Flashcards can be generated from a scanned syllabus, or scoped to one specific exam pulled from your tracked deadlines. Canvas, Blackboard and Moodle import is free on every plan, and the other two do not use a Canvas token \u2014 Blackboard connects with a school-issued OAuth access token your administrator approves, and Moodle with a web-service token your administrator issues. Some institutions disable or prohibit third-party token use, so confirm your school's policy. If the connector is unavailable or not permitted, paste the Canvas assignment list into the web scanner."
        ]
      },
      {
        "heading": "Who this is genuinely for, and when to use something else",
        "paragraphs": [
          "This is built for a student holding a syllabus that contains a schedule - a table of weeks and dates, an exam list, a grading breakdown. If your professor writes a real syllabus, this turns thirty minutes of typing into about thirty seconds of reviewing, and the multi-page photo path means you do not need a scanner or a desk to do it.",
          "It is a weaker fit in a few honest cases. If your syllabus contains no dates because everything lives in the LMS, use the current Canvas token connector only if your institution permits it; otherwise, paste the Canvas assignment list into the web scanner. Scan the syllabus separately for the grading scale and class times. If the document is a photo of a whiteboard or handwriting at an angle in bad light, expect low-confidence flags and plan on editing in the review screen. If you have more than five pages of photos, use a PDF. And if you want to re-import an updated syllabus and merge only the changed deadlines into an existing course, that is not what this does - it will offer you a duplicate course instead, and the honest workaround is to edit the handful of tasks that moved.",
          "One more thing worth setting expectations on: the scan is counted when the extraction succeeds, not when you save. If the results come back and you close the app without saving anything, the work was still done and delivered, and it counted. Review first, then decide - the review screen is where the value is anyway."
        ]
      }
    ],
    "faq": [
      {
        "question": "How many syllabi can I scan for free?",
        "answer": "One. A free account gets a single AI action for the lifetime of the account, and a syllabus scan is one way to spend it — a lecture recording or turning a document into notes are the others. It does not reset. A photo scan of up to five pages counts as one scan, not five. The free plan also holds unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, and one semester in total. Pro removes the cap on AI actions and both of those limits."
      },
      {
        "question": "What can I actually feed the scanner?",
        "answer": "On iPhone and iPad: a camera photo of up to five pages, an uploaded PDF with no page cap, a multi-select of up to five images from your library, or a file from the Files app (PDF, JPG, PNG, HEIC, HEIF, or WEBP). On the web you can also drag a file onto the scan frame, or paste raw text between 20 and 60,000 characters, which is the fastest and most accurate route when you can select the syllabus text directly."
      },
      {
        "question": "Does anything get added to my calendar without me seeing it first?",
        "answer": "No. The course, its meeting times and its grading scale are filed for you, but not one deadline is saved until you read the extracted list and approve it. Nothing the AI pulled out is stored on your behalf before that."
      },
      {
        "question": "What does a scan actually pull off the page?",
        "answer": "The course name and instructor, class meeting times and office hours, semester start and end dates, the grading scale your professor printed, and every assignment, quiz, exam, project and reading it can find, each with its due date, its due time if one was stated, and its weight toward your final grade."
      },
      {
        "question": "Is there a size limit on a photo scan?",
        "answer": "Yes, and Semora enforces it while you are still capturing rather than after you finish. A photo scan is budgeted at 10 MB of combined raw image data. The first page always goes through; if a later page would push the scan past the budget, that page is dropped and you are told exactly how many pages the scan will proceed with."
      }
    ]
  },
  "grade-tracking": {
    "metaTitle": "Grade Tracking in Semora — Weighted Averages, Free",
    "metaDescription": "Enter a score as points or a percentage and Semora keeps a running weighted average: grade categories, dropped lowest grades, a letter, and a GPA estimate.",
    "h1": "Grade tracking that follows your syllabus's actual rules",
    "lede": "Enter what you got on each assignment and Semora keeps a running weighted average over the work that has actually been graded, with your course's categories, dropped lowest grades, and letter cutoffs applied. It is on the free plan.",
    "intro": [
      "Your syllabus already tells you how the course is scored. Homework 20 percent, two midterms at 20 each, a final worth 30, participation for the last 10. Then the semester starts and the numbers arrive one at a time, out of order, on different scales — an 88 on a 50-point lab, a 71 on the first midterm, a 17 out of 20 on a reading quiz. Six weeks in you have a pile of individual scores and no honest answer to the only question that matters, which is where you actually stand.",
      "Averaging them does not work. A 100 on a two-percent reading quiz does not cancel a 71 on a midterm worth a quarter of the course, and pretending otherwise is how people get blindsided in week eleven. Dividing by the full semester's weight does not work either — it counts every assignment that has not happened yet as a zero, so your grade looks catastrophic in September and recovers for reasons that have nothing to do with your work.",
      "Grade tracking in Semora does the arithmetic your syllabus describes, over the work that has actually been graded, and nothing else. You enter a score, it updates a running weighted average, derives a letter from your course's grade scale, and rolls every course into a semester GPA estimate. It is part of the free plan — categories, dropped lowest grades, extra-credit rules, and all. Pro adds the two things free deliberately leaves out: editing the cutoffs themselves, and the what-if calculators that tell you what you need on what is left."
    ],
    "sections": [
      {
        "heading": "Recording a grade takes about five seconds",
        "paragraphs": [
          "Open any task and there is a GRADE RECEIVED block. You pick one of two entry modes and type what your professor posted.",
          "Points mode is the default and it is labeled with an example — Points (13/15). You enter points earned and total points possible. That total is the raw point value of the assignment, never its weight in the course: a midterm worth 20 percent of your grade can still be scored out of 50 points, and Semora keeps those two ideas separate. It converts to a percentage rounded to two decimal places and stores all three numbers, so the task afterward reads 88% with 44/50 points underneath it.",
          "Percentage mode is a single field for a number from 0 to 100. Switching between the two modes clears whatever you had typed, so you never accidentally submit a points figure into a percentage box.",
          "The guardrails are specific. Points possible has to be greater than zero. Points earned cannot exceed the total unless the task is flagged as extra credit — the alert says so directly, telling you to mark it extra credit if it genuinely can go over. A percentage outside 0 to 100 is rejected. And if the assignment has no weight recorded, an amber warning appears before you type anything: no weight set for this assignment, add weight in Edit or enter total below. If it does have a weight, you get the reassurance instead — this assignment is worth 20% of your grade."
        ],
        "bullets": [
          "Two entry modes per assignment: points earned out of points possible, or a straight percentage",
          "Points possible is the assignment's own point total, independent of its weight in the course",
          "Percentages are stored to two decimal places; the original points are kept and displayed alongside",
          "Points earned above points possible is blocked unless the task is marked extra credit",
          "Assignments with no weight get a visible warning rather than silently skewing your average",
          "Canvas-synced assignments arrive with their dates, and you enter the score yourself"
        ]
      },
      {
        "heading": "What the weighted average actually calculates",
        "paragraphs": [
          "For a course where you have put a weight on individual assignments, Semora tracks two totals. Weight total is the sum of the weights across every non-extra-credit assignment that has a weight, graded or not. Weight attempted is the slice of that which has been graded so far.",
          "Your current grade is the weighted sum of your scores divided by weight attempted, not by weight total. That single choice is what keeps the number honest early in the term. Three graded assignments covering 45 percent of the course produce a grade based on 45 percent of the course, and the card says so: 9 of 21 graded on the left, 45% of 100% attempted on the right, and a note underneath reading \"Based on 45% of coursework completed.\"",
          "It also tracks earned points, which is the sum of weight times score divided by 100 — the percentage points you have banked toward the final grade. That figure is what the forecasting calculator later works backward from. Percentages are rounded to two decimals, weights to one, and the displayed grade is capped at 100 because every letter scale tops out anyway and a raw 108 tells you nothing a 100 does not.",
          "There is a deliberate fallback for the very common case where an instructor never publishes weights. If none of your graded assignments carry a weight but some of them have scores, Semora uses a straight average of the posted grades rather than showing nothing at all. It is less precise, and it is better than a blank card."
        ]
      },
      {
        "heading": "Categories, and dropping the lowest",
        "paragraphs": [
          "Most syllabi do not assign a percentage to each individual assignment. They assign it to a bucket: Homework 25%, Quizzes 15%, Exams 45%, Final Project 15%. The Grade Setup screen for each course mirrors that structure.",
          "You add categories with a name, a weight percent, and a drop-lowest stepper. A running total sits at the top of the screen and stays amber until the categories add up to exactly 100, at which point it turns green. Saving is blocked otherwise, and the error tells you your current total to a tenth of a percent so you can see what is missing. Every category needs a name, and each weight has to land between 1 and 100.",
          "Once a course has categories they take over the math. Inside each category, Semora looks at how the work was scored. If every counted item has both points earned and points possible, the category average is total points earned over total points possible, so a 50-point exam legitimately outweighs a 10-point quiz sitting in the same bucket. If the items are a mix of point scores and bare percentages, it falls back to a plain mean of the percentages.",
          "Drop-lowest runs per category, from 0 up to 20, and drops the lowest scores by percentage. It has one safety rule worth knowing: it will never drop your only graded item. The drop count is capped at one fewer than the number of graded candidates, so setting \"drop 2\" in a category with two grades drops exactly one. The course card shows what happened — \"2 lowest grades currently dropped\", and the per-category breakdown lists each bucket with its weight and its current average.",
          "Categories with nothing graded yet are simply left out of the denominator. They show as \"No grades\" in the breakdown, and the header meta switches to reading \"40% of category mix reporting\" so you know how much of the mix your grade is standing on. An unscored final worth 30 percent never drags your October grade toward zero."
        ],
        "bullets": [
          "Category weights must total exactly 100% before the setup screen will save",
          "Drop-lowest is per category, 0 to 20, and never removes your last remaining grade",
          "A category where every item has point values is averaged by total points, not by mean percentage",
          "Categories with no graded work are excluded from the running grade rather than counted as zero",
          "Deleting a category leaves its tasks uncategorized and does not delete any scores",
          "Courses that never define categories keep the per-assignment weighting they already had"
        ]
      },
      {
        "heading": "Three different meanings of extra credit",
        "paragraphs": [
          "Extra credit is where most grade calculators quietly get it wrong, because \"extra credit\" means at least three different things depending on the professor. Semora makes it a per-course setting with three options that take effect once the course has grade categories, and the wording in the app is plain about what each one does.",
          "Bonus points is the default. The extra-credit item's worth is a flat number of percentage points added on top of your course grade, scaled by how well you did on it. If your Homework category is 10 percent of the course and you are averaging 80 in it, your base grade reads 80.0; a 5-point extra-credit assignment scored 90 contributes 5 × 0.90, so 4.5 points, and your grade becomes 84.5. Adding it into the weighted numerator instead — the naive approach — would have produced something absurd like 125 early in the term, which is exactly why it is handled separately.",
          "Inside category folds the extra-credit item into its category's average like any other assignment, which can push that category above 100 percent. That is the right model when your professor drops a bonus question onto a quiz. Ignore keeps the work visible in your task list and excludes it from every calculation, for when the credit is real but you have no idea how it will be applied.",
          "When you mark a task as extra credit, the weight field relabels itself to \"Extra credit worth (% points)\" with a hint explaining that the number is bonus points added on top, scaled by your score. Leave it blank and the item contributes zero under the bonus rule — it is visible, but it cannot move a grade it was never given a value for. The final number is capped at 100 either way."
        ]
      },
      {
        "heading": "Letter grades and the grade scale",
        "paragraphs": [
          "Semora ships with the plain scale: A at 90, B at 80, C at 70, D at 60, F at 0. To turn a percentage into a letter, it sorts the scale from highest cutoff down and takes the first threshold your grade meets or beats, falling back to F if you are below all of them.",
          "The scan can replace that with your professor's actual scale. When the syllabus prints a grading table, the parser extracts it, keeps plus and minus grades if they are listed, and sorts it high to low. It applies that scale to a newly created course, or to an existing course whose scale is still the untouched default — it will not overwrite a scale you edited yourself.",
          "Editing the scale by hand is the Pro line. Free accounts see a locked \"Customize grade scale\" row with a PRO badge that opens the paywall; Pro accounts see the scale rendered as chips (A: 90%+, B: 80%+, and so on) that tap through to an editor. Pro turns that into an editor where each row is a letter and a minimum percentage, you can add and delete rows, and the scale is re-sorted descending when you save. Schools that cut A− at 90 and A at 93, or run an eleven-row plus-minus ladder, get modeled exactly.",
          "The letter badge on the grade card is color-coded by its first character (green for anything starting with A, blue for B, amber for C, orange for D, red otherwise) so the color survives whatever custom labels you use."
        ]
      },
      {
        "heading": "The semester GPA estimate",
        "paragraphs": [
          "The Courses tab carries a header card labeled CURRENT SEMESTER GPA ESTIMATE with a number to two decimal places and a line explaining its basis: how many of your courses are reporting a letter, and how many graded credits that represents.",
          "Each course has a credit-hours field, editable from 0.5 to 12 and defaulting to 3. The estimate multiplies each course's grade points by its credit hours, sums that, and divides by total credits. Courses without a letter yet are excluded rather than counted as zero, which is why the card tells you it is reporting on 3 of 5 courses.",
          "The default grade-point table is the standard 4.0 ladder: A+ and A both at 4.0, A− 3.7, B+ 3.3, B 3.0, B− 2.7, C+ 2.3, C 2.0, C− 1.7, D+ 1.3, D 1.0, D− 0.7, F 0. Letter matching is forgiving — it normalizes case and whitespace, and if there is no exact row it falls back to the leading letter-and-sign, so a custom scale label like \"A (Excellent)\" still maps to 4.0.",
          "The GPA scale editor lives in Settings and is Pro. Free accounts can open it and read the table but cannot edit it. Pro accounts can set the exact points their school awards for each letter, anywhere from 0 to 10 points, with duplicate letters rejected and a one-tap restore to the standard 4.0 scale. It is worth being clear about what this changes: it changes GPA estimates, not the percentage cutoffs that determine your letter in a course. Those two live in different places on purpose."
        ]
      },
      {
        "heading": "Forecasting: what do I need on the rest?",
        "paragraphs": [
          "This is the Pro half of grade tracking, and it is built entirely out of numbers you already have.",
          "The \"What do I need?\" card takes every letter on your course's scale and works backward. Required average equals your target percentage times weight total, minus the points you have already banked, divided by the weight still outstanding. Each row gets a verdict. \"Locked in\" with a check mark when you have already secured that letter no matter what happens. \"avg 84% on the rest\" when it is reachable, rounded up so the number is never optimistic, and colored coral when the requirement climbs above 90. \"Needs extra credit\" when the only path runs through the ungraded extra-credit work still on your list. \"Out of reach\" when the arithmetic says no. The header tells you how much is still in play: \"38% still to play for.\"",
          "The final-exam what-if is the other direction. It pulls up to six ungraded assignments, preferring anything typed as an exam or titled with final, midterm, or exam, and lets you tap a hypothetical score — 70, 80, 85, 90, or 100, defaulting to 85. It then re-runs your entire course grade calculation with that score substituted in, categories, drop-lowest, extra-credit policy and all, and shows the projected course grade and letter. It is labeled \"Projected, not saved,\" and nothing is written to your record.",
          "Free accounts see the card in place with the real remaining number in it, and a tap takes you to the paywall. One case is identical for both tiers: once every weighted assignment has been graded, both see the same line (all weighted work is graded, your final grade is locked in) because a forecast with nothing left to forecast is not worth charging for."
        ]
      },
      {
        "heading": "How it connects to everything else in Semora",
        "paragraphs": [
          "Grades are not a standalone screen. The scores you enter feed the rest of the app.",
          "Your Courses tab shows each course's letter and percentage under its name, next to what is due next. Canvas import brings dates rather than scores, so the running average is built from marks you enter yourself, with the same arithmetic as average. Canvas can also carry the late flag, and Semora tracks late submissions separately: you can record an expected penalty and the task screen will show the estimated maximum you can still earn until the real grade is posted, without ever docking a posted score twice.",
          "On the Pro side, Academic Risk alerts read your grade history directly. A course needs at least two graded items; Semora then compares the average of your three most recent grades against the three before them, ordered by when the work was due rather than when you happened to enter it, and raises a falling-grade alert when the drop is seven points or more, or when the course estimate sits below 70. Below 65 it escalates to high severity. Progress Insights needs four graded items before it will draw a trend, and exports a semester CSV with columns for current grade, letter, completion percentage, on-time percentage, missing work, and graded count, plus a print view you can bring to an advising appointment. The Workload dashboard shows how much of each course's grade is still in play.",
          "All of it is one account across iPhone, iPad, and web, syncing in near real time, so a score you enter walking out of a lecture hall is on your laptop when you open it."
        ]
      },
      {
        "heading": "Who this is for, what it costs, and who should skip it",
        "paragraphs": [
          "Grade tracking with weighted averages is on the free plan, and that means the whole engine: point or percentage entry, per-assignment weights, categories, drop-lowest rules, all three extra-credit policies, letter grades from your course's scale, and the semester GPA estimate. Free accounts get one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes, your choice — and hold unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, with one semester total on free, which for a lot of students is a full course load already.",
          "Pro is $3.99 per month or $19.99 per year, which works out to about $1.67 a month annually. It adds editing your course grade scale, editing your GPA scale, both what-if calculators, Academic Risk alerts, and Progress Insights, along with everything else in the Pro tier. Pro can be bought with a card on the web at app.semoraai.com, where Stripe processes the payment, or inside the iOS app through the App Store, and either way it applies to your whole account, including the web app.",
          "It is genuinely useful if your syllabus states weights and your school's LMS does not show a live weighted grade, or shows one you do not trust. It is useful if you have ever rebuilt the same spreadsheet in October. It is useful if your professor drops the lowest two quizzes and you cannot be bothered to model that by hand.",
          "It is less useful if your LMS already publishes an accurate weighted grade you check regularly and you never wonder what you need on the final. And it is not a gradebook of record. It is your estimate, built from what you enter; your instructor's number is the one that goes on the transcript. If you never get around to typing in scores, it will correctly show you nothing."
        ]
      },
      {
        "heading": "The awkward cases",
        "paragraphs": [
          "Nothing graded yet. The card reads \"No grades yet\" with no letter and no bar, and the GPA card says to add grades to completed work to begin tracking. It shows blank rather than a zero, because a zero would be a lie. Weights on the assignments but nothing scored gives the same result — the math needs at least one graded item before it will report anything. No weights anywhere, and the straight-average fallback engages so the card and the GPA estimate stay useful.",
          "Categories that do not total 100 are refused at save, with your current total named in the error. This is intentional friction: a category set that sums to 87 produces a grade that is quietly wrong in a way you would not notice. Drop-lowest set higher than you have grades drops down to one remaining item and stops. Extra credit with no worth entered contributes zero under the bonus rule — the field is there and unfilled, not broken.",
          "A raw grade above 100 is displayed as 100. Extra credit can carry you past the cap in the raw arithmetic; the display clamps. Deleting a category leaves its tasks uncategorized and their scores untouched, and the confirmation says exactly that before you commit.",
          "A grade you entered wrong is the easiest case. Tap the score and it reopens in the mode you originally used, prefilled with the points or the percentage you typed, so correcting a typo does not mean re-deriving anything."
        ],
        "bullets": [
          "No graded work yet shows \"No grades yet\" rather than 0%",
          "Category weights that do not sum to 100% block the save, with your current total shown",
          "Drop-lowest stops at one remaining grade no matter how high you set it",
          "Extra credit with no point value entered contributes nothing under the bonus rule",
          "Any raw grade over 100 is displayed as 100",
          "Editing a posted score reopens it prefilled in the entry mode you originally used"
        ]
      }
    ],
    "faq": [
      {
        "question": "Is grade tracking free?",
        "answer": "Yes, and that means the whole engine: points or percentage entry, per-assignment weights, categories, drop-lowest rules, all three extra-credit policies, letter grades from your course's scale, and the semester GPA estimate. Pro adds editing your course grade scale and your GPA scale, both what-if calculators, Academic Risk alerts, and Progress Insights."
      },
      {
        "question": "How is my current grade calculated?",
        "answer": "It is the weighted sum of your scores divided by the weight you have actually attempted, not by the full semester's weight. That one choice is what keeps the number honest early on: three graded assignments covering 45 percent of the course produce a grade based on that 45 percent, and an unscored final worth 30 percent never drags your October grade toward zero."
      },
      {
        "question": "Can Semora drop the lowest quiz the way my syllabus says?",
        "answer": "Yes. Drop-lowest is set per category, anywhere from 0 to 20, and drops the lowest scores by percentage. It has one safety rule: it will never drop your only graded item, so the drop count is capped at one fewer than the number of graded candidates."
      },
      {
        "question": "What if my professor never publishes weights?",
        "answer": "If none of your graded assignments carry a weight but some of them have scores, Semora falls back to a straight average of the posted grades rather than showing you nothing. It is less precise than a weighted figure, and it is the honest answer when the syllabus does not give you one."
      },
      {
        "question": "Can I use my school's grading scale instead of the default?",
        "answer": "Semora ships with the plain scale \u2014 A at 90, B at 80, C at 70, D at 60, F at 0 \u2014 and every free account gets letter grades from it. Editing the cutoffs to match what your school actually uses is the Pro line, as is editing the grade-point table behind the GPA estimate."
      },
      {
        "question": "Does it calculate my GPA?",
        "answer": "It gives a semester estimate. Each course has a credit-hours field, editable from 0.5 to 12 and defaulting to 3, and the estimate multiplies each course's grade points by its credit hours, sums that, and divides by total credits. Courses without a letter yet are excluded rather than counted as zero. It is your estimate, not a transcript."
      }
    ]
  },
  "smart-plan": {
    "metaTitle": "Smart Plan: Your Study Schedule, Built",
    "metaDescription": "Smart Plan turns your tracked deadlines into dated, timed study sessions for the next 14 days, placed around your classes and rebuilt each time you open it.",
    "h1": "Smart Plan: your study time, already decided",
    "lede": "Smart Plan takes every incomplete deadline you are tracking and lays it out as dated, timed study sessions across the next 14 days — around your class meetings, inside a daily budget you set, in a session length you pick. Then it rebuilds the whole thing every time you open it.",
    "intro": [
      "A deadline list is not a plan. It tells you that a 25 percent midterm lands on the 14th and a lab report lands on the 16th. It does not tell you which evening you are actually going to sit down, for how long, and on what. That gap is where most semesters quietly go wrong: nothing is forgotten, everything is simply started too late.",
      "The two failures look different but come from the same place. The first is underestimating something large — a project that reads as one line on a to-do list and turns out to be six hours of work you cannot compress into the night before. The second is the pile-up, where three courses independently schedule work into the same seven days and no single syllabus warned you, because no single syllabus knew about the others.",
      "Smart Plan closes that gap using data Semora already holds. It reads every incomplete deadline across every course in the selected semester, estimates the effort each one needs, and places that effort as timed sessions across the next 14 days. Then it rebuilds on every visit, so a plan you ignored on Tuesday is not a plan you have to fix on Wednesday."
    ],
    "sections": [
      {
        "heading": "How Smart Plan builds your next two weeks",
        "paragraphs": [
          "The planning horizon is 14 days, starting today. Everything inside that horizon is a straight, repeatable pass over your data — there is no model call and no network round trip in the scheduling itself, which is why the same inputs always produce the same plan.",
          "It starts by collecting every incomplete task in the selected semester that has a readable due date. A task with a start date in the future is held out until that day arrives, so work you deliberately deferred does not get dragged into this evening. For each remaining task it works out an effort estimate in minutes, then subtracts the minutes you have already completed against that task in earlier sessions.",
          "Then it walks forward one day at a time. It skips the day entirely if you have weekends turned off and it is a Saturday or Sunday. Otherwise it sets a starting cursor at your weekday or weekend start time, and on today specifically, at whichever is later, your start time or the current time rounded up to the next quarter hour. It marks out the blocked time on that day, gives the day a minute budget, ranks the eligible tasks, and places sessions from the cursor forward with a 10-minute gap after each one. The day stops at 11:00 PM."
        ],
        "bullets": [
          "Blocked time includes every class meeting scheduled for that weekday, drawn from the meeting times on your course schedule.",
          "Blocked time also includes any session you already completed that day, reserved from its start through its end plus a 10-minute buffer, so a rebuild never stacks new work on top of work you finished.",
          "With \"avoid calendar conflicts\" on, blocked time includes events from your device calendar for that date, padded by 10 minutes on each side.",
          "The day's budget is your daily study capacity minus the minutes you already completed that day, so finishing early genuinely buys the rest of the evening back.",
          "A slot is only used if the whole session fits before the next blocked range; otherwise the placement jumps past that range and tries again.",
          "Nothing shorter than 15 minutes is ever placed."
        ]
      },
      {
        "heading": "How long it thinks each thing will take",
        "paragraphs": [
          "Every task carries an Estimated Effort field when you create or edit it, with presets of Smart estimate, 30m, 1h, 2h, 3h, 4h, and 8h. If you set a real number of 15 minutes or more, that number wins outright — it is your task and you know it better than a heuristic does. Values are capped at 2,880 minutes, which is 48 hours, so a mistyped estimate cannot swallow the entire horizon.",
          "When you leave it on Smart estimate, the planner falls back to a base figure for the task type: 45 minutes for a reading, 60 for other, 75 for a quiz, 90 for an assignment, 240 for an exam, and 360 for a project. That base is then scaled by the grade weight the scan pulled off your syllabus — 1.5x at 25 percent or more, 1.25x at 15 percent or more, 1.1x at 8 percent or more, and unscaled below that. The result is rounded up to the next 15 minutes.",
          "So a midterm worth 30 percent of your grade reads as 240 times 1.5, or six hours of prep, spread across the days you have left. A five-percent reading reads as 45 minutes. None of this is hidden from you: change the type or the weight on the task and the estimate changes with it, and if the estimate is simply wrong, override it with the effort presets and the plan rebuilds around your number."
        ]
      },
      {
        "heading": "What gets scheduled first, and why",
        "paragraphs": [
          "Ordering is where a planner earns its keep, because when the days are full, something has to lose. Each task gets a load score of its grade weight multiplied by a per-type prep multiplier: 3x for an exam, 2.5x for a project, 1.5x for a quiz, 1.2x for an assignment, and 1x for a reading or other. A task with no weight extracted still counts, using a deliberately small base of 5, so an un-weighted exam still outranks an un-weighted reading on the strength of its type alone.",
          "That score is then multiplied by priority (1.55x for High, 0.78x for Low, unchanged for Normal) and divided by how far away the deadline is, floored so that something due today does not divide by zero. Finally a pace term is added: the task's remaining minutes divided by the number of enabled study days between now and its due date. The pace term is what stops a large, distant project from being permanently outranked by a stream of small urgent things until it becomes an emergency.",
          "Within a single day, each task accumulates a share of its remaining work equal to remaining minutes divided by available days, rounded down to a 15-minute multiple. An 8-hour project due in 10 days therefore surfaces as a 30-minute session today and a 45-minute session on each following day, landing exactly on the deadline rather than as a wall on the final weekend. A task due today, or already overdue, skips the spreading entirely and targets its full remaining effort immediately. Ties break by earlier due date, then alphabetically by title, so the order is stable rather than arbitrary."
        ]
      },
      {
        "heading": "The settings you actually control",
        "paragraphs": [
          "Plan preferences sit behind a collapsible panel at the top of the screen, and the header always shows the current values in shorthand — something like \"90m/day · 45m sessions\", so you can see the shape of your plan without opening anything.",
          "Saving runs a single \"Save & rebuild plan\" action: the preferences write and the plan regenerates together, so you never save a setting and then wonder whether it took effect. These preferences live on your account rather than on one device, so changing your session length on your iPhone changes the plan you see on your iPad and on the web."
        ],
        "bullets": [
          "Daily study capacity: 1h, 1h 30m, 2h, or 3h. Default is 1h 30m.",
          "Focus session length: 25, 45, or 50 minutes. Default is 45.",
          "Weekday start time, default 5:00 PM, and a separate weekend start time, default 10:00 AM, both set with a time picker.",
          "Study on weekends, on by default. Turn it off and Saturday and Sunday are skipped completely, which also shortens the available days used for pacing.",
          "Auto-reschedule missed sessions, on by default.",
          "Avoid calendar conflicts, on by default, with a 10-minute buffer on either side of each event."
        ]
      },
      {
        "heading": "When a deadline moves, or you skip a session",
        "paragraphs": [
          "Opening Smart Plan is the reschedule action. It runs on every focus of the screen, not only the first time you launch the app, so coming back to it after three days always produces a plan built for today rather than a stale one built for Monday.",
          "A session counts as missed when it is still unfinished and it is either dated before today, or dated today at a start time that has already passed. The rebuild discards every open session in the semester and regenerates them from today forward against your current tasks, settings, and schedule. Completed sessions are never touched — they stay as history, their minutes stay subtracted from the task's remaining effort, and their time stays reserved on the day they happened.",
          "That combination is what makes the rebuild safe to run over and over. It is deterministic and it never double-counts, so opening the screen five times in an afternoon does not five times duplicate your week. Sessions that moved are labeled in place with \"Moved from\" and the original date, and a status line at the top summarizes what just happened: how many missed sessions moved forward, and how many calendar conflicts were avoided. If nothing notable happened it says the plan was rebuilt from your latest deadlines.",
          "If you would rather the plan hold still, turn off auto-reschedule. The screen tells you it is off, and the refresh button in the top right becomes the only thing that rebuilds it."
        ]
      },
      {
        "heading": "From a plan to actual work",
        "paragraphs": [
          "Sessions are grouped by day with human labels (Today, Tomorrow, then a weekday and date) and each day header carries that day's total. Only today and future days are listed; yesterday's plan is not something you need to look at.",
          "Each row has three actions. The circle on the left marks the session complete. Tapping the row opens the underlying task, so you can check the description or edit the deadline that created the session in the first place. The play button on the right opens the focus timer preloaded with that session's exact length and the task's title, and when the focus phase finishes, the session is marked complete for you.",
          "Above the list, a summary bar shows three live numbers: sessions ahead, total planned time still outstanding, and how much you have already finished today. It is a small thing, but it is the difference between \"I have a plan\" and \"I have done 45 minutes of it.\""
        ]
      },
      {
        "heading": "The Workload dashboard, which is the same data zoomed out",
        "paragraphs": [
          "Smart Plan handles the next 14 days. The Workload dashboard, also included with Pro, handles the semester, and it is genuinely the more useful of the two in the first week of a term, before anything is urgent yet.",
          "The weekly chart buckets every incomplete deadline into ISO weeks spanning your semester's start and end dates, or the range of your own due dates when the semester has none. Each bar is the sum of the same weight-times-type load score the planner uses. A week is flagged as a crunch week when its load is at least one standard deviation above the mean of the loaded weeks and it holds at least two deadlines, so a single heavy exam does not paint a week red on its own, and a semester with evenly spread work correctly flags nothing rather than flagging everything."
        ],
        "bullets": [
          "A crunch callout names the next crunch week, counts the deadlines stacking up in it, and tells you how many crunch weeks the term holds in total.",
          "An exam density strip lists only the weeks that actually contain an exam, earliest first, with the count per week.",
          "Load by course sorts heaviest first and shows the incomplete count, the percentage of the grade still in play, a relative load bar, and the next deadline by title and date. Courses with nothing outstanding are omitted.",
          "The header shows the semester name and how many weeks are left in it.",
          "A short list ranks your three most pressing tasks into Do now, Coming up, and Plan ahead, with a link straight into the timed plan."
        ]
      },
      {
        "heading": "Who this is genuinely for, and who it is not",
        "paragraphs": [
          "Smart Plan is built for a student carrying three or more courses with real weighted syllabi, where at least one course has a multi-week project or a heavy exam and the deadlines are dense enough that ordering matters. It is at its best when you have scanned your syllabi, because grade weights and class meeting times both feed directly into the scheduling.",
          "It is worth less to you if you are taking one course with two deadlines — the ordering problem you would be paying it to solve does not exist yet. It is also a poor fit if you want a fixed, immovable timetable, because the whole design premise is that the plan is disposable and gets rebuilt. And if you have not entered your class meeting times, it cannot avoid classes it does not know about; the same is true for anything that lives only in your head.",
          "One boundary worth stating plainly: the planner's calendar lookup is read-only and iOS-only. It never creates, edits, or deletes an event on your calendar. Writing your schedule out to your calendar app, and .ics export, are a separate Pro feature you turn on deliberately in settings."
        ]
      },
      {
        "heading": "The awkward cases",
        "paragraphs": [
          "Not enough hours is the most common one, and it is surfaced rather than hidden. If work due inside the 14-day window cannot fit in your capacity, an amber banner states exactly how much time is unscheduled and names the two real fixes: raise your daily capacity or lower your task estimates.",
          "Overdue work is not dropped. A task past its due date targets its full remaining effort today rather than disappearing from the plan. A task due later today with a due time keeps its sessions before that time; if that time has already passed, it falls back to the normal day window so it stays actionable instead of vanishing.",
          "Bad data is contained rather than fatal. A class meeting with a missing or nonsensical end time is treated as one hour. A far-future imported due date is capped at a 120-day span for pacing, so a typo cannot make today's contribution round to zero. The weekly chart is capped at 104 weeks and folds anything beyond the last bucket into it, so a stray deadline four years out is never silently dropped from the counts.",
          "Calendar access is handled quietly. Automatic refreshes never prompt for permission, only saving your settings can ask. If permission is denied, or you are on the web where the lookup is unavailable, the plan still avoids your classes and the status line says so directly. All-day events are ignored, since otherwise a single all-day entry would block an entire day, and events that cross midnight are split so each day is compared independently.",
          "Finally, the save itself is validated on the server. Sessions must be between 15 and 180 minutes, every task must be one of yours and still incomplete, and the semester must belong to you. If a save fails, the plan is not left half-written — you get an inline error, and a manual rebuild also raises an alert."
        ]
      }
    ],
    "faq": [
      {
        "question": "How far ahead does Smart Plan schedule?",
        "answer": "Fourteen days, starting today, and it rebuilds the whole thing every time you open it. A plan you ignored yesterday does not sit there as a stale to-do list; it is recomputed against where you actually are."
      },
      {
        "question": "How does it know how long something will take?",
        "answer": "Every task carries an Estimated Effort field with presets of Smart estimate, 30m, 1h, 2h, 3h, 4h and 8h. If you set a real number of 15 minutes or more, that number wins outright. On Smart estimate it falls back to a base for the task type \u2014 45 minutes for a reading, 60 for other, 75 for a quiz, 90 for an assignment, 240 for an exam, 360 for a project \u2014 and scales it by the grade weight the scan pulled off your syllabus."
      },
      {
        "question": "What happens if the work does not fit in the time I have?",
        "answer": "It is surfaced rather than hidden. If work due inside the 14-day window cannot fit in your capacity, an amber banner states exactly how much time is unscheduled and names the two real fixes: raise your daily capacity, or lower your task estimates."
      },
      {
        "question": "Can I control when it puts sessions?",
        "answer": "Yes. Daily study capacity is 1h, 1h 30m, 2h or 3h, defaulting to 1h 30m. Weekday sessions start at 5:00 PM by default and weekend sessions at 10:00 AM, both adjustable, and weekends can be turned off entirely. Avoiding device-calendar conflicts is on by default, with a 10-minute buffer on either side of each event."
      },
      {
        "question": "Is Smart Plan included on the free plan?",
        "answer": "No, it is part of Pro, which is $3.99 a month or $19.99 a year. You can buy Pro with a card on the web at app.semoraai.com, or inside the iOS app through the App Store, and the entitlement applies to your whole account, including the web app."
      }
    ]
  },
  "flashcards": {
    "metaTitle": "Semora Flashcards: AI Decks + Spaced Repetition",
    "metaDescription": "Generate flashcards from your scanned syllabus and uploaded notes, scope a deck to one tracked exam, and review each card on a spaced-repetition schedule.",
    "h1": "Flashcards built from the syllabus you already scanned",
    "lede": "Semora turns a course you have already scanned into a deck of flashcards, then schedules each card so it comes back right before you would have forgotten it.",
    "intro": [
      "Making flashcards is the part everyone skips. You have three exams in nine days, a syllabus you read once in week one, and a folder of lecture slides you have not opened since. Building sixty cards by hand is a real afternoon of work, and it is an afternoon you are trying to spend actually studying. So the cards never get made, and you reread highlighted paragraphs instead, which feels productive and is not.",
      "Semora is already holding the material. When you scanned the syllabus, the parser kept a structured list of every topic and item it found. If you uploaded lecture slides or a reading for the AI Tutor, those files are attached to the same course. Flashcard generation reads exactly those two sources. That is the point of putting flashcards inside a syllabus app rather than beside one: there is nothing new to type, upload, or re-organize before you can start.",
      "This page walks through what actually happens when you tap Generate with AI, what the scheduler does to each card when you grade it, and where the feature stops. Real numbers, real button labels, real error messages."
    ],
    "sections": [
      {
        "heading": "How a deck gets generated, step by step",
        "paragraphs": [
          "Generation is grounded in one course, so it starts from one course. Open a course, scroll to the Study tools card, and tap the Flashcards row. That row hands the course along, and the course is what makes the Generate with AI button appear at the top of your deck list. Reach Flashcards from the Me tab or the web sidebar instead and you get your decks without that button, because no course is attached yet and there is nothing to ground cards in.",
          "Tap Generate with AI and the button expands into a panel with two decisions and one confirm. First, Focus on: whole course, or one specific item you are already tracking. Second, Study material: an optional PDF or photo to add. The confirm button then states what it is about to do in plain words, either Generate for whole course or Generate for Midterm 2, using the item's real title.",
          "Behind that tap, the request goes to a server function that checks three things before spending anything: that your session is valid, that your account is Pro, and that the course actually belongs to you. Only then does it assemble the material and call the model. The Pro check happens on the server, not just in the app, because every generation is a paid model request. If that check itself errors, the function returns a temporary failure rather than treating you as free — a paying account never gets demoted by a database blip."
        ],
        "bullets": [
          "The most recent parse run for that course: up to 60 extracted syllabus items, each as its title and type, trimmed to 8,000 characters.",
          "Up to the 10 most recently uploaded note files for that course, sharing a combined 24,000-character budget, each labeled with its filename.",
          "When you scoped the deck to one item, a \"covered so far\" list built from the course's other tasks — up to 60 of them, ordered by date.",
          "Nothing else. Class meeting times and office hours are never sent, because they are not quizzable."
        ]
      },
      {
        "heading": "Focus the deck on the whole course or one tracked exam",
        "paragraphs": [
          "The Focus on row is a set of chips. The first is Whole course and it is selected by default. After it comes one chip for every exam, quiz, assignment, and reading Semora is already tracking for that course, labeled with its type and title, like \"Exam: Midterm 2\" or \"Reading: Chapter 7\". Projects and items typed as Other are deliberately left out — a project is usually something you build rather than something you recall, and Other is too vague to be a useful focus.",
          "Those chips come from your live tasks, not from the original scan output. That distinction matters more than it sounds. If the scan misread a date and you fixed it, or you renamed \"Exam 2\" to something you actually recognize, the chip shows your corrected version, and the server uses your corrected due date.",
          "Picking a specific item does something more careful than adding \"focus on the midterm\" to a prompt. The server looks at every other task in that course and splits them by real dates: anything already completed, or due on or before your target's due date, goes into a covered-so-far list that gets sent as evidence of what has actually been assigned and taught. Anything due strictly after your target is dropped from the covered-so-far list entirely, so the model's evidence of what has been taught stops at your exam date. The syllabus topic list itself is not date-filtered \u2014 most syllabus topics carry no date to filter on \u2014 so the prompt additionally instructs the model not to generate cards for material that would only be relevant later in the course. If your target has no due date, only completed work counts as covered, which is the conservative read. If nothing qualifies at all, the prompt says so and tells the model to favor foundational, early material rather than guessing.",
          "If a course has no exams, quizzes, assignments, or readings tracked yet, the panel says exactly that and suggests adding one so you can focus generation on it. Whole course still works."
        ]
      },
      {
        "heading": "Attach the review packet your professor handed out",
        "paragraphs": [
          "Under Study material there is a dashed row that reads \"Add a PDF or photo (e.g. the teacher's review packet)\". Tapping it opens the file picker, restricted to PDFs and images. Once something is attached, the row updates to a count — \"2 files added — add another\", so you can stack a study guide, a set of slides, and a photo of the board before generating.",
          "The file goes to a private storage bucket, filed under your own user ID, with the filename sanitized for the path. Nothing is parsed on your phone. The first time a generation or tutor request needs that file, the server reads it, extracts all readable text from it while preserving structure, and caches the result on the note record. The second generation from the same packet costs nothing extra to read. Files larger than 6 MB are skipped for inline extraction rather than blocking your request.",
          "These are the same course notes the AI Tutor uses. Upload a packet here and the tutor can answer from it; upload slides in the tutor and flashcard generation picks them up. There is one note library per course, not two."
        ]
      },
      {
        "heading": "What the generator writes, and what it leaves out",
        "paragraphs": [
          "The generation prompt is specific about what counts as a flashcard. It asks for the academic content — concepts, terms, definitions, formulas, key facts drawn from the syllabus topics and the note text. It explicitly rules out administrative and logistics material: office hours, grading policy, late-work rules, class meeting times. Those are the things a naive \"make cards from my syllabus\" tool fills a deck with, and they are worth nothing on an exam.",
          "The shape is fixed too. The front is a short question or a term. The back is a concise answer or definition, one to three sentences. The target is between 10 and 20 cards, with an instruction that fewer good cards beat padding, and that if the material genuinely does not support that many, it should generate fewer rather than invent filler.",
          "What comes back is validated before anything is saved. Both faces are trimmed, each capped at 300 characters. Any entry missing a front or a back is dropped instead of failing the batch — if fourteen of sixteen cards came back clean, you get the fourteen. No more than 30 cards are inserted from a single run. When there is not a single usable card, nothing is saved and you are told to try again or add more material first.",
          "The deck itself is created on the spot and named for what you asked for: \"Organic Chemistry I — Midterm 2\" when scoped to an item, or \"Organic Chemistry I — AI Generated\" for a whole-course run. The app drops you straight into the new deck when it is done."
        ]
      },
      {
        "heading": "The schedule: what Again, Hard, Good, and Easy actually do",
        "paragraphs": [
          "Every card carries four numbers: an ease factor, an interval in days, a due date, and a count of consecutive successes. A brand-new card starts at ease 2.5, interval 0, due now, zero reps, so anything you create or generate is due in your very next session, with no waiting.",
          "When you grade a revealed card, Semora runs a compact SM-2 variant and writes the next state. The four buttons are not cosmetic; each one moves ease and interval differently.",
          "Ease is clamped at 1.3, the SM-2 floor, both in the scheduler and by a constraint in the database, so a bad week of Again and Hard cannot drive a card into a permanent loop. Intervals of a day or more are rounded to whole days so due dates stay stable and predictable; the ten-minute relapse interval is deliberately left un-rounded so a card you missed genuinely comes back soon rather than tomorrow.",
          "In practice, a card you keep getting right goes 1 day, then 6 days, then 15, then about 38, then roughly three months. A card you keep missing stays in front of you."
        ],
        "bullets": [
          "Again: ease drops by 0.20, the consecutive-success count resets to zero, and the card is due again in about ten minutes instead of tomorrow.",
          "Hard: ease drops by 0.15. A brand-new card graduates to 1 day; an established card gets its current interval multiplied by 1.2 instead of by its full ease.",
          "Good: the standard ladder. First success is 1 day, second success is 6 days, and after that the interval is multiplied by the card's own ease.",
          "Easy: ease rises by 0.15, and the interval is multiplied by that ease and then by a further 1.3 bonus. A brand-new card graded Easy jumps straight to 6 days."
        ]
      },
      {
        "heading": "A study session, start to finish",
        "paragraphs": [
          "Your deck list shows every deck grouped under its course, with the course's own icon and color, and an Uncategorized group at the bottom for decks not tied to a course. Each row shows the total card count, plus a badge with the number due right now when anything is.",
          "Open a deck and the top button reads either \"Study 12 due\" or, when nothing is ready, a flat \"Nothing due right now\" that cannot be tapped. That second state is the feature working, not failing — spaced repetition means some days there is nothing to do in a deck.",
          "Start a session and the due queue is snapshotted at that moment. Grading a card pushes its due date into the future, and without the snapshot the list would reshuffle under you mid-session. A counter shows your position, like 4 / 12, with an Exit link beside it. Tap the card or Show Answer to reveal the back, then pick one of the four grades. When the queue runs out you get a completion screen with the number of cards you reviewed.",
          "Grades are persisted in the background so the next card appears instantly. If a write fails — bad signal on the bus, for instance — the card simply stays due for your next session. Nothing in the session depends on the round trip completing."
        ]
      },
      {
        "heading": "Cards you write yourself",
        "paragraphs": [
          "Generation is optional. New Deck creates an empty deck with a title of up to 80 characters, scoped to the course you came from or left uncategorized if you opened Flashcards on its own. Inside a deck, Add Card gives you two multi-line fields, front and back, and both are required — a card with a blank side is rejected in the app and again by the database.",
          "Every card behaves identically regardless of where it came from. Tap any card in the list to edit its front and back. The trash icon deletes one card after a confirmation. Delete Deck removes the deck and all of its cards together, also after a confirmation. A card you typed and a card the model wrote share the same scheduling fields, so a deck can be half generated and half hand-written with no seam between them.",
          "One difference worth knowing: the 300-character cap per side applies to generated cards, as a defensive clamp on model output. Cards you type yourself are not truncated."
        ]
      },
      {
        "heading": "How flashcards connect to the rest of Semora",
        "paragraphs": [
          "Flashcards are downstream of the scanner. The syllabus you scanned is the grounding source, the tasks Semora extracted become the focus chips, and the notes you attached feed both this and the AI Tutor. Delete a course and its decks are not destroyed — they detach and move to Uncategorized, keeping every card and every review schedule intact. Decks also ignore semester filters on purpose, so last term's deck is still there when the final rolls around.",
          "Flashcards are part of Pro, at $3.99 per month or $19.99 per year, which works out to about $1.67 a month on the annual plan. Pro is bought either with a card on the web at app.semoraai.com, where Stripe handles the checkout, or inside the iOS app through the App Store — and the entitlement applies to your whole account, including the web app, whichever way you paid. Free accounts get a genuinely usable core: full deadline and task tracking, grade tracking with weighted averages, same-day reminders, unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, one AI action for the lifetime of the account to spend on a scan, a lecture recording, or a document turned into notes, and Course Spaces \u2014 joining a classmate's shared course is always free. Pro adds unlimited scans and courses, hosting your own Course Space, Smart Plan, the Workload dashboard, Flashcards, the Focus timer, the AI Tutor, Grade Scale and Forecasting, calendar sync with .ics export, custom 1-day and 3-day reminders with quiet hours, Academic Risk alerts, Progress Insights, and Share and Streaks."
        ]
      },
      {
        "heading": "Who this is for, who it is not, and what happens when things break",
        "paragraphs": [
          "This fits courses where the load is recall. Intro biology, anatomy, psychology terminology, organic chemistry reactions, language vocabulary, history dates, statute names in a law course — anywhere a semester's difficulty is partly the sheer volume of things you have to have memorized cold by a specific Thursday.",
          "It fits less well where the work is producing something rather than retrieving it. Proof-heavy math, a studio course, a semester-long coding project, a seminar graded on three essays — Semora's Smart Plan and Workload dashboard serve those better than a card deck does. Concretely, cards are plain text on two sides. There is no image on a card, no rendered equations, no audio, no cloze deletion, no shared or public decks, and no import from another flashcard app.",
          "Generation also has a hard prerequisite: something to read. If a course has neither a scanned syllabus nor an uploaded note, generation stops before it costs anything and tells you to scan the syllabus or upload notes first. That is the most common reason a generation does not run, and it is fixable in about a minute.",
          "The other failure paths are specific and worth recognizing."
        ],
        "bullets": [
          "The model comes back busy or rate-limited: Semora retries up to three times, then falls back to a second model, and only then tells you the AI is busy and to try again in a minute.",
          "The response gets truncated mid-batch: you are told it generated more than fits in one batch, and that a retry usually succeeds.",
          "The output is malformed: nothing is saved and you are simply asked to try again. Every card fails validation: nothing is saved either, and you are asked to try again or add more material first.",
          "A note file fails to extract: that file is skipped and generation continues with whatever else it has, rather than failing the whole run.",
          "The entitlement check hiccups: you get a temporary-unavailable response instead of being silently treated as a free user."
        ]
      }
    ],
    "faq": [
      {
        "question": "Where do the generated cards come from?",
        "answer": "From material Semora already holds for that course: the most recent syllabus parse, up to 60 extracted items trimmed to 8,000 characters, plus up to the 10 most recently uploaded note files for that course sharing a 24,000-character budget. There is nothing new to type or upload."
      },
      {
        "question": "Can I make a deck for one specific exam instead of the whole course?",
        "answer": "Yes. The generate panel asks what to focus on: the whole course, or one specific item you are already tracking as a deadline. That is what keeps a midterm review from being diluted with material from finals."
      },
      {
        "question": "How many cards does a generation produce?",
        "answer": "It targets between 10 and 20, with an explicit instruction that fewer good cards beat padding. No more than 30 are inserted from a single run. Each side is capped at 300 characters, and any card missing a front or a back is dropped rather than failing the whole batch \u2014 if fourteen of sixteen came back clean, you get the fourteen."
      },
      {
        "question": "How does the review schedule decide what to show me?",
        "answer": "A compact SM-2 variant. Again drops ease by 0.20 and brings the card back in about ten minutes. Hard drops ease by 0.15. Good runs the standard ladder \u2014 one day, then six, then multiplied by the card's own ease. Easy raises ease by 0.15 and adds a further 1.3 bonus. Ease is floored at 1.3, so a bad week cannot trap a card in a permanent loop."
      },
      {
        "question": "Can I write my own cards instead of generating them?",
        "answer": "Yes. New Deck creates an empty deck with a title of up to 80 characters, and Add Card gives you front and back fields, both required. One difference worth knowing: the 300-character cap per side is a defensive clamp on model output, so cards you type yourself are not truncated."
      },
      {
        "question": "Can I add a review packet my professor handed out?",
        "answer": "Yes. Attach it as a PDF or a photo in the generate panel and it becomes part of what the deck is built from, alongside the syllabus and any notes already on the course."
      }
    ]
  },
  "focus-timer": {
    "metaTitle": "Semora Focus Timer: Pomodoro Study Blocks",
    "metaDescription": "Semora's Focus Timer runs 15, 25, 45, or 50-minute focus blocks with 5, 10, or 15-minute breaks, keeps time in the background, and alerts you when each ends.",
    "h1": "Focus Timer: Pomodoro-Style Study Blocks Linked to Your Real Coursework",
    "lede": "A Pomodoro-style timer built into the app that already knows your deadlines. Pick a length, link the block to a task or a planned study session, and get a notification the moment it ends, even if you left the app.",
    "intro": [
      "A college schedule is not a row of open afternoons. It is a 50-minute gap before your next lecture, twenty minutes on a bus, an hour in the library that gets interrupted twice. Most study advice assumes an unbroken block of time you do not actually have, which is part of why the advice bounces off.",
      "The Focus Timer in Semora is a Pomodoro-style countdown built into the app that already holds your syllabus, your deadlines, and your study plan. That matters more than it sounds. A standalone timer knows nothing about the paper due Thursday. You start a block, it counts, it beeps, and you are the only thing connecting those 25 minutes to anything real. Semora's timer opens directly from a task or from a session on your Smart Plan, so the block carries that task's title with it, and finishing the block ticks the planned session off your schedule.",
      "This page describes exactly what the feature does, at the level of detail you would want before paying for it. It is a deliberately small screen: four focus lengths, three break lengths, a countdown that survives you leaving the app, and a notification when the block ends. It is not a study-analytics suite, and the honest limits are spelled out below next to the parts it does well."
    ],
    "sections": [
      {
        "heading": "What you actually see when you open it",
        "paragraphs": [
          "The screen is one column and it fits on a phone without much scrolling. At the top, a pill tells you which phase you are in: FOCUS with a target icon, or BREAK with a coffee cup. Focus is tinted coral, the break is tinted teal, so a glance from across a library table tells you which side of the cycle you are on without reading anything.",
          "Below that sits the countdown card: a large mm:ss timer set in tabular numerals so the digits do not jitter as they tick, a progress bar that fills across the width of the card as the phase elapses, and a one-line status underneath. That status reads \"No focus blocks yet this sitting\" before you have finished anything, then switches to \"1 focus block done\", \"2 focus blocks done\", and so on. If you have ever completed a block on that device, an all-time total is appended after a middle dot.",
          "Under the card are two controls. The primary button is Pause while a block is running, and otherwise reads Start focus, Start break, or Resume, depending on the phase and on whether the current phase is partly elapsed. Next to it is Reset. On iPhone each of these carries a distinct haptic: a medium tap when you start or resume, a lighter one when you pause or reset, a selection tick when you pick a length, and a success pattern the moment a phase completes."
        ],
        "bullets": [
          "A phase pill reading FOCUS or BREAK, color-coded coral and teal",
          "A large mm:ss countdown in tabular numerals, plus a progress bar for the current phase",
          "A live count of focus blocks completed in this sitting, with an all-time total appended",
          "Pause, or Start focus / Start break / Resume, plus a Reset that returns you to a fresh focus block",
          "Focus-length and break-length pickers, shown only while the timer is stopped",
          "A standing note that the timer keeps running in the background and will notify you when the phase ends"
        ]
      },
      {
        "heading": "The four focus lengths and three break lengths",
        "paragraphs": [
          "The focus picker offers 15, 25, 45, and 50 minutes. The break picker offers 5, 10, and 15. A fresh session opens on the classic Pomodoro pairing of 25 and 5.",
          "Those numbers were chosen against a college timetable rather than an office day. Fifteen minutes is what an actual between-class gap gives you once you have walked across campus and sat down, and it is short enough that starting it does not feel like a commitment. Twenty-five is the standard Pomodoro interval and the sensible default if you have no opinion. Forty-five and fifty match the length of a class period, which is a useful anchor: you already know what it feels like to concentrate for a lecture, and 50 lines up with the longest session length Semora's Smart Plan will schedule for you.",
          "Both pickers disappear the moment a block is running. This is intentional. A timer that lets you re-lengthen a phase mid-run is a timer that lets you quietly negotiate with yourself at minute 22, and the countdown you agreed to at the start would stop meaning anything. Pause first if you genuinely want a different length.",
          "One consequence to know: changing a length while paused resets that phase's clock to the full new length. If you are 12 minutes into a 25-minute block, pause, and tap 45, you get a full 45:00 rather than 33 minutes of remainder. The button label changes back from Resume to Start focus to signal exactly that."
        ],
        "bullets": [
          "Focus: 15, 25, 45, or 50 minutes",
          "Break: 5, 10, or 15 minutes",
          "Defaults: a 25-minute focus block and a 5-minute break",
          "Length pickers are hidden while a block is running, so nothing can be re-lengthened mid-countdown",
          "Changing a length while paused restarts that phase at the full new length"
        ]
      },
      {
        "heading": "Starting a block from a task or a planned session",
        "paragraphs": [
          "There are four ways in. The Me tab lists Focus Timer under Academic tools; the web app lists it in the sidebar under the same name; a task's detail screen has a Start focus session button; and every incomplete session on your Smart Plan has a small play button on its row.",
          "The last two are the ones worth using. Opening the timer from a task passes that task's id and title through, and the screen shows a linked banner across the top reading \"Focusing on\" followed by the title. That title then appears in the completion notification, so the alert on your lock screen names what you were supposed to be working on rather than just announcing that time has passed. The Start focus session button is hidden on tasks you have already marked complete, since there is nothing left to sit down with.",
          "Opening it from a Smart Plan session passes something extra: the block's own duration and its id. If that duration is not one of the four standard options — Smart Plan schedules in 15-minute increments and will shorten a block to fit the time left in your day — the picker grows an additional chip at the front of the row showing that exact length, labeled \"plan\" while it is selected. A 30-minute planned session therefore opens as a 30-minute focus block instead of being rounded to something the picker happens to like. Lengths passed this way are accepted between 15 and 180 minutes and rounded to whole minutes; anything outside that range falls back to 25.",
          "Finishing a focus block that came from a planned session marks that exact session complete on your Smart Plan, which is the only lasting record the timer writes anywhere. There is one small piece of care worth knowing about: if you open the timer from one task, never start it, and then open it from a different task, the second task wins and the banner relabels. A session that is genuinely running, or paused partway through, is never overwritten by a new deep link."
        ]
      },
      {
        "heading": "What happens when the countdown reaches zero",
        "paragraphs": [
          "Two things happen, and they are independent of each other on purpose.",
          "The first is a notification. When you press start, Semora schedules a real date-triggered alert with the operating system for the exact moment the phase ends, with sound on. A finished focus block arrives as \"Focus block done\", and if the session was linked to a task the body names it: \"Nice work on\" your task title, \"Time for a break.\" An unlinked block reads \"Nice work — time for a break.\" The end of a break arrives as \"Break over\", with the body \"Break's over. Ready for another focus block?\" Because that alert lives with the OS rather than inside the app, it fires whether the app is foregrounded, backgrounded, or closed.",
          "The second is what happens on screen. The timer advances to the next phase (focus becomes break, break becomes focus) and stops there, paused, with the full new length on the clock. It does not roll straight into the next countdown. You decide when the break starts, which matters when the block ended mid-sentence and you want ninety more seconds before you stand up. On iPhone you also get a success haptic at the moment of completion if the app is open.",
          "Only a completed focus phase counts for anything. It increments the count for this sitting, increments the all-time total, and marks the linked Smart Plan session complete. Finishing a break increments nothing. Pausing and never coming back counts as nothing."
        ]
      },
      {
        "heading": "Leaving the app mid-block, and why the clock stays honest",
        "paragraphs": [
          "Most naive timers store a remaining-seconds number and subtract one every second. That breaks the moment you switch apps, because background JavaScript timers get throttled or suspended and the counter silently falls behind reality.",
          "Semora stores the timestamp at which the phase ends and recomputes the remaining time from the current clock twice a second while running. The displayed time is therefore correct no matter how long you were away — there is nothing to drift. The app also re-reads the clock the instant it returns to the foreground, so you never see a stale number for a beat before the next tick lands.",
          "The running session is written to the device's secure storage, so it survives more than backgrounding. Force-quit the app mid-block, relaunch, reopen the timer, and you are looking at the correct remaining time on the correct phase with your cycle count intact. If the block finished while you were away, reopening the timer settles it up: the block is credited, the linked planned session is marked done, and the timer sits on a paused break waiting for you. The notification will already have arrived on its own.",
          "Pausing cancels the scheduled notification so it cannot fire for a block you stopped, and freezes the remaining time exactly. Resuming schedules a fresh alert for the new end time. Reset cancels it too, returns you to a focus phase and zeroes the count for that sitting. One rough edge: resetting while a break is on the clock currently carries the break length onto the focus phase, so tap your focus length again to get the full block back."
        ]
      },
      {
        "heading": "What gets counted, and what does not",
        "paragraphs": [
          "Two numbers are tracked. The sitting count is the number of focus blocks you have completed since your last reset, and it is what drives the \"3 focus blocks done\" line under the clock. The all-time number is a running total of completed focus blocks stored on that device.",
          "Be clear about what that second number is. It is a local counter on one device, not an account statistic. It does not travel to your other devices or to the web app the way your courses and deadlines do through Semora's realtime sync, and signing in elsewhere will not bring it with you. Resetting the timer does not touch it.",
          "Beyond those two counters, the timer keeps no history. There is no log of individual sessions, no chart of hours by course, no weekly focus report. Completed focus blocks do not feed Streaks, which are calculated from tasks completed on days that actually had work due, and they do not appear in Progress Insights. The one durable, syncing trace a focus block leaves is a Smart Plan session ticked off, which is genuinely the useful one, because that is what your plan reads when it rebuilds and works out how much effort a task has left."
        ]
      },
      {
        "heading": "Free versus Pro",
        "paragraphs": [
          "The Focus Timer is a Pro feature in full. Free accounts that tap it get a preview screen (the clock icon, a short description, and a button through to the paywall) rather than a limited number of sessions.",
          "That is worth stating plainly, because most of Semora's core is free and stays free. On a free account you get unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, complete deadline and task tracking, grade tracking with weighted averages, same-day reminders, free access to any Course Space a classmate invites you into, and one AI action for the lifetime of the account to spend on a syllabus scan, a lecture recording, or a document turned into notes. That is a working deadline tracker without paying anything.",
          "Pro is $3.99 per month or $19.99 per year, which works out to about $1.67 a month on the annual plan. It is bought with a card on the web at app.semoraai.com, through Stripe, or inside the iOS app through the App Store, and the entitlement applies to your whole account either way, so the timer is available in the web app too. Alongside the Focus Timer, Pro covers unlimited scans and courses, Smart Plan, the Workload dashboard, flashcards, the AI tutor, Grade Scale and Forecasting, calendar sync with .ics export, custom reminder timing at one and three days out with quiet hours, Academic Risk alerts, Progress Insights, and Share and Streaks."
        ],
        "bullets": [
          "Free: unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, deadlines and tasks, weighted grade averages, same-day reminders, joining a classmate's Course Space, and one AI action for the lifetime of the account | Pro: $3.99 per month or $19.99 per year, about $1.67 a month billed annually \u2014 plus Canvas, Blackboard, and Moodle import subject to school policy and platform configuration, and hosting your own Course Space",
          "Pro: $3.99 per month or $19.99 per year, about $1.67 a month billed annually",
          "Pro is bought by card on the web or inside the iOS app, and applies account-wide either way \u2014 iPhone, iPad, and the web app",
          "Free users see a preview of the timer with a link to the paywall, not a trimmed-down version of it"
        ]
      },
      {
        "heading": "How a focus block fits the rest of Semora",
        "paragraphs": [
          "The timer is the last step in a chain the rest of the app builds. Your syllabus gets scanned into real deadlines. Smart Plan takes those deadlines and lays study sessions across the next two weeks, working around your class meetings automatically, in 15-minute increments, with a ten-minute buffer after each session so the schedule is something a human could actually follow.",
          "The numbers line up on purpose. Smart Plan's session length setting offers 25, 45, or 50 minutes and defaults to 45, three of the four lengths in the focus picker. Its daily study cap offers 60, 90, 120, or 180 minutes and defaults to 90, which is two 45-minute sessions. Weekday sessions start at 5pm by default and weekend sessions at 10am, and you can turn weekends off entirely. So when you tap the play button on a planned session, the focus length you land on is the one your own planner settings produced, not a number the timer invented.",
          "What you do inside the block is the rest of Semora's job. Flashcards can generate a deck for one specific tracked exam from the syllabus and any lecture notes you have uploaded, which is a good fit for a 25-minute block. The AI tutor answers from that course's actual syllabus, your notes, and your live deadlines when you get stuck, so you are not leaving the block to go searching. Grade Scale and Forecasting tells you which assignment is actually worth the next 50 minutes."
        ]
      },
      {
        "heading": "Who this is for, who it is not, and the rough edges",
        "paragraphs": [
          "This is for you if your problem is starting. A named length and a linked task takes the negotiation out of the front of a study session, and 15 minutes on a specific paper is a much smaller thing to agree to than \"work on the paper\". It is also for you if you already use Smart Plan, because the play button on a planned session closes the loop between deciding to study and having studied.",
          "This is not for you if you want a strict Pomodoro implementation. There is no automatic long break after four cycles, and no forced auto-advance from one phase into the next, every transition waits for you to press the button. It is not a distraction blocker, there is no ambient sound or music, and it will not report how many hours you put into each course this semester. If any of those are the reason you are shopping, this particular feature will not be the reason to subscribe.",
          "A few edges to know before you rely on it. In the browser the timer runs while the tab is open, but the end-of-phase notification and the saved session are native-only, so a reload loses the block and no alert arrives — do timed work on iPhone or iPad and use the web app for planning. If you decline notification permission, scheduling is skipped and the on-screen countdown still behaves exactly as before; a failed notification is never treated as a failed session. And the quiet-hours setting that holds back deadline reminders does not suppress this alert, because you asked for it by starting a timer — an 11pm focus block will still tell you when it is over."
        ],
        "bullets": [
          "No automatic long break after four cycles, and no forced auto-advance between phases",
          "No app blocking, website blocking, or built-in ambient sound",
          "No per-course time totals, session history, or weekly focus report",
          "On the web, no end-of-phase notification and no session saved across a reload",
          "A denied notification permission is skipped quietly; the countdown itself is unaffected"
        ]
      }
    ],
    "faq": [
      {
        "question": "What lengths does the timer offer?",
        "answer": "Focus blocks of 15, 25, 45 or 50 minutes, and breaks of 5, 10 or 15. A fresh session opens on the classic Pomodoro pairing of 25 and 5. The lengths were picked against a college timetable rather than an office day \u2014 15 minutes is what a real between-class gap gives you once you have walked across campus and sat down."
      },
      {
        "question": "Does it keep time if I leave the app?",
        "answer": "Yes. The timer keeps time in the background and alerts you when each phase ends, so the clock stays honest whether or not the app is in front of you."
      },
      {
        "question": "Can I change the length in the middle of a block?",
        "answer": "The pickers disappear the moment a block is running, on purpose \u2014 a timer you can renegotiate at minute 22 is a countdown that stops meaning anything. Pause first if you genuinely need to. One consequence: changing a length while paused resets that phase to the full new length, so pausing 12 minutes into a 25 and tapping 45 gives you a full 45:00, not 33 minutes of remainder."
      },
      {
        "question": "Can I start a timer straight from a planned study session?",
        "answer": "Yes. Opening the timer from a Smart Plan session passes that block's own duration through. Smart Plan schedules in 15-minute increments, so if the length is not one of the four standard options the picker grows an extra chip for it \u2014 a 30-minute planned session opens as a 30-minute block rather than being rounded. Lengths passed this way are accepted between 15 and 180 minutes."
      },
      {
        "question": "Is the Focus Timer free?",
        "answer": "No, it is part of Pro at $3.99 a month or $19.99 a year, which works out to about $1.67 a month on the annual plan. Pro is bought with a card on the web at app.semoraai.com, or inside the iOS app through the App Store, and it applies account-wide either way, so the timer is available in the web app too."
      }
    ]
  },
  "ai-tutor": {
    "metaTitle": "AI Tutor: Chat Grounded in Your Syllabus",
    "metaDescription": "Semora's AI Tutor answers from your course's real syllabus, your live tracked deadlines, and lecture notes you upload. It never invents a due date.",
    "h1": "AI Tutor: a study chat that has actually read your course",
    "lede": "Ask about your course and get an answer built from your own syllabus, your live deadlines, and the lecture notes you uploaded, not from a generic search. For anything involving a date, it answers strictly from what you are tracking.",
    "intro": [
      "It is Tuesday. You have a problem set due, a reading you half-skimmed, and a question about the difference between two ideas your professor treated as obvious. You could search for it and get an answer written for somebody else's course, in somebody else's notation, referencing a textbook you do not own. You could post in the group chat and wait. Or you could ask something that has already read your course.",
      "General chatbots are good at explaining concepts and bad at knowing your situation. They do not know your professor said the midterm covers chapters one through six and not seven. They do not know your essay moved from the 14th to the 21st. Ask one when your final is and it will either decline or, worse, produce a date that looks right.",
      "Semora's AI Tutor is the same class of model doing a narrower job. Before it ever sees your question, the server assembles a packet of your real course material (what your syllabus scan pulled out, what you are currently tracking as due, and the text of the lecture notes you uploaded) and instructs the model to answer from that first. It is part of Pro, at $3.99 per month or $19.99 per year."
    ],
    "sections": [
      {
        "heading": "What the tutor is handed before it answers",
        "paragraphs": [
          "Every message you send triggers a fresh context build on the server. Nothing is precomputed from last week. The tutor sees your course as it stands the moment you press send, assembled into three labeled blocks.",
          "The first is the syllabus and course block. It carries the course name, the instructor if you recorded one, then your class meetings rendered as lines like \"lecture: Mon/Wed 10:00-11:15 @ Room 214\" — labs and discussion sections included, since those are stored as their own meeting kinds. If you have customized your grading scale, the cutoffs go in as plain text: A at 93 percent and up, B at 83 and up, whatever your school actually uses. Last come the structured items from your most recent syllabus scan of that course, each with its weight, due date, and type, drawn from the same six categories the scanner uses: assignment, quiz, exam, project, reading, or other.",
          "The second block is deadlines, built from the tasks you are actually tracking on that course, sorted by due date, with completed items marked done and weights and due times riding along.",
          "The third is lecture notes: the extracted text of the files attached to the course, each headed by its filename so the tutor can tell you which document a point came from."
        ],
        "bullets": [
          "The syllabus block is capped at 8,000 characters and carries up to 60 items from your latest scan.",
          "The deadlines block is capped at 8,000 characters and up to 60 tasks.",
          "Notes are read newest first: the 10 most recent files for that course, sharing a 24,000-character budget of extracted text.",
          "A syllabus or deadlines block that has to be cut is explicitly marked as truncated, so the model knows it is working from an abridged source. Note text that runs past the shared 24,000-character budget is simply cut at the budget.",
          "The last 12 messages of your conversation are replayed each turn for continuity.",
          "When there is no course material at all, the model is told so directly and asked to invite you to add a syllabus or notes."
        ]
      },
      {
        "heading": "How one message actually travels",
        "paragraphs": [
          "The screen is a plain chat. You type, you press the arrow, your message appears as a bubble immediately while the request is in flight, usually three to ten seconds. Underneath that spinner, a fixed sequence runs.",
          "The model call goes to OpenAI GPT-5.6 Luna with low reasoning and an output ceiling of 2,048 tokens: enough for a worked explanation without inviting an essay. If OpenAI returns a retryable error, the function backs off and retries up to three times. You see one spinner; the retry policy runs beneath it."
        ],
        "bullets": [
          "The request has to declare its size, and the body has to be under 256 KB. A chunked stream that tries to slip past the size check is rejected before anything else happens.",
          "Your session is validated, then the database is asked whether you are Pro. This is a server-side check, not the app's local flag, so a stale or lapsed client cannot talk its way in, and a momentary database blip returns a temporary-unavailable error rather than quietly demoting a paying account.",
          "One message is reserved from your daily allowance, atomically, under a per-user lock. Reserving before the model call is what stops ten fast taps from all sneaking past the cap together.",
          "The conversation is confirmed to be yours, and the course to ground on is read from the conversation record itself. The course ID your app sends along is treated as a hint for a brand-new thread, never as permission to read a course.",
          "The three context blocks are built, the recent turns are replayed, your new message is appended, and the model is called.",
          "Both turns — your message and the reply — are written to the database on the server, so your history stays consistent even if the app is killed mid-answer."
        ]
      },
      {
        "heading": "Deadline answers come from your task list, not the model's memory",
        "paragraphs": [
          "One line in the tutor's instructions is not a preference. If you ask about deadlines or dates, it must answer from the deadlines section, and it must never invent a date.",
          "That matters more than it sounds. The deadlines block is built from your live task list, not from the raw text of the syllabus PDF. If your professor pushed the essay back a week and you moved it in Semora, the tutor says the new date. If a deadline arrived from a Canvas sync instead of a scan, it lands in the same task list and grounds the answer identically. The syllabus block and the deadlines block can disagree with each other, and when they do, the deadlines block is the one describing what is actually true now.",
          "There is a matching limit worth stating plainly. The deadlines block carries titles, types, due dates, due times, weights, and whether you have checked something off. It does not carry your scores. The tutor knows the final is worth 30 percent and that you have not done it yet. It does not know you got a 74 on the midterm. Grade math lives in Semora's grade tracking and forecasting screens, not in the chat."
        ]
      },
      {
        "heading": "Uploading lecture notes",
        "paragraphs": [
          "Tap Add notes in the bar above the conversation and pick a file. The picker accepts PDFs and images, so an exported slide deck, a scanned reading, or a photo of the whiteboard all count.",
          "Your device does no parsing. It uploads the raw file to a private storage bucket under a path keyed to your account, then records a pointer to it. The first time the tutor needs that file, the server downloads it and has the model transcribe every readable line, preserving structure, and caches the result. Every later message reuses the cached text, so you pay the extraction cost once per file rather than once per question. The same cached text is what flashcard generation reads, so a review packet you attach here is transcribed once and used by both features.",
          "Uploaded files appear as chips you can tap to remove. The confirmation says exactly what removal means: that file will no longer ground the tutor. Removing it deletes both the record and the stored file.",
          "Two constraints are worth knowing up front. Notes attach to a course, so if you opened the tutor without one, the app tells you to open it from a course first instead of accepting an orphan file. And a file over roughly 6 MB is skipped at extraction time rather than sent to the model. That skip is quiet (the answer still arrives, just without that document behind it) so if a large scanned PDF does not seem to be landing, split it or export it smaller."
        ]
      },
      {
        "heading": "One thread per course, plus a general one",
        "paragraphs": [
          "There is no thread list to manage. Open the tutor from a course and you land in that course's rolling conversation, the same thread you were in last week, history intact. The composer placeholder becomes a prompt to ask about that course specifically, and so does the empty state before your first message.",
          "Open it from the Me tab instead and you get a general thread with no course attached. That still works, but the server tells the model outright that no course material is attached and asks it to invite you to add a syllabus or notes, and the empty state on screen says the same thing. It is an honest downgrade rather than a silent one.",
          "Scoping is also what keeps courses from bleeding into each other. Your organic chemistry thread is grounded on organic chemistry's syllabus, tasks, and notes, and nothing else. Ask it about your statistics midterm and it will tell you that is outside what it has."
        ]
      },
      {
        "heading": "The limits, in real numbers",
        "paragraphs": [
          "The daily cap applies even though the tutor is a Pro feature. It exists to bound what the model costs to run, and it lives on the server so it can be adjusted without shipping an app update. One honest caveat: the slot is reserved before the model is called, so on the rare occasion a request fails upstream, it still spends one of the fifty. That is the trade for a cap a burst of taps cannot blow past."
        ],
        "bullets": [
          "50 tutor messages per rolling 24 hours per account. Rolling, not a midnight reset.",
          "4,000 characters per message, enforced in the composer and checked again on the server.",
          "256 KB maximum request size.",
          "60 syllabus items and 60 tasks per context build.",
          "10 note files per course in the grounding pass, sharing 24,000 characters of extracted text.",
          "12 previous messages replayed per turn — roughly six exchanges of working memory.",
          "2,048 output tokens per reply."
        ]
      },
      {
        "heading": "How it connects to the rest of Semora",
        "paragraphs": [
          "The tutor keeps no copy of anything. It reads the same records the rest of the app writes, which is why the order you do things in matters.",
          "It is worth being equally clear about what it does not touch. It does not read your office hours entries, your entered scores, your Smart Plan, or your other courses. The view is deliberately narrow: one course, and the material you gave it."
        ],
        "bullets": [
          "Your syllabus scan populates the structured items the tutor quotes back at you. A course with no scan and no notes gives it nothing course-specific to work from.",
          "Edits you make to a deadline anywhere in the app change what the tutor says the next time you ask.",
          "Notes uploaded here are the same notes flashcard generation reads, sharing one transcription.",
          "Class meeting times and your custom grade scale, both set on the course, land in the tutor's context automatically.",
          "Pro is bought with a card on the web at app.semoraai.com, where Stripe handles the checkout, or inside the iOS app through the App Store, and the entitlement applies account-wide, so the tutor is available on iPhone, iPad, and the web app under the same login. You only ever pay once."
        ]
      },
      {
        "heading": "Who this is genuinely for",
        "paragraphs": [
          "This is for the student who has already put a course into Semora and now wants to interrogate it. With a scanned syllabus, a tracked deadline list, and a few weeks of slides uploaded, the tutor is unusually good at questions like what is actually on the midterm, explain the difference between these two terms the way my notes framed it, or I have four things due next week and I need to know which one is worth the most.",
          "It is a poor fit in four situations, and it is better to say so than to let you find out after paying."
        ],
        "bullets": [
          "You want graded work done for you. The tutor is instructed to explain reasoning and guide you toward an answer rather than produce it, and that is deliberate.",
          "You have nothing in the app yet. An empty course gives you a general chatbot, which you can get for free elsewhere.",
          "You want long formatted documents. Replies are plain text by instruction (short paragraphs and bullets, no markdown headers) and capped at 2,048 tokens.",
          "You are on the free tier. The tutor is Pro. Free accounts see a description of what it does and a route to the paywall, not a reduced version of the chat."
        ]
      },
      {
        "heading": "What happens when things go wrong",
        "paragraphs": [
          "Chat features fail in boring ways, and knowing which failure you are looking at saves you from retyping.",
          "The failure mode to watch for yourself is the quiet one. If a note file was too large to extract, or a syllabus block was truncated, the tutor does not print a warning in the chat. It answers with what it has. So when a reply seems to be missing something you know is in your material, checking that the file actually uploaded is the first thing to do."
        ],
        "bullets": [
          "The send fails: your bubble is rolled back and the text you typed is restored to the composer. You do not lose a message you already wrote.",
          "The model returns nothing, or a safety filter blocks the completion: you get a message asking you to rephrase, not an empty bubble.",
          "Google is overloaded: after the retries and the fallback model, you are told the tutor is busy and to try again in a minute.",
          "Your Pro status lapsed, or the app's cached flag is stale: the server flags it and the app routes you to the paywall rather than a dead-end error.",
          "A note file cannot be downloaded or transcribed: that failure is non-fatal. The answer still comes back, just without that document in context.",
          "You hit the daily cap: the error names the number and tells you to try again in 24 hours."
        ]
      }
    ],
    "faq": [
      {
        "question": "What does the tutor actually know about my course?",
        "answer": "Before it sees your question, the server assembles your real course material: your class meetings including labs and discussion sections, your grading scale, the structured items from your most recent syllabus scan (capped at 8,000 characters and up to 60 items), your currently tracked deadlines (also 8,000 characters and up to 60 tasks), and the extracted text of your uploaded notes. A block that had to be cut is explicitly marked as truncated so the model knows it is working from an abridged source."
      },
      {
        "question": "Can it tell me when something is due?",
        "answer": "Yes, and deadline answers come strictly from your actual tracked task list rather than from the model's memory. It never invents a date. Ask about something outside what you have given it and it says so plainly instead of making something up."
      },
      {
        "question": "Does the tutor know my grades?",
        "answer": "No, and this is worth stating plainly. The deadlines block carries titles, types, due dates, due times, weights, and whether you have checked something off. It does not carry your scores. The tutor knows the final is worth 30 percent and that you have not done it yet; it does not know what you got on the midterm."
      },
      {
        "question": "Is there a limit on how much I can ask?",
        "answer": "Fifty tutor messages per rolling 24 hours per account \u2014 rolling, not a midnight reset \u2014 and 4,000 characters per message. The last 12 messages of a conversation are replayed each turn, which is roughly six exchanges of working memory."
      },
      {
        "question": "Can I upload lecture notes for it to read?",
        "answer": "Yes, as a PDF or a photo. Notes attach to a course, so open the tutor from a course first rather than on its own. The 10 most recent files for that course are read newest first, sharing a 24,000-character budget of extracted text. A file over roughly 6 MB is skipped at extraction rather than sent to the model."
      }
    ]
  },
  "collaboration": {
    "metaTitle": "Course Spaces: Share a Course in Semora",
    "metaDescription": "Course Spaces share one course's deadlines and group assignments with classmates over an invite link. Your grades, reminders, and planner stay private.",
    "h1": "Course Spaces: one shared course, one private planner",
    "lede": "A Course Space puts one class's deadlines and group work somewhere your whole study group can see, updating live. Your grades, your reminders, and your own checkmarks stay yours.",
    "intro": [
      "Every group chat for every class ends up in the same place. Someone asks whether the lab report is due Thursday or Friday. Three people answer differently. One of them is looking at a screenshot from week two. The professor moved the date in an announcement nobody scrolled far enough to read, and by the time it gets sorted out the answer is buried under forty messages about parking.",
      "The usual fix is a shared doc or a spreadsheet somebody volunteers to maintain. It works for about two weeks. Then the person who owns it stops updating it, half the group forgets it exists, and everyone drifts back to asking in the chat. The problem was never that people are lazy. It is that the shared thing lives somewhere separate from the place each person actually plans their week, so keeping it current is unpaid work for one volunteer.",
      "A Course Space is Semora's answer to that. One course, one shared space, an invite link, and exactly two kinds of shared content: deadlines the course owner publishes, and group assignments anybody with edit rights adds. Everything the space knows flows into each member's own planner as ordinary tasks they control. Nothing else crosses over. Your grades, your reminder settings, your notes, and your own progress never leave your account."
    ],
    "sections": [
      {
        "heading": "What a Course Space actually is",
        "paragraphs": [
          "A space is attached to one course. You reach the feature from the Me tab, under Academic tools, on the row labeled Class Collaboration. The hub lists every space you belong to with its member count and your role in it, and underneath that, the courses in your current semester that do not have a space yet.",
          "When a space is created it copies the course's name and color, so it looks like the course you already track rather than a generic room. The database enforces one space per course, so there is no way to end up with two competing spaces for the same class. The creator is written in as the first member with the owner role in the same transaction that creates the space, using the display name on their profile, falling back to the part of their email before the @ sign.",
          "The space itself holds two kinds of shared content and nothing else. Shared deadlines are the course's real due dates, published by the owner from their own copy of the course. Group assignments are the pieces of group work the team divides up between themselves. Everything else in Semora stays personal, by design."
        ]
      },
      {
        "heading": "Creating a space and sending the invite link",
        "paragraphs": [
          "In the hub, tapping a course under Start a course space creates the space and drops you straight into it. From there, the Invite button hands you a link through the normal iOS share sheet, with a message that names the course, so you can drop it into whatever group chat the class already uses.",
          "The link is not a guessable code. The server generates 24 random bytes and renders them as a 48-character hex token, then stores it with an expiry and a use counter. Owners and editors can both create invites; viewers cannot. Every tap of Invite mints a fresh link, and old ones keep working until they hit one of their limits.",
          "Owners get a settings sheet showing how many invite links are still outstanding for the space (the ones that have not been revoked, have not expired, and still have uses left) with a one-tap Revoke that kills all of them at once. That is the fix for the usual accident: the link got pasted into a Discord server with three hundred people in it, and you would like that to stop being true."
        ],
        "bullets": [
          "Token: 24 random bytes, rendered as 48 hexadecimal characters",
          "Expires 7 days after it is created",
          "Good for up to 30 joins by default (the schema permits 1 to 200)",
          "Created by owners and editors; never by viewers",
          "Revocable by the owner at any time \u2014 one tap kills every outstanding link for the space.",
          "Automatically revoked for everyone the moment the space is archived"
        ]
      },
      {
        "heading": "What happens when a classmate taps the link",
        "paragraphs": [
          "The link opens Semora on a join screen that says what they are agreeing to before they agree to it: they will see shared deadlines and group assignments, and their personal grades, reminders, and planner stay private. Then there is one button.",
          "If they are not signed in, the invite is not lost. The token is stashed on the device (Keychain on iPhone and iPad, browser storage on web) and they get sent to sign-in. As soon as they have an account, the app takes them back to the join screen with the invite still attached. Without that hand-off, a signed-out classmate's invite would quietly dead-end at a sign-up form, which is where most group invites go to die.",
          "Joining is checked on the server, not in the app. The invite row is locked while it is verified as not revoked, not past its expiry, and not out of uses. If any of those fail, the join is refused with a plain message that the invite is invalid or expired. New members land as editors. Their display name comes from their profile, then their email's local part, then the fallback \"Classmate\". Tapping your own link again after you have already joined just refreshes your display name — it does not burn another use of the link, so a classmate who taps twice does not eat someone else's slot."
        ]
      },
      {
        "heading": "The three roles, and what each one can actually do",
        "paragraphs": [
          "There are exactly three roles: owner, editor, and viewer. They are enforced by row-level security in the database, not just hidden buttons in the app, so a viewer stays a viewer even if someone gets creative with a modified client.",
          "Owners manage roles from the member list. A viewer can be flipped to editor and back with one tap, and any member can be promoted to owner. Promoting someone to owner is how a sole owner hands off a space: the app confirms it first, because it grants full control including the ability to delete the space, and it leaves you an owner too so nothing changes hands by accident.",
          "The database refuses to let a space end up with nobody in charge. The last owner cannot leave, cannot be demoted, and cannot be removed. Any of those attempts comes back as an instruction to promote another owner or delete the space first."
        ],
        "bullets": [
          "Viewer — reads shared deadlines, group assignments, and the member list. Cannot add, edit, complete, or invite.",
          "Editor — everything a viewer can do, plus creating and editing group assignments, checking them off for the team, and generating invite links.",
          "Owner — everything an editor can do, plus publishing course deadlines, changing roles, removing members, revoking invites, and archiving or deleting the space.",
          "New joiners are editors by default; the owner can drop anyone to viewer afterward.",
          "Only owners get the Publish button, so in practice the course calendar has one source of truth."
        ]
      },
      {
        "heading": "What syncs into your planner, and what stays private",
        "paragraphs": [
          "Publishing is deliberate. The owner taps Publish, and Semora copies the not-yet-completed tasks from their own copy of the course into the space as shared deadlines: title, description, task type, due date, due time, and points possible. Completed work is skipped. Each shared deadline remembers the task it came from, so publishing again after the professor moves a date updates the existing entry in place instead of stacking a duplicate on top of it. The app tells you how many went out.",
          "On the receiving side, syncing pulls those shared deadlines and every group assignment into your own planner as normal tasks. If you have not pointed the space at a course you already track, Semora creates one for you in your selected semester, named after the space, in the space's color, with a people icon so you can tell at a glance where it came from. Owners can relink a space to an existing course from the settings sheet, which re-runs the sync so the shared work lands in the course you were already using.",
          "Once they are in your planner, they behave like any other task. Same-day reminders apply. If you are on Pro, they feed Smart Plan and show up in the Workload dashboard like everything else. Enter a score on one and it counts toward your weighted average, privately.",
          "The line between shared and private is drawn narrowly and held in the schema. Three tables sync: members, shared deadlines, and group assignments. Your completion state is yours specifically — a re-sync refreshes a task's title and dates but deliberately never touches your checkmark, so the group finishing a task cannot silently uncheck or re-check your copy. Points possible is merged rather than overwritten, so a number you typed in yourself does not get blanked by an empty field upstream."
        ],
        "bullets": [
          "Shared with the space: shared deadlines, group assignments, member names and roles",
          "Never shared: your scores, weighted average, and grade forecasts",
          "Never shared: your reminder timing, quiet hours, notes, flashcards, and AI Tutor chats",
          "Never shared: which tasks you have personally checked off",
          "Invite links are readable only by the person who created them",
          "Your synced copies are ordinary tasks — edit, reschedule, or delete them in your own planner without touching anyone else's"
        ]
      },
      {
        "heading": "How the live part works",
        "paragraphs": [
          "Semora keeps an open realtime subscription to the space's members, shared deadlines, and group assignments, filtered to that one space. When someone adds a group assignment or the owner republishes after a date change, the change lands on everyone's screen rather than waiting for a manual refresh.",
          "There are two subscriptions running, not one. The space screen refreshes what you are looking at. A second, quieter one runs app-wide for every space you belong to, so a deadline published while you are on the Today tab syncs into your planner anyway, and your task list, stats, and courses all refresh with it.",
          "The background sync is written to stay out of your way. It skips when the device is offline. It will not start a second sync for a space that is already syncing. If a sync fails, it fails silently and the space stays available for an explicit retry with the My planner button — a background collaboration hiccup should never interrupt whatever you were actually doing. It also re-runs whenever the app comes back to the foreground, which is the case that matters most: you were in class with your phone away, and three things changed while you were not looking."
        ]
      },
      {
        "heading": "Joining is free; hosting a space is Pro",
        "paragraphs": [
          "Joining a classmate's Course Space is free and always will be. You do not need Pro to accept an invite, see shared deadlines, or take on group work \u2014 and you can sync all of it into your planner — a shared course counts as one you added by hand, so on free it needs the one slot that is not already taken by another. That matters, because the person who most needs the shared calendar is rarely the person who set it up.",
          "Hosting your own space — creating one and running it as owner — is part of Pro, which is $3.99 a month or $19.99 a year, about $1.67 a month on the annual plan. Pro is bought with a card on the web at app.semoraai.com, where Stripe handles the checkout, or inside the iOS app through the App Store, and it applies to your whole account either way, including the web app. The gate is enforced on the server, not just in the app, and if your Pro lapses the app routes you to the upgrade screen rather than showing a raw database error.",
          "In practice that means one person in the group needs Pro, and everyone else joins for free. If your Pro lapses later, the spaces you already own do not vanish and the deadlines you already published stay published."
        ]
      },
      {
        "heading": "Leaving, removing, archiving, deleting",
        "paragraphs": [
          "Editors and viewers can leave a space from its screen. Owners manage the space from Settings instead \u2014 to step away, promote another owner, then archive or delete the space (the database also blocks the last remaining owner from leaving). The app is explicit about what that means before you confirm: you stop seeing new shared deadlines and group work, and your own planner stays exactly as it is. Everything already synced into your tasks remains — you keep the semester you built, minus future updates.",
          "Owners can remove someone else from the member list, with the same promise attached: their synced planner keeps what it already has. There is no way to reach back into a former member's account and delete their work, which is the correct behavior even when the reason for removal is that the group fell apart.",
          "Owners get two ways to end a space. Archiving takes it out of every member's hub and revokes all outstanding invites, while leaving everyone's synced planner items untouched. Deleting is permanent: the space and all its shared deadlines and group assignments are destroyed for everyone. Even then, each member's personal task copies survive in their own planner — they simply stop receiving updates, because the link back to the space is severed rather than cascaded."
        ],
        "bullets": [
          "Leave — self only; blocked for the last remaining owner",
          "Remove member — owners only; cannot remove yourself, cannot remove the last owner",
          "Archive — hides the space for everyone and kills outstanding invites; planner items stay",
          "Delete — permanently destroys shared deadlines and group assignments for everyone",
          "In all four cases, tasks already synced to a member's planner are left alone"
        ]
      },
      {
        "heading": "Where it gets awkward, and who this is really for",
        "paragraphs": [
          "The honest edge cases. The invite link opens the Semora app, so a classmate who has never installed Semora will tap it and get nothing — send them to the App Store first, then resend the link. An expired or used-up link fails with a clear message rather than a blank screen, and the fix is always the same: ask for a fresh one. If you have no semester selected, the sync tells you to pick one before it can put anything in your planner. And if you are on the free plan and have already used your one hand-added course for the term, the space's auto-created course cannot be added — you will still see the space and everything in it, but the planner sync for that one space will not have anywhere to land.",
          "This is genuinely useful for a lab section that shares a deadline calendar, a project team splitting a build across four people, a study group that keeps missing the same quiz dates, and anyone who has been the unpaid group-chat secretary for a semester and is done with it. Assigning group assignments to a specific person, or to Everyone, is what makes the second case work — the app checks against the member list, so you cannot assign work to somebody who is not actually in the space.",
          "It is not the right tool for a few things, and it is worth saying so. It is not a chat app; there is no messaging, only titles, notes, dates, and assignees. It is not a file locker for a shared draft. It is not a way to compare grades with the group, and that is intentional. And it is not a substitute for the LMS your school actually grades in — if your course lives in Canvas, sync that separately and use the space for the group work Canvas never knew about."
        ]
      }
    ],
    "faq": [
      {
        "question": "Do I need Pro to join a classmate's course?",
        "answer": "No. Joining a Course Space is free and always will be \u2014 no time limit, no Pro required to accept an invite, see shared deadlines, or take on group work. You can sync all of it into your planner — on free a shared course uses the one hand-added slot, and classes that arrive from Canvas never consume it. Hosting your own space is the Pro half, so in practice one person in the group needs Pro and everyone else joins free."
      },
      {
        "question": "How does the invite link work?",
        "answer": "The server generates 24 random bytes and renders them as a 48-character hex token, then stores it with an expiry and a use counter \u2014 it is not a guessable code. A link is good for up to 30 joins by default. Owners and editors can create invites; viewers cannot. Every tap of Invite mints a fresh link, and invite links are readable only by the person who created them."
      },
      {
        "question": "Can my classmates see my grades?",
        "answer": "No. Exactly three things sync: members, deadlines the course owner publishes, and group assignments. Your completion state is yours specifically \u2014 a re-sync refreshes a task's title and dates but deliberately never touches your checkmarks \u2014 and any score you enter counts toward your weighted average privately. Comparing grades with the group is not something a Course Space does, and that is intentional."
      },
      {
        "question": "What are the roles, and can a space end up with nobody in charge?",
        "answer": "There are owners, editors and viewers. Owners manage roles from the member list and can promote anyone, which is how a sole owner hands off a space. The database refuses to leave a space unowned: the last owner cannot leave, cannot be demoted, and cannot be removed, and any attempt comes back as an instruction to promote someone else or delete the space first."
      },
      {
        "question": "What happens to a space I host if my Pro lapses?",
        "answer": "The spaces you already own do not vanish, and the deadlines you already published stay published."
      }
    ]
  },
  "canvas-sync": {
    "metaTitle": "Canvas Sync for Semora — Import Canvas Deadlines",
    "metaDescription": "Canvas Sync imports assignments and due dates free on every plan, using the private Calendar Feed link Canvas already gives you.",
    "h1": "Canvas Sync: pull your Canvas assignments into Semora",
    "lede": "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
    "intro": [
      "Canvas already knows every assignment your professors posted. What it does not do is tell you that three of them land in the same 48 hours, or remind you the night before, or show you what your grade looks like if you skip the discussion post. It gives you six course pages and leaves the arithmetic to you.",
      "So most students end up doing the copying by hand. You open each Canvas course, scroll the assignments tab, and retype the due dates into a planner or a phone calendar. It takes an hour at the start of the semester and it is wrong by week three, because a professor pushed the paper back a week and you were the last person to hear about it.",
      "Canvas Sync is Semora's way of skipping that copying step. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. If the connector is unavailable or not permitted, scan the syllabus or paste the assignment list into Semora instead."
    ],
    "sections": [
      {
        "heading": "The current Canvas connector and its limits",
        "paragraphs": [
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. They do not currently provide a Semora OAuth or institution-managed sign-in flow.",
          "Canvas's Calendar Feed needs no administrator involvement at all. Canvas documents OAuth as the approved authorization route for applications used by multiple users. Do not use the token connector unless your institution permits it.",
          "If the connector is unavailable or not permitted, scan the course syllabus or copy the Canvas assignment list and paste it into the scanner on the web app. Both routes keep a review step before deadlines are added."
        ]
      },
      {
        "heading": "Checking availability and importing courses",
        "paragraphs": [
          "Learning-platform import is free on every plan. Start from Semora's connection screen and choose Canvas; there is no institutional permission to confirm.",
          "The current screen asks for your school's Canvas address, often a school-specific instructure.com URL, and the access token generated in Canvas. Semora requires a valid HTTPS address and reports an invalid address before attempting the connection.",
          "After the token is accepted, choose the active courses you want to import and the Semora semester where they belong. If token use is unavailable or not permitted, use the syllabus scanner or paste the assignment list instead."
        ],
        "bullets": [
          "Open learning-platform connections in Semora and choose Canvas.",
          "Enter your school's HTTPS Canvas address if prompted.",
          "Enter a Canvas access token only if your institution permits third-party token use.",
          "Choose the active courses and semester you want to import.",
          "If no direct connection is available, scan the syllabus or paste the assignment list."
        ]
      },
      {
        "heading": "Choosing which courses come in",
        "paragraphs": [
          "Tap “Find my courses” and Semora asks Canvas for your active enrollments only. Dropped courses and finished semesters still sitting in your Canvas account do not show up, which spares you from scrolling past last spring's classes to find this term's.",
          "Everything that comes back is pre-selected. Tap any course to deselect it, or use Clear and Select all to flip the whole list at once. You also name the connection, it defaults to “Canvas”, and pick which semester the imported courses belong to, defaulting to your active one. If you have not created a semester yet, the screen links you straight to that step instead of failing on save.",
          "Each course you keep becomes a real Semora course, not a read-only mirror. It gets a color from a rotating set of six, a book icon, and a permanent link back to its Canvas counterpart, and exactly one Canvas course maps to exactly one Semora course. From there it behaves like every other course in the app: rename it, add your own tasks alongside the imported ones, track grades in it.",
          "The import is all-or-nothing. If something fails partway through — a network drop or an authorization error — Semora rolls back the connection and any courses it had started creating before reporting that nothing was saved. You do not end up with three of your five classes imported and no clear way to tell which two are missing."
        ]
      },
      {
        "heading": "What actually gets imported from each assignment",
        "paragraphs": [
          "For every assignment in the courses you selected, Semora pulls the full record, not just a title and a date. Descriptions arrive with the HTML stripped out (script and style blocks removed, tags flattened, the common entities decoded, whitespace collapsed) so you get readable text instead of Canvas markup pasted into your planner.",
          "Semora also guesses a type for each item so your calendar is not one undifferentiated wall of “assignment.” If Canvas marks the submission type as a quiz, it becomes a quiz. Otherwise the title is matched: midterm, final, exam, or test becomes an exam; quiz becomes a quiz; project becomes a project; read, reading, or chapter becomes a reading; everything else stays an assignment. It is a keyword match, not comprehension, so a paper called “Unit 3 Response” lands as a plain assignment. You can change the type on any task in two taps.",
          "Here is what ends up on each imported task:"
        ],
        "bullets": [
          "The title, and the description as plain readable text.",
          "The due date and time, converted to your device's local clock from the absolute timestamp Canvas returns, so an 11:59 p.m. deadline stays 11:59 p.m. instead of drifting by your UTC offset.",
          "Points possible, your points earned, and a percentage score computed from the two when both exist.",
          "Not submission status. The Calendar Feed carries no record of what you have handed in, so completion in Semora is yours to set.",
          "A link back to the assignment's own Canvas page, opened straight from the task in Semora."
        ]
      },
      {
        "heading": "How refreshing works after the first import",
        "paragraphs": [
          "Refreshes use the same Calendar Feed link as the initial Canvas import. Semora shows the current connection state so you can tell whether imported coursework is up to date or needs attention.",
          "When the token is valid and your device is online, Semora can refresh coursework during normal app use. If a refresh fails, the connection records a status instead of silently presenting the import as current.",
          "You can also force one. Every connection in Settings has a “Sync now” button, and it reports back exactly what happened: how many assignments were updated, and how many were skipped for not having a usable due date. Each connection carries a plain-language health state you can read at a glance — never, syncing, success, partial, error, or credentials required.",
          "After each successful sync, Semora reschedules the reminders on your tasks. That is the part that makes a moved deadline actually useful: when a professor pushes a paper from Tuesday to Friday, the notification moves with it instead of firing on the old date.",
          "If the token expires or is revoked, Semora marks the connection as needing attention. Reconnect only if your institution permits third-party token use, or use a syllabus scan or pasted assignment list instead."
        ]
      },
      {
        "heading": "What Semora can do with a Canvas connection",
        "paragraphs": [
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm that your institution permits third-party token use before connecting.",
          "Semora uses the connection to list courses and read assignments and gradebook data. It does not submit coursework, post, edit, or delete anything in Canvas.",
          "There are guardrails on any school address you enter. The URL must be HTTPS; localhost, .local hostnames, and private network ranges are refused, while redirects are limited to the same origin.",
          "Disconnecting removes the connection from Semora. Coursework already imported into your planner, including your completion history and grades, remains available unless you delete it separately."
        ]
      },
      {
        "heading": "What a sync will never overwrite",
        "paragraphs": [
          "Every synced assignment is matched on a composite key: the connection, the Canvas course, and the Canvas assignment ID. Running a sync twice does not create duplicates, and the same import repeated ten times produces the same result as running it once.",
          "Nothing gets deleted, either. If an assignment disappears from Canvas, Semora keeps the task along with your completion state and any grade attached to it. The sync function explicitly declines to authorize removals, on the reasoning that bounded pagination or a visibility rule on the school's side could make a perfectly valid assignment look like it vanished. Even where a removal is authorized, the database marks the task rather than deleting it, and the task screen labels it as no longer listed in the LMS but kept in Semora.",
          "Fields Canvas owns get refreshed on every pass — title, description, type, due date, due time, and which course it belongs to. Fields you own are protected, and the rules are specific rather than vague:"
        ],
        "bullets": [
          "Grades are never touched by a sync. The Calendar Feed carries no scores, so the number you typed in cannot be overwritten by an import.",
          "Completion is a logical OR. If you have checked a task off in Semora, no sync will un-check it, even if Canvas has not registered the submission yet.",
          "The same applies to the late flag: once something is marked late, a later sync will not quietly clear it.",
          "If Canvas cannot supply a trustworthy submission timestamp, Semora leaves the completion time unknown rather than stamping the sync time, because using sync time could make on-time work look late."
        ]
      },
      {
        "heading": "Blackboard and Moodle, honestly",
        "paragraphs": [
          "Semora lists Canvas, Blackboard, and Moodle. Canvas connects with the private Calendar Feed link Canvas already gives you, with no token and no school approval; Blackboard and Moodle still use a school-issued token, so their availability depends on school configuration.",
          "When Blackboard import is available, Semora can read course lists and gradebook columns for titles, due dates, and point totals. Depending on the institution's setup, score or submission detail may be more limited than Canvas.",
          "When Moodle import is available, Semora can read enrolled courses and assignment activities. Separately configured quiz activities may sit outside that scope, and non-numeric grade scales are ignored rather than treated as negative points.",
          "For Canvas, the connection screen asks for the private Calendar Feed link Canvas already gives you: no token, and nothing for your school to approve."
        ]
      },
      {
        "heading": "What it costs, who it is for, and where it gets awkward",
        "paragraphs": [
          "Connecting a learning platform is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Blackboard and Moodle still use a school-issued token, so their setup varies by school. Pro is $3.99 per month or $19.99 per year, which works out to about $1.67 a month on the annual plan. It can be bought with a card on the web at app.semoraai.com, where Stripe processes the payment, or inside the iOS app through the App Store, and applies to your whole account either way, including the web app. The entitlement check happens on Semora's server before your school is ever contacted, so a free account gets a clear upgrade screen rather than a connection that mysteriously fails halfway.",
          "You still get full deadline and task tracking, grade tracking with weighted averages, same-day reminders, joining a classmate's Course Space (hosting your own is Pro), one AI action for the lifetime of the account, and unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, with one semester total on free. There is also a manual route: copy the text off a Canvas page or a syllabus PDF, paste it into Semora's scanner, and it pulls every deadline out of it in under a minute. That spends your one free AI action, so on free it is worth aiming at the course with the messiest schedule — typing deadlines in by hand stays unlimited and costs nothing at all, and Pro lifts the cap.",
          "Canvas Sync is not for everyone. If your professor never posts assignments to Canvas and keeps everything in the syllabus, scanning the syllabus is the better path and it is free. If you want to submit work or message your instructor, Canvas stays where that happens — Semora is an organizing layer on top, deliberately read-only. And a few edges are worth knowing before you connect:"
        ],
        "bullets": [
          "Assignments with no due date in Canvas are skipped. Semora marks the connection “partial” and tells you exactly how many were skipped, so it is visible rather than silent.",
          "If you already created a course by scanning its syllabus, importing that same class from Canvas creates a second course. Semora does not merge the two — pick one route per class.",
          "Semora does not pull instructor names from the Canvas course list, so imported courses arrive with the instructor field blank. You can fill it in yourself.",
          "A sync covers up to 50 courses at a time, and pagination through each course's assignments stops at a bounded number of pages — generous for a normal course load, but not unlimited.",
          "There is no per-course on/off switch after import. To change which courses sync, disconnect and reconnect with a different selection.",
          "If the Canvas token expires or is revoked, the connection shows “credentials required” and offers a Reconnect action. Reconnect only if your institution permits third-party token use."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is Canvas import free?",
        "answer": "No. Learning-platform import is free on every plan. The free plan still covers the same job from the syllabus side: one AI action for the lifetime of the account to spend on a scan, unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, unlimited deadlines and tasks you add yourself, grade tracking with weighted averages, and same-day reminders."
      },
      {
        "question": "How does Semora connect to Canvas?",
        "answer": "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve."
      },
      {
        "question": "What if my school does not allow token access?",
        "answer": "Scan the syllabus, or paste the Canvas assignment list straight into the scanner. Both routes run through the scanner, so on a free account either one spends your single lifetime AI action, and if your professor keeps everything in the syllabus rather than posting to Canvas, scanning is the better path anyway."
      },
      {
        "question": "What actually gets imported?",
        "answer": "Your active enrollments only, so dropped courses and finished semesters do not show up. For each assignment you get the title, the due date and time converted to your device's local clock from the absolute timestamp Canvas returns, the points, and a guessed type so your calendar is not one undifferentiated wall of \u201cassignment\u201d \u2014 a Canvas quiz becomes a quiz, and titles containing midterm, final, exam or test become exams."
      },
      {
        "question": "Will a sync overwrite work I have already done?",
        "answer": "No. A re-sync refreshes titles and dates but leaves your own state alone. If Canvas cannot supply a trustworthy submission timestamp, Semora leaves the completion time unknown rather than stamping the sync time, because using sync time could make on-time work look late."
      },
      {
        "question": "Does it work with Blackboard and Moodle?",
        "answer": "Both are part of the same Pro learning-platform import, and setup varies by school. A sync covers up to 50 courses at a time, and pagination through each course's assignments stops at a bounded number of pages \u2014 generous for a normal course load, but not unlimited."
      }
    ]
  }
};

export function getFeatureContent(slug: string): FeatureLongForm | undefined {
  return FEATURE_CONTENT[slug as FeatureSlug];
}
