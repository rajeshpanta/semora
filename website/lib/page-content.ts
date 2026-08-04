/**
 * Long-form body content appended to the hub and landing pages.
 *
 * Same contract as lib/feature-content.ts: written against the shipping
 * source, then adversarially fact-checked and corrected. Do not change a
 * number, a limit or a tier here without re-verifying it in the app — FOUR
 * separate tier claims on this site turned out to be wrong when checked
 * against the actual gates (the intro offer, Canvas import, Course Spaces
 * hosting, and the one-semester free cap).
 */
export interface PageSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PageLongForm {
  sections: PageSection[];
  faq: { question: string; answer: string }[];
}

export type PageKey =
  | 'features'
  | 'pricing'
  | 'compare'
  | 'blog'
  | 'support'
  | 'ai-syllabus-scanner'
  | 'ai-study-planner-for-college'
  | 'canvas-deadline-tracker';

export const PAGE_CONTENT: Partial<Record<PageKey, PageLongForm>> =
{
  "features": {
    "sections": [
      {
        "heading": "One scan, and everything else is downstream",
        "paragraphs": [
          "Semora is one chain, not a folder of separate tools. The scan is the input step and every other feature reads what the scan produced. That is why the feature list looks long while the actual work is short: you handle each syllabus once, in about the time it takes to photograph five pages, and the deadlines, class meeting blocks, grade weights and letter-grade cutoffs that come out of it become the raw material for the calendar, the grade math, the planner, the workload analysis, the flashcards and the tutor.",
          "The chain runs in a specific order. The scanner extracts the course and instructor, the meeting blocks with days and rooms, the semester start and end, the letter-grade scale, and every assignment, quiz, exam, project and reading it can find with a due date, a due time, a percentage weight and a confidence score. On a course you are creating for the first time, the course record, its meeting times and its grading scale are written for you straight away. Only the deadlines wait, on a review screen where you edit, deselect and approve them. Approve, and they appear in Today and in the Calendar tab. Enter a score against any of them and your weighted average updates immediately, because the weights already came off the syllabus rather than out of your memory.",
          "A re-scan behaves differently on purpose, and it is worth knowing before your professor posts version two. Scanning a revised syllabus into a course you already have merges the deadlines in, but it will not rewrite the schedule you have already touched: the meeting and office-hour rows are written on first creation only, and the grading scale is replaced only if you have left it on the default. So a revision that moves the lecture to a new room, or swaps 30 percent midterm for 25, lands as deadlines and nothing else — update the meeting times or the scale by hand on the course screen. It is a deliberate trade: the app would rather keep your corrections than overwrite them with a fresh guess.",
          "Everything above that layer is analysis of those same rows. The workload engine scores each dated task as its grade weight multiplied by a prep-effort factor — an exam counts three times, a project 2.5, a quiz 1.5, an assignment 1.2, a reading 1 — so a week holding two exams reads as heavy even when your professor never printed a percentage next to them. Smart Plan takes the same tasks and lays study sessions across a fourteen-day horizon, working around the class times the scan already knows about. Academic Risk watches three specific things: a grade trending down, work that has gone missing, and a week that is overloaded. Flashcards and the AI tutor read the same syllabus text plus any lecture notes you attach, so there is nothing to re-upload.",
          "The practical consequence is worth stating plainly. Every planning and study feature is only as good as how much of your semester is actually in the app. Two half-entered courses give Smart Plan and the Workload dashboard almost nothing to reason about. Four scanned courses with real weights and a few graded items make both sharp within a week. Scan first, grade as you go, and the rest of the product has something to work with."
        ],
        "bullets": [
          "Scan: course, instructor, meeting days, times and rooms, term dates, the letter-grade scale, and every dated item with weight and confidence.",
          "Re-scan: a revised syllabus merges into the course you already have and brings the deadlines with it. Meeting times are never overwritten, and the grading scale is only replaced if you have not edited it — schedule changes stay a manual edit.",
          "Review: only deadlines need your approval. Items under 0.8 confidence are badged for verification, dates outside the term are flagged, and undated items sit deselected in a \"Needs a date\" group.",
          "Track: Today surfaces what is next and what is overdue; Calendar shows the term in month or list view, color-coded per course.",
          "Grade: a weighted average that reflects only what has been graded so far, with extra credit adding to the numerator without inflating the denominator.",
          "Plan: Workload names the crunch weeks, Smart Plan fills the days, Academic Risk says what is slipping and what to do first.",
          "Study: flashcards and the tutor are scoped to a course you have already scanned."
        ]
      },
      {
        "heading": "What 5 scans and 4 courses actually cover",
        "paragraphs": [
          "The free tier is 5 syllabus scans per calendar month, up to 4 courses, and one semester for the account. The three numbers are not enforced identically, and the difference is worth a sentence. The scan limit is checked in three places: in the app, in the parsing function on the server before any paid extraction runs, and again by a database trigger. The course limit and the semester limit are checked in two: in the app, and by a BEFORE INSERT trigger on the database. Either way they behave the same on iPhone, iPad and the web app, and none of them can be talked around by a client that decides to skip a check.",
          "Run the week-one math. A standard full-time load in the US is four or five courses. Four syllabi is four scans, which leaves one spare inside the same month for the professor who posts a revised version in the first fortnight. The scan counter is not a lifetime allowance: it resets at the start of each calendar month, UTC. A syllabus that changes in October costs you one of October's five, not one of five you will ever get. Photo scans are counted per submission, so five pages captured in a single pass is one scan, not five.",
          "Scans and courses are separate limits, and knowing that saves you money. Re-scanning a syllabus for a course you already have merges into that existing course — matched by course code, or by exact name when the syllabus has no code — so it costs a scan but not a course slot. What that merge will not do is overwrite the schedule: the deadlines come through, the meeting times stay as you left them, and the grading scale is only refreshed if it is still the untouched default. The limit that actually stops a normal student is the fifth course, and it stops you the same way whether that course arrives by scan, by hand, or by joining the Course Space a classmate is hosting.",
          "One more limit belongs on an honest map, and it is the one people meet late: a free account gets one semester, total. Not one live at a time with a fresh one each term — one. That is why the 4-course cap does not refresh in January; on free there is no second semester to start. Deleting the finished semester from the Courses tab is the only way to free the slot, and the delete cascades: that semester's courses, deadlines, grades and history go with it, and nothing is archived. If you want last spring still readable next spring, that is what unlimited semesters on Pro are for."
        ],
        "bullets": [
          "5 scans per calendar month, resetting on the 1st, UTC. Five photographed pages in one submission counts as one.",
          "4 courses — for the account, not per term, because free is one semester. That covers a four-course load exactly and leaves a five-course load one short.",
          "Re-scanning a course you already have merges into it: a scan spent, a course slot kept, your schedule edits untouched.",
          "Deadlines, tasks and subtasks are never capped. Add as many as you want on free.",
          "Grade tracking with weighted averages and your semester GPA are free, on every course you have.",
          "Joining a Course Space a classmate hosts is free — note that the course it imports takes one of your four slots.",
          "One semester total on free; unlimited semesters and courses on Pro, with no monthly cap on scanning."
        ]
      },
      {
        "heading": "Where the Pro line actually falls",
        "paragraphs": [
          "The clean way to describe the split: free is enough to know what is due and where you stand. Pro is for deciding what to do about it, plus the connective tissue to other platforms, other people and other calendars. Nothing in the free tier expires or quietly degrades — the scan counter refills on the 1st of every month, and the free features stay on for as long as you keep using the app.",
          "Two boundaries get misreported often enough to be worth stating directly. First, Canvas, Blackboard and Moodle import is Pro, not free. It is gated on the server, so the paywall is not a client-side suggestion. The free route into Canvas is real and worth using: open the assignments page, select the text, and paste it into the scanner's paste box on the web app, which accepts 20 to 60,000 characters. You get the same extraction and the same review screen. It costs one of your five monthly scans and nothing else.",
          "Second, Course Spaces splits down the middle. Hosting a shared course — creating the space and sending the invite — is Pro, and that check runs on the server too. Joining a space a classmate invites you to is free, permanently, with no time limit and no card; the only thing to watch is that the course it imports counts against your four. One person in a study group holding Pro is enough for that whole group to work off the same synced deadlines.",
          "Pricing is $3.99 a month or $19.99 a year, which works out to about $1.67 a month and roughly 58 percent less than paying monthly. The purchase happens inside the iOS app through StoreKit, and the entitlement applies to your whole account, the web app included. There is no separate web checkout to buy through and nothing to activate on the browser side beyond signing in."
        ],
        "bullets": [
          "Free: scanning, 4 courses, unlimited deadlines and tasks, weighted grade tracking and semester GPA, same-day reminders, Today and Calendar, and joining a Course Space.",
          "Pro capacity: unlimited courses, unlimited semesters, and no monthly cap on scans — scanning is bounded only by a fair-use ceiling of 20 in any 24 hours, which a normal term never approaches.",
          "Pro decisions: Smart Plan, Workload dashboard, Academic Risk alerts, Grade Scale and Forecasting, Progress Insights with trend charts, CSV export and a print view.",
          "Pro study tools: AI flashcards with SM-2 spaced repetition, the focus timer, the AI tutor grounded in your own course.",
          "Pro connections: Canvas, Blackboard and Moodle import, hosting Course Spaces, device calendar sync with .ics export, and 1-day and 3-day reminders with quiet hours."
        ]
      },
      {
        "heading": "Start with the feature that matches what is breaking",
        "paragraphs": [
          "Feature lists are a bad way to choose a starting point, because you do not have a feature problem, you have a specific thing going wrong. Match the symptom instead. Most of these take under ten minutes to set up, and the two that matter most in week one — scanning and grade tracking — cost nothing.",
          "If the problem is that you genuinely do not know what is due, scan every syllabus you have and stop there for the day. Today and Calendar will carry you for weeks on the free tier alone. If the problem is that you know what is due but keep starting too late, that is Smart Plan: it defaults to 90 minutes a day in 45-minute sessions, starting at 5pm on weekdays and 10am at weekends, and it reschedules around your class meetings rather than pretending your afternoons are empty. If the problem is being blindsided, that is the Workload dashboard, which shows the crunch weeks before you walk into them.",
          "If the problem is that you cannot tell whether you are actually fine in a course, start with grades: enter the scores you already have and read the weighted average. Add Grade Scale and Forecasting when you need the reverse question answered, which is what you need on what is left to land a specific letter. If the problem is that you sit down to study and lose twenty minutes deciding what to study, generate a flashcard deck scoped to one upcoming exam rather than the whole course, and run the focus timer against it."
        ],
        "bullets": [
          "\"I do not know what is due\" — Scan, then Today. Free.",
          "\"I know, but I start too late\" — Smart Plan, 14-day horizon, sessions of 25, 45 or 50 minutes. Pro.",
          "\"Two exams landed in the same week and I never saw it coming\" — Workload dashboard. Pro.",
          "\"I do not know where I stand\" — Grade tracking and semester GPA (free), then Forecasting (Pro).",
          "\"I waste the first twenty minutes of every session\" — Flashcards scoped to one exam, plus the focus timer. Pro.",
          "\"My deadlines already live in Canvas\" — paste the assignment text into the scanner on the web app (free), or connect the LMS with a token you generate yourself (Pro).",
          "\"It is already on fire\" — Academic Risk, which names the failing grade, the missing work or the overloaded week and gives you a recovery order. Pro."
        ]
      },
      {
        "heading": "One account on iPhone, iPad and the web",
        "paragraphs": [
          "There is one account and three surfaces: a universal iOS app that runs on iPhone and iPad, and a web app in any browser. You sign in once. Courses, deadlines, grades and settings live server-side, so there is no export-and-reimport step to move between devices and no single device holding the canonical copy. Exports do exist — they are an output, not a workaround for sync: Pro adds a CSV and a print view of the semester report, and an .ics file of the whole term.",
          "Changes propagate over a realtime connection rather than waiting for a manual refresh. Tick something off in a lecture on your phone and the laptop tab you left open in the library updates within seconds. Bulk changes are handled sensibly too: importing a scanned syllabus writes many deadline rows at once, and those are collapsed into a single refresh instead of dozens. When an app comes back from the background, or a browser tab regains focus, or a device reconnects after losing signal, Semora re-fetches once to catch anything it missed while suspended. Edits you make to tasks while offline queue locally and retry with backoff when you are back.",
          "The surfaces differ where the hardware differs, and only there. Scanning on iOS uses the camera, your photo library or the Files app; the web app adds drag-and-drop onto the scan frame and pasted text, which is the fastest and most accurate path when you are on a laptop with the syllabus already open. The iPhone app is portrait; on iPad it rotates all four ways and reflows live for Split View. Wide browser windows switch to a persistent left sidebar. iOS also gets home-screen widgets for what is up next and what is due this week, and device calendar sync writes to the calendar on your phone or iPad — that one does not run in a browser, where the equivalent is the .ics export. Pro is purchased on iOS only, and read everywhere."
        ],
        "bullets": [
          "Same account, same data, on iPhone, iPad and web.",
          "Near real-time sync of courses, deadlines and semesters between devices.",
          "Catch-up refresh on app resume, tab focus and network reconnect.",
          "Offline task edits queue on device and flush automatically.",
          "Web-only input paths: drag-and-drop and pasted syllabus text, 20 to 60,000 characters.",
          "iOS-only extras: home-screen widgets, device calendar sync, and the StoreKit purchase that turns Pro on account-wide.",
          "Pro exports that work anywhere you sign in: semester report as CSV, a print view, and an .ics file of the term."
        ]
      }
    ],
    "faq": [
      {
        "question": "Do the 5 free scans reset each month, or is that a lifetime limit?",
        "answer": "They reset. The free tier gives you 5 scans per calendar month, and the counter starts again on the 1st, measured in UTC. It is not a lifetime cap. Four syllabi in week one leaves one spare that month for a revised version or a course you add late, and next month you get another five. A photo scan of up to five pages submitted in one pass counts as one scan, not five."
      },
      {
        "question": "Is Pro scanning actually unlimited?",
        "answer": "There is no monthly cap on Pro, which is the limit that matters in practice — scan as many syllabi as your term throws at you, in any month. There is one fair-use ceiling behind it: 20 scans in any rolling 24 hours, after which the scanner asks you to try again tomorrow. It exists to stop scripted abuse of a paid extraction endpoint, and a normal student, even one re-scanning revisions for six courses in a single afternoon, will not reach it."
      },
      {
        "question": "Is 4 courses enough for a normal full-time semester?",
        "answer": "For a four-course load, yes, completely. A typical 12 to 15 credit semester is four or five courses, so the free limit covers the smaller of those exactly and leaves a five-course semester one short. Re-scanning a syllabus for a course you already have merges into it rather than creating a second, so revisions do not eat a slot. Two things push you to Pro: a fifth course, and the next term — free is one semester in total, not four courses per term, so a second semester needs Pro or a destructive delete of the first."
      },
      {
        "question": "I bought Pro on my iPhone. Do I pay again to use it on the web?",
        "answer": "No. Pro is purchased once in the iOS app through StoreKit and the entitlement is attached to your account, not to the device. Sign in to the web app with the same account and the Pro features are already on. There is no separate web checkout, no second charge and no activation code. The browser reads and refreshes the entitlement your iPhone purchase created."
      },
      {
        "question": "Can I use Semora without scanning anything?",
        "answer": "Yes. You can create courses by hand and add deadlines, subtasks and grades manually, and the grade math, Calendar, Today and reminders all work the same way on hand-entered data. The scanner is a shortcut for the tedious part, not a requirement. It matters most in week one, when you are facing four syllabi at once; after that, most people are adding one task at a time anyway."
      },
      {
        "question": "What happens to my data if I stop paying for Pro?",
        "answer": "Nothing is deleted. The free limits are checked when you add something new, so courses, semesters, deadlines and grades you already have stay readable and editable. What changes is that Pro-only screens lock again and new additions are held to 5 scans a month, 4 courses and the one-semester rule — which, if you already have a semester on the account, means no new term until you resubscribe. Resubscribing turns everything back on against the same data, with no re-import needed."
      },
      {
        "question": "If I only have ten minutes today, what should I set up first?",
        "answer": "Scan one syllabus, even if you only get through one. That single action creates the course, its meeting times and its grading scale, and hands you a reviewable list of every deadline in the term, which is the input every other feature reads. Anything you set up before scanning has less to work with. If you already scanned everything, the next highest-value step is entering the grades you have."
      }
    ]
  },
  "pricing": {
    "sections": [
      {
        "heading": "What the free limits actually mean",
        "paragraphs": [
          "The free tier has three ceilings, not two: how many syllabi you can scan in a calendar month, how many courses you can carry in a semester, and how many semesters the account can hold — one. Beyond those three, nothing on free is metered. Tasks have never been limited: you can track two hundred deadlines on a free account and nothing will stop you. Nothing on free asks for a payment method either — Apple only enters the picture if you decide to buy Pro inside the app.",
          "The scan limit is five per calendar month, and it resets on the 1st. The reset is anchored to the start of the UTC month, and the same boundary is computed identically in the app, on the server that runs the extraction, and in the database rule that backs both up — so the number you see on the scan tab is the number the server will actually honor. A scan counts when an extraction runs, which means an extraction you start and then abandon still consumes one. The app is upfront about this: when you are about to use your fifth, it tells you before it runs, not after.",
          "The course limit is four per semester, and it is the fifth course that gets blocked — the fourth is created normally. A standard four-course load fits inside free exactly. You hit the wall when you take five, when you add a lab as its own course, or when a seminar and its recitation are tracked separately. The counter is scoped to the semester you are adding to rather than to the account, which sounds like it means the count starts over each term. On free, it does not work out that way, and that is worth spelling out.",
          "The third ceiling is the one people find late: a free account holds exactly one semester, total. Not one at a time with the last one filed away — there is no archive. The limit is checked in the app when you create a semester and again by a database trigger on insert, so a free account cannot create a second semester at all. The count only \"resets\" for spring because you deleted fall, and deleting a semester takes its courses with it, and their deadlines, tasks and grade history with them, permanently. If you want last term still readable in April, or you are running a summer term alongside spring, that is Pro's unlimited semesters, not a workaround."
        ],
        "bullets": [
          "Five scans per calendar month, reset on the 1st (UTC), not five for the lifetime of the account",
          "The scan tab shows how many you have left before you use one, and warns you on your last one",
          "Four courses per semester — the fifth is what gets blocked, so a normal four-course load fits",
          "One semester per free account, total; a second term requires Pro, and deleting the first erases its courses, deadlines and grades",
          "Deadlines, tasks, and grade entries are unlimited on free and always have been",
          "Grade tracking with weighted averages and your semester GPA are on free, not behind the paywall",
          "Free accounts sign in on iPhone, iPad, and the web app and read the same data, exactly like Pro",
          "Joining a Course Space a classmate invites you to is free; hosting one is Pro"
        ]
      },
      {
        "heading": "Exactly what Pro adds",
        "paragraphs": [
          "Pro removes all three ceilings — unlimited courses, unlimited semesters, and no monthly scan counter — and opens four groups of features. The first is import automation: Canvas, Blackboard, and Moodle assignment import using a personal access token you generate yourself in the platform's own settings, plus device calendar sync and .ics export so your deadlines land in Apple Calendar or Outlook alongside everything else in your life. The second is planning: Smart Plan builds a study schedule around your real deadlines and adjusts when they move, and the Workload dashboard shows crunch weeks and exam-dense stretches before you walk into them.",
          "The third group is studying: AI-generated flashcards drawn from the syllabus you already scanned and any notes you upload, on a spaced-repetition schedule; a Pomodoro-style focus timer; and an AI tutor scoped to one course that answers from that course's syllabus, your tracked deadlines, and your uploaded notes rather than from generic knowledge. The fourth is control: custom reminder timing, a grading scale you can edit to match what your school actually uses, and forecasting that tells you what you need on the work that is left, plus Academic Risk alerts and Progress Insights.",
          "One qualifier on scanning, because \"unlimited\" is doing narrower work than it sounds like. Pro removes the five-per-month counter entirely — that is the ceiling that actually shapes a semester. What remains is an anti-abuse ceiling of twenty scans in a rolling day, applied to every account including subscribers, enforced by the extraction function itself. Twenty syllabi in one day is not a workload, it is a script, so in practice you will not meet it; we would rather name the number than let \"unlimited\" quietly mean something else.",
          "The reminder difference is worth stating precisely, because it is the gate people notice first. Free accounts get same-day reminders. Pro adds one-day and three-day advance notice and quiet hours, so a 3 a.m. push gets held until the window ends. The two halves are enforced in different places, and the honest version is this: quiet hours has a server backstop as well as the in-app gate — the database coerces the setting back to off for any account that is not Pro, so a patched or lapsed client cannot keep it. The one-day and three-day reminders are local notifications the iPhone schedules on the device itself, so that gate lives in the app, which is where scheduling happens."
        ],
        "bullets": [
          "Unlimited courses and unlimited semesters, plus the monthly scan counter removed — the same scanner, minus the count",
          "A 20-scan-per-day fair-use ceiling applies to every account, Pro included",
          "Canvas, Blackboard, and Moodle import, gated server-side as well as in the app",
          "One-day and three-day advance reminders, plus quiet hours (quiet hours is backstopped in the database)",
          "Device calendar sync on iPhone and iPad, plus .ics export, which also works in the browser",
          "Hosting your own Course Space and inviting classmates; joining one stays free",
          "Smart Plan, Workload dashboard, Flashcards, Focus timer, and the course-scoped AI Tutor",
          "Grade Scale and Forecasting, Academic Risk alerts, Progress Insights, Share and Streaks"
        ]
      },
      {
        "heading": "Who actually needs Pro",
        "paragraphs": [
          "You probably need Pro if you are carrying five or more courses in one semester, because the fifth course is where free stops. That is common for engineering and nursing loads where labs are tracked separately, for double majors, and for anyone whose seminar and recitation are two separate things to keep track of.",
          "You probably need Pro if you intend to still be using Semora next term. Free holds one semester, so the start of spring is a real fork: delete fall — its courses, its deadlines, its grade history, none of it archived — or upgrade and keep both. Anyone making up credits over a summer term that overlaps a full spring needs it sooner than that, because that is two live semesters at the same time, which free cannot hold at all.",
          "You probably need Pro if your assignments live in Canvas. Importing from Canvas, Blackboard, or Moodle is a Pro feature — the sync function refuses the request without an active subscription, before it ever contacts your school, and the app sends you to the paywall rather than letting you connect and fail later. The free workaround is real, though: copy the assignment list out of Canvas and paste it into the scanner as raw text. It is a manual step, not a locked door.",
          "You probably need Pro if same-day reminders are too late for how you work. Someone who needs Thursday's paper to appear on Monday needs the three-day reminder. Someone who wants every deadline mirrored into the calendar app their job or their family already uses needs device calendar sync — which runs on iPhone and iPad, not in a browser tab. And if you are the person in the group chat who keeps everyone else's due dates straight, hosting a Course Space is the feature you are looking for; that one is Pro on the hosting side only."
        ]
      },
      {
        "heading": "The honest case for staying on free",
        "paragraphs": [
          "If you take four courses, scan each syllabus once at the start of the term, and check the app when you want to know what is due, you will never touch a limit for that whole semester. That is not a stripped-down demo of the product — it is the whole scanner, the full extraction, the review screen with per-item editing and low-confidence badges, deadline and task tracking with no cap, grade tracking with weighted averages, your semester GPA, and same-day reminders, on every device you sign in on.",
          "Free also handles the four-scan reality of a normal semester with a scan to spare, and the counter refills on the 1st, so a professor reissuing a syllabus in week seven is absorbed without anything breaking. The honest edge of that argument is the semester ceiling: free is a complete semester of the product, and it is one semester. We would rather you upgrade in week six of your second term because you hit a wall you can name than in week one because a paywall implied you had to.",
          "There is a version of this app where the scanner is the paywall and free is a taste. That is not this one. Scanning is the thing Semora does, and it is on the free tier on purpose — five a month, every month, with the review screen and the editing and the confidence flags intact. If the free tier is enough for your semester, use the free tier for your semester."
        ]
      },
      {
        "heading": "How buying Pro works",
        "paragraphs": [
          "Pro is purchased inside the iOS app through the App Store, on iPhone or iPad. There are two products — a monthly subscription at $3.99 and an annual one at $19.99 — and Apple handles the payment. Semora never sees your card details, because the transaction happens entirely inside Apple's payment sheet.",
          "What happens next is the part that matters for cross-device use. When the purchase completes, the app sends Apple's signed transaction to a Semora server function, which verifies it with Apple and writes an entitlement row keyed to your Semora account — your user ID, not your Apple ID. Every feature gate in the app and every server-side check reads that one row. That is the mechanical reason Pro is account-wide: there is only one place the answer lives, and signing into the web app with the same email reads the same row.",
          "One consequence worth knowing before you buy: the entitlement is bound to the Semora account that was signed in at purchase. If you later tap Restore while signed into a different Semora account, the app tells you the subscription is already linked to a different Semora account rather than reporting that no subscription exists. Sign into the account that bought it and Pro comes back. If you switch to a new iPhone, Restore Purchases re-validates the receipt with Apple and brings the entitlement with you."
        ]
      },
      {
        "heading": "Why the web app cannot take payment",
        "paragraphs": [
          "There is no StoreKit in a browser, and App Store rules require digital subscriptions for an iOS app to be sold through Apple's own purchase flow. Rather than half-build a checkout that would have to be disabled anyway, the web build ships a deliberate shim: the purchase functions are no-ops, and the web paywall says plainly that you subscribe in the Semora iPhone app.",
          "What the web can do is read and refresh. The paywall on web offers a control that re-reads your entitlement from the server, which is what you use if you just subscribed on your phone and want the browser tab to catch up immediately. Most of what Pro unlocks then works in the browser the same way it works on the phone — with two exceptions, and they are both worth naming.",
          "The first asymmetry is notifications. Delivery and quiet hours are handled by the iPhone app, because a browser tab is not a reliable place to fire a reminder about tomorrow's problem set. Your reminder preferences sync everywhere; the pushes themselves come from the phone. The second is device calendar sync: it runs on iOS and Android only, and the web build says so outright — toggle it in a browser and it tells you calendar sync is not available there. The browser can still generate and download the .ics file, so you can get your semester into Apple Calendar or Outlook by hand; the continuous write-into-your-device-calendar half happens on the phone. Home-screen widgets are iOS-only for the same reason."
        ]
      },
      {
        "heading": "Monthly versus annual, with the actual arithmetic",
        "paragraphs": [
          "Monthly is $3.99. Annual is $19.99, which works out to about $1.67 a month, roughly 58 percent less than paying month to month. Twelve months of monthly billing is $47.88, so the annual plan saves $27.89 over a full year.",
          "The break-even sits just past five months. $19.99 divided by $3.99 is about 5.01, so five monthly payments cost almost exactly what a year costs. That maps onto a semester more neatly than most subscription math does: a fall term running late August through mid-December is about five months, or $19.95 in monthly billing — within a nickel of the annual price, with spring thrown in. Given that a second semester is itself one of the things Pro unlocks, the annual plan is the one that matches how the ceilings actually bite.",
          "The case for monthly is narrower but real. If you want Pro for one specific stretch — a finals month, a semester where you overloaded on courses — paying $3.99 and cancelling is genuinely cheaper than committing to a year. Both plans renew automatically until you cancel, so pick monthly if you expect to stop and annual if you expect to still be enrolled next term. Prices quoted here are US App Store prices; Apple charges the local equivalent in other storefronts, and the app displays whatever your store reports."
        ]
      },
      {
        "heading": "Cancelling, and what happens to your data",
        "paragraphs": [
          "Cancellation runs through Apple, not through Semora. Open Settings on your iPhone, tap your name, then Subscriptions, and cancel there. The app has a shortcut: Settings, then Manage Subscription, which opens the same Apple page directly. Apple's rule applies — cancel at least 24 hours before the period ends or the next term bills. You keep Pro for the rest of the period you already paid for.",
          "When the subscription lapses, nothing is deleted. Your semesters, courses, tasks, grades, uploaded syllabi, and course notes are all still there, and the free tier keeps working around them. The limits are checked when something is created, not continuously, so if you built seven courses while on Pro, all seven stay — you simply cannot add an eighth to that semester. The same holds for semesters: every term you created on Pro remains readable afterwards, you just cannot create another one while you are back on free. Calendar sync pauses rather than tearing anything down: events already written into your device calendar stay put, and the app shows the sync as paused instead of a healthy toggle that quietly is not running.",
          "Reminders step down rather than stop. Same-day reminders keep firing. Quiet hours switches off, in the app and in the database, which coerces the setting back to off for any account that is not Pro. One-day and three-day advance reminders stop being scheduled by the app on your device, so the last few already sitting on the phone may still arrive before the schedule is rebuilt.",
          "One thing that catches people out, so it is stated on the delete screen in the app: deleting your Semora account does not cancel your Pro subscription. Account deletion removes your data from Semora, but the billing relationship is with Apple. Cancel in Apple's Subscriptions settings first, then delete the account, or Apple keeps charging for a subscription attached to data that no longer exists."
        ]
      }
    ],
    "faq": [
      {
        "question": "When do my five free scans reset?",
        "answer": "Your free scans reset on the 1st of each calendar month, measured in UTC, rather than on a rolling 30-day window from your first scan. Unused scans do not carry over. An extraction counts the moment it runs, so a scan you start and then abandon still uses one. The scan tab shows how many you have left before you commit, and warns you when you are about to use your last."
      },
      {
        "question": "How many semesters can a free account have?",
        "answer": "One, total. It is not one at a time with older terms archived — there is no archive. The app blocks the second semester and a database trigger blocks it again on insert, so a free account cannot hold two. Starting spring on free means deleting fall, which also deletes that term's courses and their deadlines, tasks and grades. Keeping last term readable, or running a summer term alongside spring, is what Pro's unlimited semesters is for."
      },
      {
        "question": "Is Pro scanning really unlimited?",
        "answer": "The monthly counter is removed entirely, which is the limit that actually shapes a semester. What stays is a fair-use ceiling of twenty scans in a rolling day, applied to every account including Pro and enforced by the extraction function, which returns a rate-limit error past that. Twenty syllabi in a day is a script rather than a course load, so it should never come up, but it is a real number and we would rather print it."
      },
      {
        "question": "Can I buy Pro on the web app?",
        "answer": "No. There is no web checkout, and that is deliberate rather than missing. Browsers have no StoreKit, and App Store rules require digital subscriptions for an iOS app to be sold through Apple. Buy Pro in the Semora app on iPhone or iPad. The web paywall points you there and offers a control that re-reads your entitlement, so the browser catches up right after you subscribe."
      },
      {
        "question": "If I buy Pro on my iPhone, does it work on my iPad and laptop?",
        "answer": "Yes, with two exceptions on the web. When a purchase completes, Apple's signed transaction is verified server-side and written to an entitlement row keyed to your Semora account rather than your Apple ID, and every Pro gate reads that row — so signing into the web app or a second device with the same email turns Pro on there too. The exceptions are reminder delivery and quiet hours, which the iPhone app handles, and device calendar sync, which is iOS and Android only; the browser can still download the .ics file. On a new iPhone, use Restore Purchases to re-validate and bring the entitlement across."
      },
      {
        "question": "Should I pick monthly or annual?",
        "answer": "Annual costs $19.99 against $47.88 for twelve monthly payments, so it saves $27.89, about 58 percent. The break-even is just past five months: $19.99 buys roughly five months of monthly billing. If you expect to still be enrolled next term — and a second semester is itself a Pro feature — annual is clearly cheaper. If you want Pro for one crunch stretch and then intend to stop, monthly at $3.99 and cancelling is the cheaper choice."
      },
      {
        "question": "What happens to courses and semesters above the free limits if my Pro subscription ends?",
        "answer": "They stay. Both limits are checked when something is created, not continuously, so courses and semesters you added while on Pro are not removed when the subscription lapses — you simply cannot create new ones beyond the free limits. Calendar sync pauses rather than deleting events already written to your device. Quiet hours switches off, in the app and in the database, and the app stops scheduling one-day and three-day reminders, while same-day reminders keep firing."
      },
      {
        "question": "Does deleting my Semora account cancel my Pro subscription?",
        "answer": "No, and this is the one thing that catches people out, so the app states it on the delete screen. Deleting your Semora account removes your data from Semora, but the billing relationship is with Apple, not with us. Cancel first in Settings, Apple Account, Subscriptions, then delete the account — otherwise Apple keeps charging for a subscription attached to data that no longer exists."
      }
    ]
  },
  "compare": {
    "sections": [
      {
        "heading": "Work out which category of tool you need before you compare features",
        "paragraphs": [
          "Student planning apps look interchangeable on a features grid and behave nothing alike once week six arrives. Most of them are really one of three things wearing similar marketing. The first is an intake tool: something whose main job is getting coursework out of a document or a school system and into a structured list. The second is an organizing tool: something that holds deadlines, grades, and a class schedule and answers the question of what is due and what it is worth. The third is a materials tool: something that takes a PDF, a lecture recording, or a slide deck and produces flashcards, quizzes, summaries, or tutoring on that specific content.",
          "A few products span two categories. Very few do all three well, and pricing rarely tells you which category you are actually buying. The useful move is to decide which one you need before you open a single comparison table, because a tool from the wrong category cannot be fixed with a higher tier.",
          "Decide by naming what breaks. Write down the last three assignments you missed, submitted late, or finished at 3 a.m., and name the cause of each. If the cause was not knowing something existed, you have an intake problem. If the cause was knowing and not sequencing, you have an organizing problem. If the cause was sitting down with the material and not absorbing it, you have a studying problem. Buying a flashcard generator to fix an intake problem is the most common and most expensive mistake in this category."
        ],
        "bullets": [
          "You have an intake problem if deadlines exist somewhere you do not look — a syllabus PDF, a course site, an announcement email.",
          "You have an organizing problem if you know what is due but keep discovering that three things are due the same week.",
          "You have a studying problem if the dates are handled and the material is not.",
          "You may genuinely have two, in which case pair one tool per problem rather than looking for one app that claims all three."
        ]
      },
      {
        "heading": "Dimension one: how coursework actually gets in",
        "paragraphs": [
          "There are only three intake paths, and they are not interchangeable. A tool can read a syllabus document, connect to your school's learning platform, or make you type everything yourself. Which one a product supports shapes everything downstream, because whatever never gets in never gets tracked.",
          "A learning-platform connection mirrors what an instructor publishes in the platform. That is genuinely useful for assignments added mid-semester, but a syllabus is the authoritative document for the things that decide your grade: the weight percentage attached to each category, the exam dates set in week one, the reading schedule, the office hours, the letter-grade scale, and the late-work policy. A large share of that never becomes an entry in a learning platform. A tool that only syncs an LMS inherits every gap in how your instructors use it. A tool that only reads syllabi will not see the assignment your professor invents in week nine. Ask which paths a product supports, and which of them are included on the tier you would actually pay for.",
          "Semora's scanner is on the free tier and takes four paths: a camera photo of up to five pages per scan, budgeted at 10 MB combined; a PDF upload; drag-and-drop on the web app; and pasted raw text on web, up to 60,000 characters at a time. From those it extracts the course name and code, the instructor, class meeting blocks with days, start and end times, kind and room, office hours, the semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading with a due date, due time, percentage weight, and a confidence score. Importing from Canvas, Blackboard, or Moodle is a Pro feature and uses a personal access token you generate yourself in the platform's own settings, so it does not depend on your school's IT department approving a third-party app. On the free tier, the workable substitute is pasting Canvas assignment text straight into the scanner."
        ],
        "bullets": [
          "Does it read a syllabus at all, or does it require an LMS connection or manual entry to get anything in?",
          "If it syncs an LMS, which one — a Canvas-only integration is useless if your school runs Blackboard or Moodle.",
          "Does the connection need your institution to enable something, or can you set it up yourself?",
          "Which intake paths are on the free tier, and which are behind the subscription?"
        ]
      },
      {
        "heading": "Dimension two: whether the tool shows its work",
        "paragraphs": [
          "Every AI extraction is probabilistic. Nobody parses a scanned, two-column, badly photocopied syllabus with perfect accuracy, and any product implying otherwise is describing a demo rather than your actual course load. What differentiates these apps is not whether they make mistakes but what they do with their own uncertainty.",
          "Silent import is the failure mode to look for. If a tool drops forty extracted items straight into your calendar with no review step, you inherit every misread date without knowing which ones to distrust, and you find out in week six when something was due in week five. Good handling looks like an editable review screen before anything is committed, a per-item signal for low-confidence extractions, a sanity check against the term dates so a date parsed as the wrong year is visible, and somewhere to park items that have no date at all instead of inventing one.",
          "Semora splits the write in two. The course itself, its meeting times, and its grading scale are saved before you review, because those are stable and you would only have to re-enter them. Deadlines wait for your approval. The review screen shows every extracted item with per-item editing, badges anything below 0.8 confidence with \"Low confidence — please verify\", badges dated items that fall outside the term with \"Date looks outside this term — double-check\", and collects undated items in a separate \"Needs a date\" section that is deselected by default, so nothing dateless slips into your calendar unnoticed."
        ],
        "bullets": [
          "Is there a review step at all, and can you edit each item in it before saving?",
          "Does it distinguish items it is confident about from ones it guessed?",
          "Does it check extracted dates against the semester window?",
          "What does it do with an item that has no date — drop it, guess, or hold it aside?"
        ]
      },
      {
        "heading": "Dimension three: is grade tracking real, or a GPA calculator",
        "paragraphs": [
          "Grade tracking is where feature lists are least honest, because three very different things share the name. Some apps have none and simply track deadlines. Some ship a standalone calculator: a separate screen you feed by hand, disconnected from the assignments you are already tracking, which means double entry and a number that goes stale the moment you stop maintaining it. Some wire the gradebook to the same items the deadline list is built from, so entering a score once updates everything.",
          "The questions that separate them are mechanical. Does it support weighted categories, or does it average everything equally as if a quiz and a final were the same thing? Can a category drop its lowest score, the way most syllabi actually work? Is there a rule for extra credit? Most importantly, does the running average divide by the weight you have attempted so far, rather than treating ungraded work as zeros — the difference between a tool that says you are at 91 percent and one that says you are failing in week three. Finally, can you edit the letter cutoffs, since a school using a 93-for-an-A scale and one using 90 will disagree about your grade.",
          "Semora includes grade tracking on the free tier, computed from the scores and weights you enter, reflecting only work graded so far. It supports weighted categories, dropping the lowest scores within a category, and an extra-credit policy. Pro adds Grade Scale and Forecasting: custom letter-grade cutoffs matching your school's scale, and what-if calculators for what you need on remaining work to hit a target. Progress Insights, also Pro, adds trend charts, CSV export, and a print view."
        ],
        "bullets": [
          "Weighted categories, or a flat average of everything?",
          "Does the average reflect only graded work, or does it count ungraded assignments as zeros?",
          "Can you change the letter-grade cutoffs to match your school?",
          "Is the gradebook fed by the same items as the deadline list, or a separate screen you maintain by hand?"
        ]
      },
      {
        "heading": "Dimension four: keep deadline data separate from study scheduling",
        "paragraphs": [
          "Deadlines and study plans are different kinds of data and should not be fused. A due date is a fact published by your instructor. A study schedule is derived: a guess about when you will do the work, generated from those facts plus your availability. When a product blends them into one object, correcting a fact means rebuilding your plan, and rebuilding your plan risks losing the corrections.",
          "The questions to ask are about rebuild behavior. Does the plan regenerate when deadlines change, or is it a one-time export you have to redo by hand? When it regenerates, does it destroy the sessions you already completed, or does the work you have done reduce what remains? Does it know your class times so it does not schedule an hour of study on top of a lecture? Does it respect a realistic daily ceiling rather than filling every waking hour? And what does it do with an item that has no due date, which cannot be scheduled backwards from anything?",
          "In Semora, deadline and grade tracking are free and Smart Plan is Pro, so the underlying facts stay usable whether or not you subscribe. Smart Plan builds a deterministic two-week schedule from your current deadlines, sized by task type and weight. Sessions you have already completed are preserved and their minutes are subtracted from what remains, so a rebuild carries unfinished work forward without duplicating finished work. Class meetings are blocked out, and device-calendar events can be too. You control the daily minute ceiling, session length, weekday and weekend start times, and whether weekends count at all. Tasks with no due date are skipped rather than guessed at — one more reason the review screen keeps undated items visible."
        ],
        "bullets": [
          "Does the study plan rebuild automatically when a deadline moves?",
          "Does a rebuild preserve completed sessions, or wipe your progress?",
          "Does it schedule around class times and a realistic daily capacity?",
          "Can you keep your deadline data if you stop paying for the planning layer?"
        ]
      },
      {
        "heading": "Dimension five: what happens when a due date moves",
        "paragraphs": [
          "This is the single best test of a course tool, because dates move constantly and every weakness shows up at once. A professor pushes a paper by a week. Four things should follow, and two things should not.",
          "The four that should follow: the item updates in place rather than appearing twice; scheduled reminders re-fire against the new date instead of the old one; any calendar event the app created gets edited rather than duplicated; and any derived study plan rebuilds around the change. The two that should not: work you already marked complete must never come back as incomplete because a sync overwrote your local state, and items must not vanish because a platform stopped listing them — an assignment hidden by an instructor is not an assignment that no longer exists.",
          "Semora's LMS import matches each incoming assignment on its provider-side identifier, so a re-sync updates the existing item's date, time, title, and points instead of creating a duplicate. Completion is merged rather than overwritten, so a task you checked off stays checked off. Items no longer returned by the provider are flagged as removed rather than deleted, and the server explicitly tells the client not to infer deletions from a truncated response. After a sync, reminders for every affected task are rescheduled. A task already synced to your device calendar has its existing event updated rather than a second one created."
        ],
        "bullets": [
          "Move a real due date in the first week and watch what the app does with it.",
          "Check whether a completed item stays completed after a sync.",
          "Check whether the reminder now fires against the new date.",
          "Check for duplicates in your device calendar, which is where they usually surface."
        ]
      },
      {
        "heading": "Dimension six: where it runs, and where you pay",
        "paragraphs": [
          "Per-device availability is not a footnote. If you read a syllabus on a laptop, capture homework on a phone, and study on a tablet, an app that only exists in one of those places quietly becomes an app you stop opening. Check three things separately: which platforms have a real client, whether one account covers all of them, and whether editing in one place shows up in the others without a manual refresh.",
          "Then check where the money happens, because it is not the same question. Subscriptions bought through an app store are managed in that store, and cancellation lives in your device settings rather than in the app. Some products sell on the web instead, some sell in both places at different prices, and some sell in one and honor it everywhere. Ask specifically whether a purchase made on your phone applies when you sign in from a browser.",
          "Notification behavior also differs by platform in ways marketing pages flatten. Scheduled reminders on a phone are local notifications the operating system fires whether or not the app is open. A browser tab cannot make the same promise. If reminders are the reason you are installing something, confirm they work on the device you will actually be near.",
          "Semora is one universal iOS app covering iPhone and iPad, plus a web app, on one account, syncing in near real time. There is no Android app and no Mac app. Pro is purchased in the iOS app through StoreKit and applies account-wide, including on the web, where the app reads and refreshes the entitlement rather than running its own checkout. Scheduled reminders are native-app notifications. Task edits made without a connection are queued locally, retried with backoff, and checked against the server version so a conflicting edit surfaces rather than silently overwriting."
        ]
      },
      {
        "heading": "Dimension seven: read the cap, not the word \"free\"",
        "paragraphs": [
          "Free means at least four different things in this category, and the differences matter more than the price. There is ad-supported free, which is complete but interrupted. There is trial free, which ends on a date and takes the product with it. There is feature-capped free, where the core works and specific capabilities are withheld. And there is volume-capped free, where everything works up to a quota.",
          "For a trial specifically, check whether it requires a card, what it renews at, and whether the introductory rate applies to you — introductory pricing is frequently limited to first-time subscribers, so returning after a cancellation can mean paying full price immediately. For a capped free tier, the questions are what the cap counts, when it resets, and whether the capped thing is something you do constantly or a handful of times per semester. A limit on syllabus scans is a very different experience from a limit on how many assignments you can track, because you scan a few times in the first week and track deadlines every day for four months.",
          "Ask one more question that almost nobody asks before subscribing: what happens if you stop paying in the middle of a semester. Does the data become read-only, disappear, or stay editable with only the paid automation switched off? And can you get your coursework out — a calendar export, a CSV, a print view — if you decide to move.",
          "Semora's free tier is not a trial and does not expire: five syllabus scans per calendar month, up to four courses per semester, full deadline and task tracking, grade tracking with weighted averages, same-day reminders, and joining a Course Space a classmate invites you to. The scan quota resets at the start of each calendar month. The course cap applies when you create a new course in a semester, and re-scanning a course you already have does not consume another slot. Pro is $3.99 per month or $19.99 per year, which works out to about $1.67 per month annually — roughly 58 percent cheaper than paying monthly. Calendar sync with .ics export, CSV export, and the print view are Pro; if Pro lapses, device calendar sync pauses rather than deleting what it created."
        ]
      },
      {
        "heading": "A pre-semester checklist",
        "paragraphs": [
          "Everything above collapses into a short test you can run in one evening, before you have committed four months of coursework to something. Do it in the first week, when switching still costs nothing.",
          "Start with your worst syllabus, not your cleanest one. Scan the one that is a photocopy of a photocopy, or the one with the reading schedule buried in a table. Any tool handles a well-formatted PDF from a large department. What you are testing is what happens with the one that is not, and whether the app tells you when it is unsure.",
          "Then run the moves that will happen anyway. Change a due date and see whether the app updates in place or duplicates. Mark something complete, sync, and confirm it stays complete. Enter two scores in two weighted categories and check the running average against your own arithmetic. Sign in from a second device and confirm the change you just made is there. Finally, find the export and the account-deletion path before you need them — a product that makes leaving easy is usually the one that is not counting on making it hard."
        ],
        "bullets": [
          "Scan your messiest syllabus first, not your cleanest.",
          "Verify every date it extracted against the source document once, in week one.",
          "Move a date, complete a task, and re-sync — then look for duplicates and reverted checkboxes.",
          "Check your grade math by hand once, early, while the sample is small enough to verify.",
          "Confirm the free tier covers what you do daily, not just what you do in week one.",
          "Locate the export and the delete-account option before you commit a semester."
        ]
      },
      {
        "heading": "Where Semora sits, and how to read the comparisons",
        "paragraphs": [
          "Semora is an intake and organizing tool with a studying layer on top, in that order. The scanner and the deadline and grade tracking it feeds are the core, and they are free. The planning and study features — Smart Plan, the Workload dashboard, Flashcards, the Focus timer, the AI Tutor, Grade Scale and Forecasting, calendar sync, custom reminder timing with quiet hours, Academic Risk alerts, Progress Insights, hosting a Course Space, and Canvas, Blackboard, or Moodle import — are Pro. That split is deliberate: the facts about your semester should not be behind a paywall, and you should be able to test whether the extraction is any good on your own syllabi before deciding anything.",
          "It is not the right tool for everyone. If you need a Mac or Android client, if your main problem is turning lecture recordings into study material rather than turning syllabi into deadlines, or if you want time-blocked scheduling as the central product rather than a layer over a deadline list, other tools in this category are built closer to that shape.",
          "The comparison pages here go product by product, using each company's own published material and flagging anything not directly confirmed on their own site rather than asserting it. No ratings or user counts anywhere on this site were made up, and where a company self-reports a figure it is labeled as that company's own claim rather than a verified number. That includes us: Semora launched recently and has no public rating history to cite, and we are not going to manufacture one. Pricing especially is worth checking directly at the source before subscribing to anything, ours included."
        ]
      }
    ],
    "faq": [
      {
        "question": "Do I need a syllabus scanner if my school already uses Canvas?",
        "answer": "It depends on what your instructors publish there. An LMS connection mirrors assignments an instructor actually posts in the platform; a syllabus is where weight percentages, exam dates, reading schedules, office hours, and the grading scale usually live, and much of that never becomes an LMS entry. If every one of your courses is fully managed in the platform, sync may be enough. If any of them is not, a scanner covers the gap."
      },
      {
        "question": "What is the single best test to run before committing a semester to an app?",
        "answer": "Move a due date. Change one in the app, or re-sync after an instructor changes it, then check four things: the item updated in place instead of duplicating, the reminder now fires against the new date, any calendar event the app created was edited rather than copied, and anything you had already marked complete stayed complete. Most of the weaknesses in these tools surface in that one sequence."
      },
      {
        "question": "How do I tell real grade tracking from a GPA calculator?",
        "answer": "Check whether it is fed by the assignments you already track or by a separate screen you maintain by hand. Then check the math: weighted categories rather than a flat average, the ability to drop a lowest score, a running average that divides by the weight attempted so far instead of counting ungraded work as zeros, and editable letter cutoffs so the result matches your school's scale."
      },
      {
        "question": "Is a capped free tier better than a free trial?",
        "answer": "They answer different questions. A trial shows you the whole product briefly and then bills you, and introductory rates are frequently limited to first-time subscribers, so check the renewal price and whether you qualify. A capped free tier shows you less, for as long as you want it. What matters is whether the cap sits on something you do once a semester, like scanning a syllabus, or something you do daily, like tracking deadlines."
      },
      {
        "question": "Should I use one app or two?",
        "answer": "Two is often correct and rarely expensive. Holding a semester together and generating study material from a specific reading are different jobs, and tools built for one tend to be weak at the other. A common pairing is one tool for deadlines, weights, grades, and class times, and a second that turns a lecture or a chapter into flashcards and quizzes. Decide which problem costs you more, and solve that one first."
      },
      {
        "question": "What happens to my coursework if I stop paying or switch apps?",
        "answer": "Ask before you subscribe, not after. Find out whether an expired subscription makes your data read-only, hides it, or simply switches off the paid automation while deadlines and grades stay editable. Then find the exports: a calendar file, a CSV, and a print view are the three that matter, plus a working delete-account path. In Semora, device calendar sync pauses if Pro lapses rather than deleting the events it created."
      }
    ]
  },
  "blog": {
    "sections": [
      {
        "heading": "What this blog is for",
        "paragraphs": [
          "This blog is written for one specific person: an undergraduate carrying four to six courses, each with its own syllabus, its own grading scheme, and its own idea of when things are due. Not a productivity hobbyist collecting systems. Someone who wants the semester to stop producing surprises — the paper assigned in week two and due in week eleven, the midterm that turns out to be worth thirty percent, the Wednesday in December with two finals on it.",
          "Every post here takes one concrete mechanic and explains it end to end, in the order you would actually do it. The methods work with a spreadsheet, a paper planner, or the calendar app already on your phone. Semora shows up at the end of each guide as the automated version of work you could do by hand, with the tier stated plainly so you know which parts cost nothing. If a guide is only useful once you subscribe, it was written wrong.",
          "There are six posts, published between July 20 and July 25, 2026. They fall into six problems, described below. Each description explains the underlying problem well enough to be useful on its own, so this page is worth reading even if you never open a single post."
        ],
        "bullets": [
          "Turning a syllabus into a semester calendar — the conversion every course demands and no course teaches",
          "Calculating a weighted grade correctly, including drop-the-lowest rules and rounding policy",
          "Getting a deadline reminder out of Canvas early enough to act on it",
          "Planning finals week around exam density and weight rather than chronological order",
          "Running timed study sessions in the fifty- and ninety-minute gaps a class schedule actually leaves",
          "Choosing which kind of system — paper, generic to-do app, or syllabus-aware tool — holds up past week ten"
        ]
      },
      {
        "heading": "Turning a syllabus into a semester calendar",
        "paragraphs": [
          "A syllabus is written as a contract, not as a schedule. It has to state a late-work policy, an academic-integrity clause, and a grading breakdown, and those obligations shape the document far more than your need to know what is due next Tuesday. The result is that the dates you need are scattered through prose, tables, and footnotes, in a format that is complete but not usable. Nobody teaches the conversion step, and every course silently assumes you have already done it.",
          "The conversion is also more work than it looks. A single line like \"reading response due every Friday by 11:59pm\" is one sentence in the syllabus and twelve to fifteen separate deadlines on a calendar. Dates written relative to class sessions — \"due at the start of class 14\" — mean nothing until you have mapped the meeting pattern and subtracted holidays. Exam dates are often listed as TBD because the finals schedule gets published separately, partway through the term. And large lecture courses frequently hand out a second document for lab or recitation, with its own deadlines that appear nowhere in the main syllabus.",
          "The guide walks the whole thing: read the syllabus once before entering anything, capture the recurring structure first (meeting days and times, office hours, term start and end, category weights), then resolve every graded item to an actual calendar date, then put it in a calendar rather than a list — because a list cannot show you three exams converging on the same week. The last step is the one people skip: do it for every course, then look across all of them together. One syllabus rarely looks alarming. Four stacked into the same seven days sometimes does.",
          "Semora's scanner does that pass in one go, and it is on the free tier — five scans per calendar month, and a free account holds up to four courses inside one semester. That semester cap is a hard one and worth knowing before you start: a free account covers a single term, so a second semester is the point where Pro becomes necessary rather than optional. You can import by camera photo (up to five pages per scan, around ten megabytes combined), PDF upload, drag-and-drop on the web, or by pasting raw text. It extracts the course name and code, instructor, class meeting blocks, office hours, semester start and end, the letter-grade scale, and every assignment, quiz, exam, project, and reading with its due date, due time, and percentage weight. A review screen shows all of it with per-item edit before deadlines are committed: items the model was less sure about are badged \"Low confidence — please verify,\" dated items that fall outside the term get flagged to double-check, and anything undated sits deselected in a \"Needs a date\" section so it cannot quietly enter your calendar as a wrong guess."
        ],
        "bullets": [
          "Recurring lines expand: one weekly deadline is a dozen or more calendar entries",
          "Relative dates (\"the Friday before spring break\") have to be resolved to real dates as you go",
          "TBD exam dates should be flagged as pending, not skipped — a silently missing item is worse",
          "Lab and recitation sections often carry a separate schedule the main syllabus never mentions",
          "Record the weights alongside the dates; without them, grade tracking later is impossible"
        ]
      },
      {
        "heading": "Knowing what your grade actually is",
        "paragraphs": [
          "Most students carry a number in their head that is really a plain average of whatever came back most recently. Weighted grading exists precisely because that number is wrong: a five-percent quiz and a thirty-percent final should not move your grade by the same amount. The formula is not hard — multiply each category's average by its weight, sum those, and divide by the weights that have graded work in them — but two details in it cause most of the confusion.",
          "The first is the denominator. A category only counts once it actually has a score in it, which is why an ungraded final worth thirty percent does not drag your current average toward zero; it simply is not part of the calculation yet. The second is where special rules get applied. A \"lowest quiz dropped\" policy has to be applied inside the category, before that category's average is computed. The guide works an example where doing it at the wrong point produces an 87.3 percent instead of an 88.3 percent — the same scores, a full point apart, purely from ordering.",
          "Rounding is the other thing worth understanding, mostly because it is a policy choice rather than arithmetic. The common U.S. convention that 89.5 rounds up to 90 is a convention, not a rule; some professors take the percentage exactly as calculated, some round after every assignment rather than once at the end, and plenty of syllabi set the A- cutoff somewhere other than 90. None of that is answerable from the math, which is why it is worth reading your specific grading policy or emailing to ask.",
          "The guide also separates three numbers that all get called GPA: a single course's weighted percentage, a semester GPA built from those course grades and credit hours, and a cumulative GPA across every term. Semora calculates the first two, and both are free. Per-course percentages update as you enter scores, and the Courses tab carries a current semester GPA estimate above the course list — each tracked course grade converted to grade points and weighted by that course's credit hours, with a line underneath telling you how many of your courses have enough graded work to count so far. What it does not calculate is cumulative GPA, and the post says so directly: that one needs final letter grades and credit hours from every term you have already finished, which lives with your registrar rather than in any syllabus. Pro adds an editable grade-point scale, so the letter-to-points conversion matches your school rather than the standard 4.0 table, plus Grade Scale and Forecasting for what-if calculations on the work still ahead of you, and Progress Insights for trend charts, CSV export, and a print view."
        ]
      },
      {
        "heading": "Getting a deadline reminder early enough to act on it",
        "paragraphs": [
          "Canvas is where instructors post assignments, and it is a perfectly good system of record. It is not built to make sure you notice a deadline in advance. Notification preferences are opt-in per category and configured at the account level, which means a student can be entirely convinced notifications are on while the one category that matters — due dates — sits on \"never\" or inside a daily digest they do not open. That is worth five minutes to audit before concluding that notifications are broken.",
          "Even a perfectly configured setup has a ceiling, though, and it is structural rather than a bug. Canvas notifications are built around events: an assignment was posted, a due date changed, a grade was entered. There is no built-in way to say \"remind me three days before this is due.\" Each course's feed can also only see its own course, so nothing tells you that Friday's paper, a midterm in another class, and a lab report are all landing in the same week. And because grades and deadlines live separately, a paper worth thirty percent in a class where you are sitting at a B-minus looks identical in the feed to a two-percent problem set.",
          "The instinct — turn every category to \"immediately\" — usually backfires. Once a phone buzzes for every quiz score and every syllabus edit across six courses, the volume trains you to treat alerts as background noise, and the one genuinely time-sensitive message gets the same half-second dismissal as everything else. What determines whether a reminder is useful is not how many arrive but when the important ones do. Three days out you can still start the reading, email a clarifying question, or move something off the weekend. The morning something is due, a reminder can only confirm what you already suspected.",
          "Semora's same-day reminders are on by default on every tier, including free, which covers the baseline case. Pro adds custom reminder timing — a one-day or three-day advance notice, set once and applied automatically — plus quiet hours, so an alert does not fire at 2 a.m. when there is nothing you can do with it. Connecting Canvas, Blackboard, or Moodle is a Pro feature, done with a personal access token you generate yourself rather than an OAuth integration that waits on your school's IT department. On the free tier the workable substitute is real: copy your Canvas assignment text and paste it into the scanner. The post ends on an honest note worth repeating here — reminders plus a weekly look at the calendar, not reminders instead of one."
        ],
        "bullets": [
          "Audit Account, then Notifications, in Canvas: each category has its own delivery setting",
          "Due Date and Assignment Changes are the two categories most worth setting to arrive immediately",
          "A notification sitting unread in a weekly digest is functionally the same as no notification",
          "More alerts past a certain point compete with each other rather than adding safety",
          "A reminder cannot tell you that you are drifting in a course overall — a periodic look at the calendar can"
        ]
      },
      {
        "heading": "Planning a week when everything lands at once",
        "paragraphs": [
          "Finals week rewards planning more than any other stretch of the term, for a specific reason: the thing that makes it hard is visible months in advance. Several high-stakes exams land in a short window, and the collisions inside that window are knowable long before they arrive. The failure mode is not laziness; it is treating chronological order as urgency order and discovering the double-exam day the weekend before it happens.",
          "The framework in the guide is an inventory, then a judgment. List every final with its date, time, and weight toward the course grade. Then combine that weight with where your grade actually stands in that course. A final worth twenty percent of a class you are holding at 92 needs less defensive review than a final worth the same twenty percent of a class sitting at a borderline 78, even if the first one comes first on the calendar. Then map the exams for density rather than dates: an exam that looks like it gets a full week of review might realistically get two days if it is boxed in by two others.",
          "The guide also covers what to do inside the review blocks, since scheduling hours is only half the problem. Rereading a chapter mostly tests whether the material looks familiar while it is sitting in front of you, which is a different skill from reconstructing it under exam conditions. Active recall — closing the book and working problems cold, writing an answer from memory, explaining a concept aloud — and spreading review across several days rather than one long night generally hold up better. There is a logistics section too: many schools publish a master final exam schedule that overrides the syllabus, and rooms and allowed materials change more often than students expect.",
          "Grade tracking is what makes step two possible, and it is free — you need to know which course is a comfortable 92 and which is a borderline 78 before you can allocate hours honestly, and the semester GPA estimate on the Courses tab is free too, which tells you what the term as a whole is currently worth. Pro's Workload dashboard is what makes step three easier, surfacing crunch weeks and exam-dense stretches across every course at once rather than leaving you to cross-reference. Smart Plan then builds a study schedule from those deadlines and adapts it when dates shift, and Academic Risk alerts flag a slipping grade or missing work with recovery steps well before finals week arrives."
        ],
        "bullets": [
          "Weight alone is not the plan — weight combined with your current standing is",
          "Look for clusters: two exams in a day, or three inside 48 hours, changes everything before them",
          "Block review as specific appointments, not \"study for chemistry\" as an intention",
          "Several shorter sessions per exam beat one marathon night for the same total hours",
          "Keep sleep and one normal non-academic thing as fixed blocks, not leftovers"
        ]
      },
      {
        "heading": "Studying in the gaps you actually have",
        "paragraphs": [
          "The Pomodoro technique — twenty-five minutes of focused work, a five-minute break, a longer break after four cycles — was developed by Francesco Cirillo in the late 1980s, when he was a university student using a tomato-shaped kitchen timer to get through his own coursework. It is durable because it is simple. The problem is that almost every explanation of it assumes a quiet afternoon with nothing else on the calendar, which is not what a class schedule looks like.",
          "A real college day is made of fragments: fifty minutes between a 10 a.m. and an 11 a.m. class, ninety minutes over lunch, an open evening. Each of those fits a different amount of work, and the useful move is planning for the gap you have rather than the one you wish you had. Fifty minutes is two focus blocks with one break and nothing left over — budget the walk to your next class separately. Ninety minutes is two full cycles with about thirty minutes of buffer. Three hours is the traditional four-cycle set with a real break at the end. Stacked across one ordinary Tuesday, that is roughly six cycles pulled from gaps already sitting in the schedule.",
          "Task sizing is where this usually breaks down. \"Work on the essay\" is not a twenty-five-minute task; it is a multi-session project in disguise, and forcing it into one block produces vague progress and no sense of what got done. A block needs a concrete finish line — draft the second paragraph, work problems one through five, review one course's flashcards. The other two common mistakes are letting a five-minute break become fifteen because a feed was hard to close, and skipping the long break because a deadline feels urgent, which trades a short reset for a longer slump.",
          "Semora's Focus timer is a Pro feature, as are Flashcards and the AI Tutor that sit alongside it. What the timer adds over any free timer is context: the session attaches to a specific course or assignment that the app is already tracking, so study time is recorded against real coursework rather than running in a disconnected app. It sits next to Smart Plan and the Workload dashboard, which is the part that actually answers which course's session to prioritize on a given day."
        ],
        "bullets": [
          "50-minute gap: 25 on, 5 off, 25 on — with nothing left for packing up",
          "90-minute gap: two full cycles plus roughly 30 minutes of buffer",
          "3-hour block: four cycles, then a genuine 15-to-30-minute break",
          "Match the task to the block — short, self-contained work in short windows",
          "Stand up and walk during breaks; screens are hard to put down on schedule"
        ]
      },
      {
        "heading": "Choosing the system that holds all of it",
        "paragraphs": [
          "Every deadline-tracking method eventually faces the same test: what happens when four courses' assignments, exams, and readings need to live in one place at once. Plenty of approaches work fine for one class in week two and fall apart by week ten. The comparison post applies that test rather than ranking apps by marketing copy.",
          "Paper planners and generic to-do apps are the honest baseline, and neither is wrong. Both remove nothing from the labor, though. Every date still has to be transcribed by hand from every syllabus, and when a professor moves a deadline you have to notice and re-copy it yourself. Neither has any concept of grading weight, so \"Essay 2\" and \"Problem Set 6\" look identical even when one is worth ten times as much, and neither can flag that three courses just landed exams in the same week.",
          "The post evaluates seven apps students commonly reach for — some syllabus-aware, some LMS-connected, some neither, which is itself part of the finding — against four questions: does it read a syllabus at all, or does it require an LMS connection or manual entry; is grade tracking included or is it only a deadline list; is there a genuine ongoing free tier rather than a free period that expires into billing; and does it sync between a phone and a browser without extra setup. Several of the tools in that lineup turn out to be study-material generators rather than deadline trackers, which is a real answer to question one rather than a knock. It closes with a which-one-fits-you section, including cases where something other than Semora is the better answer.",
          "One caveat is stated in the post and worth restating: those comparisons rest on each product's own publicly stated features, pricing pages, and App Store listings, plus third-party review coverage in the cases where a company does not publish its pricing itself — not on hands-on testing across a full semester. Anything not confirmed on a company's own site is labeled as reported rather than stated as fact, and pricing in particular changes often enough that it is worth checking directly before subscribing to anything."
        ]
      },
      {
        "heading": "How these guides are written",
        "paragraphs": [
          "No invented numbers appear anywhere on this blog. Semora launched recently and has no meaningful rating history, so you will not find download counts, user totals, star ratings, testimonials, or named universities here — not framed vaguely, not framed as estimates. Where a post leans on a general principle about learning, such as spaced review outperforming a single cram session, it says so as a general finding rather than dressing it up as a study nobody can check.",
          "Product mentions are labeled by tier at the point they appear, because a guide that quietly leads you toward a paywall is not a guide. Free means free: five syllabus scans per calendar month, up to four courses, full deadline and task tracking, grade tracking with weighted averages, a credit-hour-weighted semester GPA estimate, same-day reminders, and joining a Course Space a classmate invites you to. The one hard edge is semesters — a free account covers a single semester, so a second term is where Pro stops being optional. Pro is $3.99 a month or $19.99 a year, which works out to about $1.67 a month on the annual plan, bought inside the iOS app and applied to your whole account including the web app; there is no separate web checkout. Hosting your own Course Space is Pro; joining one someone shares with you is free and stays free.",
          "It is also worth being clear about what this blog does not cover. It does not calculate cumulative GPA, because Semora does not either — per-course weighted grades and a semester GPA estimate, yes; a whole-transcript number, no. It does not write about features that have not shipped, which is why you will find nothing here about Google Classroom or Google Calendar sync. And Semora is a universal iOS app for iPhone and iPad plus a web app on one account, synced in near real time — there is no Android app, so Android users work in the browser, where device calendar sync does not run and the .ics export is the way to get deadlines into an outside calendar."
        ]
      }
    ],
    "faq": [
      {
        "question": "Do I need Semora to follow these guides?",
        "answer": "No. Every post is written so the method works with a spreadsheet, a paper planner, or the calendar app already on your phone — the steps come first and the product comes last. Semora appears at the end of each guide as the automated version of work you could do by hand, with the tier stated so you know what costs nothing. A guide that only works once you subscribe is a sales page, not a guide."
      },
      {
        "question": "Which post should I read first?",
        "answer": "It depends where you are in the term. In week one, start with turning a syllabus into a semester calendar, since everything else assumes those dates already exist somewhere. Once the first graded work comes back, the weighted-grade guide is the one that matters. Read the Canvas reminders post the moment a deadline surprises you. Save the finals-week guide for roughly a month out, while there is still time to shift review earlier."
      },
      {
        "question": "Is Canvas import included on the free tier?",
        "answer": "No. Connecting Canvas, Blackboard, or Moodle is part of Pro at $3.99 a month or $19.99 a year, and the server enforces it rather than the app merely hiding a button. The free-tier route is real, though, and the Canvas post covers it: copy your assignment list as text and paste it straight into the syllabus scanner, which accepts pasted text on the web from twenty up to sixty thousand characters."
      },
      {
        "question": "Does Semora calculate my cumulative GPA?",
        "answer": "No, and the weighted-GPA post says so directly rather than burying it. What Semora does calculate — both on the free tier — is the per-course weighted percentage, your current grade in one class built from the scores and weights you enter and counting only the categories that have graded work in them so far, and a current semester GPA estimate on the Courses tab, which converts each of those course grades to grade points and weights it by that course's credit hours. Cumulative GPA is the one out of reach: it needs final letter grades and credit hours from every term on your transcript, which lives with your registrar rather than in any syllabus. Pro adds an editable grade-point scale if your school's letter-to-points conversion is not the standard one."
      },
      {
        "question": "What can I actually do without paying?",
        "answer": "Five syllabus scans per calendar month, up to four courses, full deadline and task tracking, grade tracking with weighted averages, a semester GPA estimate, same-day reminders, and joining a Course Space a classmate invites you to. No credit card, and no time limit on the tier itself — the limit is scope rather than clock, with one exception worth knowing up front: a free account covers one semester, so starting a second term means Pro. Pro removes the monthly scan cap (a fair-use ceiling of twenty scans a day still applies), and adds unlimited courses and semesters, LMS import, hosting your own Course Space, Smart Plan, the Workload dashboard, Flashcards, the Focus timer, the AI Tutor, and calendar sync with .ics export."
      },
      {
        "question": "Do these posts cite research or user statistics?",
        "answer": "No user statistics, because none exist to report and inventing them would be worse than saying nothing — you will find no download counts, ratings, or testimonials here. Where a post relies on a general principle about learning, like spaced review outperforming one long cram session, it is presented as a general finding. Competitor details come from each company's own site, pricing page, or App Store listing, plus third-party review coverage where a company does not publish its pricing itself, with anything not confirmed by the company labeled as reported."
      }
    ]
  },
  "support": {
    "sections": [
      {
        "heading": "When a scan misreads a date",
        "paragraphs": [
          "The review screen is where you fix a bad extraction, and it is the last step before anything reaches your deadline list. When a scan finishes, Semora writes the course itself, its class meeting blocks and its letter-grade scale right away, then holds every extracted assignment, quiz, exam, project and reading for your approval. Nothing in that list is saved until you tap save.",
          "Semora tells you where it is least sure. Any item that came back with a confidence score under 0.8 carries a \"Low confidence — please verify\" badge. Any item whose date falls well outside the term carries \"Date looks outside this term — double-check.\" The window is deliberately generous: the semester's own start and end dates plus or minus 45 days when the scan managed to read them, and a wide band around today — roughly four months back to ten months ahead — when it did not. So a date a week past the last class is not flagged, but a year typo or a date the professor copied from last semester's syllabus is. Tap the pencil on the row and correct it. Editing the date clears the out-of-term warning, because you have now looked at it.",
          "Items with no date at all — \"Final Exam, date TBA\" — collect in a \"Needs a date\" section at the bottom of the review screen and start deselected. Semora will not let you select one until you give it a real date, because a deadline without a date cannot be saved at all. Give a date to the ones you can, leave the rest deselected, and add them from the course screen later when the professor announces them.",
          "If a date is wrong after you have already saved, nothing special is required: open the task, tap Edit, and change the due date or time. Reminders for that task are cancelled and rescheduled from the new date automatically."
        ]
      },
      {
        "heading": "When a scan returns nothing",
        "paragraphs": [
          "A scan that produces no course is not one failure, it is several, and Semora gives each one a different message so you know what to do next.",
          "\"This doesn't look like a course syllabus.\" This is a deliberate gate. It fires when the model reports the document is not a syllabus, or when the extraction comes back with no course name, no items and no meeting times — nothing usable. Semora returns before writing anything, so no phantom course or semester is created and the scan is not charged against your monthly count. Scan the syllabus, course outline, or class schedule instead of a reading list or a receipt.",
          "\"This syllabus is very dense and the response was cut off.\" The extraction ran long and got truncated. Scan one course at a time, or split a long packet into fewer pages per scan.",
          "\"The AI is busy right now — please try again in a minute\" and \"AI service unreachable.\" These appear only after Semora has already retried with backoff and failed over to a secondary model, so waiting a minute genuinely helps. \"We're seeing unusually high demand right now\" is a different thing — an app-wide spend limit, not your account. None of these count against your 5 free monthly scans. They do still count toward the rolling 24-hour cap of 20 scans described below, so a long run of failed attempts on one document can trip that separate limit even though your monthly count has not moved."
        ],
        "bullets": [
          "Photograph the whole page flat, in even light. Glare and a cut-off margin are the two most common reasons a schedule table gets read wrong.",
          "A photo scan takes up to 5 pages, about 10 MB combined. Above that Semora tells you how many pages do fit before you waste the scan.",
          "A single PDF can be about 11 MB. For a long syllabus, a PDF reads more reliably than photos of the same pages.",
          "On the web app you can paste raw text instead — up to 60,000 characters. That is the free-tier route for Canvas assignment lists, since connecting Canvas, Blackboard or Moodle is a Pro feature.",
          "If the schedule lives in a separate handout, scanning it into a course you already have will pull that handout's deadlines onto the review screen — but it will not add or overwrite class meeting times or office hours. Those are written only when a scan creates the course, so a re-scan can never clobber a schedule you have hand-edited. Add or fix meeting times yourself from the course screen."
        ]
      },
      {
        "heading": "What the scan limit counts, and when it resets",
        "paragraphs": [
          "Free accounts get 5 syllabus scans per calendar month. The window is anchored to the start of the month in UTC, so the count returns to zero on the 1st. It is not a lifetime allowance and it does not roll over.",
          "What counts is a successful extraction — a scan where Semora actually read a syllabus and returned it to you. Rejected documents, truncated responses, model outages and network failures are logged as failures and do not count. The one case that does count and can feel unfair: if the extraction succeeded and you backed out of the review screen without saving, the work was done and delivered, so it counts. Finish the review, even if you only keep two items.",
          "The Scan tab shows how many scans remain — \"3 of 5 free scans left this month\" — so you are never guessing, and it warns you before you spend the last one. Semora enforces the same limit in the app, on the server, and in the database, which is why the number you see and the number the server accepts always agree.",
          "One other ceiling applies to everyone, Pro included: a rolling 24-hour cap of 20 scans per account, which exists to stop runaway automated use. If you hit it you will see \"You've reached the daily scan limit of 20.\" This is also why Pro scanning is best described as having no monthly cap rather than as literally unlimited — there is a fair-use daily ceiling behind it.",
          "Two further limits apply only on free, and Pro is exempt from both. The first is 4 courses per semester. The second is one semester per account: a free account cannot start a second semester at all, so a new term is not a way to reset the 4-course allowance — unlimited courses and unlimited semesters both come with Pro. If you are at the course limit but still have scans left, Semora says exactly that and points you at re-scanning a course you already have."
        ]
      },
      {
        "heading": "Fixing a grading scale or a weighted average that looks wrong",
        "paragraphs": [
          "Semora calculates your course grade from only the work that has a score. The denominator is the weight you have actually attempted, not the full 100% of the course — so a course with one 10% quiz graded at 80 reads as 80%, not 8%. That is the intended behavior, and it is why a grade can swing hard early in the semester.",
          "If the average looks wrong, check the weights before anything else. Open the course and tap \"Grade categories & rules.\" That screen shows a running category total that turns amber unless your categories add to exactly 100%. Categories are optional: with none, Semora uses the per-task weights the scan extracted; the moment you add categories, tasks are grouped and averaged inside their category and the category weights drive the course grade. A task that belongs to no category simply does not count.",
          "Two other settings on that same screen change the math. \"Drop lowest\" excludes the N lowest scored items in a category once enough grades exist, and always keeps at least one. The extra-credit rule has three options: Bonus adds the task's weight scaled by its score on top of your percentage and caps the result at 100; Category folds extra credit into its category average; Ignore keeps the work visible but out of the math. A third lever lives on the task itself rather than on that screen: a task can be scored as a percentage or as points earned out of points possible, and if every graded task in a category has points, Semora sums the points rather than averaging percentages, which is what most professors actually do. Set that in the task editor, not in Grade Setup.",
          "The letter grade comes from the grading scale the scan pulled off your syllabus — on every plan, free included. If your professor puts an A at 93, that is what Semora uses; the standard 90/80/70 cutoffs are only the fallback when a syllabus does not state a scale. Changing those cutoffs by hand is Pro: open the course, tap Edit Scale, and set each letter's minimum percentage. On free the scanned scale is used as-is, and free accounts see a locked \"Customize grade scale\" row instead of the editor. Grade tracking with weighted averages and your semester GPA are both free, and GPA uses a separate table under Settings, GPA Scale, weighting each course by its credit hours. Grade Scale editing and grade forecasting are the Pro parts."
        ]
      },
      {
        "heading": "When reminders do not arrive",
        "paragraphs": [
          "Start with Me, Settings, Notifications. Two things on that screen answer most reminder questions. At the top, an amber \"Notifications are off\" banner appears whenever iOS permission is missing — tap it to go straight to the system setting. Further down, a Delivery health card reports the live permission state, how many reminders are currently scheduled on the device, when Semora last scheduled anything, and the last error if there was one. Tap the refresh icon to re-run the check.",
          "If permission is fine and reminders still do not arrive, work through the specifics. A reminder whose fire time has already passed is never scheduled, so a task added a couple of hours before it is due can end up with only the alert at the deadline itself. Free accounts get same-day reminders only, and the timing follows the task: for a task with a due time, the same-day alert fires at the deadline itself, and for an all-day task it fires at 9 AM. On top of that comes a last call — two hours before a timed deadline, or 7 PM for an all-day task. So a paper due at 11:59 PM is nudged at 9:59 PM and again at 11:59 PM; there is no separate morning alert unless the task has no due time. The 1-day and 3-day advance reminders are Pro, and so is custom reminder timing with quiet hours; with quiet hours on, a reminder that would land inside the window is pushed to the end of it rather than dropped.",
          "There is also a hard iOS limit worth knowing. The operating system silently discards new notifications once a single app has 64 pending. Semora stays under that by capping itself at 60 and dropping the furthest-out reminders first, on the reasoning that a same-day alert matters more than a 3-day heads-up for something three weeks away. If you track a very large number of tasks with 3-day reminders on, the most distant ones are the ones you will not see.",
          "Two more notes. When you upgrade to Pro, Semora reschedules reminders for every incomplete task you already had, so existing deadlines pick up the 1-day and 3-day alerts without being edited one by one. And reminders on the web app are different by design: browsers cannot schedule a notification for a future date, so the web app checks every 60 seconds while the tab is open and notifies for timed tasks due within five minutes. It is a supplement to the iPhone app, not a replacement, and some browsers block it entirely. Device calendar sync, which is Pro, does not run in a browser either — that one is iPhone-only."
        ]
      },
      {
        "heading": "How syncing across iPhone, iPad and web behaves",
        "paragraphs": [
          "One account, three surfaces, one database. Tasks, courses and semesters are subscribed to in real time, so a task you check off on the web disappears from your iPhone within seconds rather than at the next refresh. Deletions propagate the same way. A bulk change — importing a scanned syllabus, or joining a Course Space a classmate shared — arrives as a single update rather than dozens of separate ones. Joining a Course Space someone invites you to is free; hosting one is Pro.",
          "If a device looks stale, the connection is the usual cause. The realtime channel reconnects on its own with a backoff that starts at two seconds and tops out at 30, so a subway tunnel or a laptop waking from sleep resolves itself. Backgrounding the app and reopening it forces an immediate refetch. On the web, reload the tab.",
          "Edits made offline are queued on the device rather than lost. Me, Settings, Offline & Sync shows exactly where things stand: Waiting, Failed and Conflicts, plus when the last successful sync happened. Queued changes retry automatically with increasing delays, and after six attempts an item is parked instead of retrying forever. Parked items are what the \"Try sync now\" button is for — it forces a retry of everything, including the items the automatic flush deliberately skips.",
          "Conflicts are handled by asking, not guessing. If the same task changed on another device while you were offline, Semora pauses your edit instead of overwriting either version and lists it on that screen with two choices: \"Use cloud version\" or \"Keep my edit.\" If the task was deleted elsewhere, it tells you that instead. A conflict count above zero is the one sync state that will not clear on its own."
        ]
      },
      {
        "heading": "Pro entitlement, and what to do when the web app does not show it",
        "paragraphs": [
          "Pro is bought once, in the iOS app, through Apple — $3.99 a month or $19.99 a year, which works out to about $1.67 a month on the annual plan. There is no checkout on the web. What the purchase produces is a server-side entitlement attached to your account, and every surface reads that same record — which is why Pro applies account-wide, including in the browser, without a second payment.",
          "If the iPhone app shows Pro and the web app does not, the browser is reading a record that has not been refreshed yet. Reload the tab first. If it still does not appear, open the iPhone app, go to Settings and tap Restore Purchases: on iOS that re-validates the App Store receipt and rewrites the entitlement. Then reload the web app. \"Restore\" in the browser cannot do this — with no device receipt to validate, it can only re-read what the server already knows.",
          "Two specific outcomes are worth recognizing. \"Subscription Linked Elsewhere\" means the App Store subscription is already bound to a different Semora account; sign in to the account that originally bought it, since one subscription cannot serve two accounts. \"No Subscription Found\" right after a purchase that clearly went through usually means validation has not landed yet — wait a moment and tap Restore again.",
          "Semora deliberately does not downgrade you on an error. If a network or server problem makes the entitlement unreadable, the answer is treated as unknown rather than as \"not subscribed,\" so a bad connection never turns a paying account free in the middle of a session."
        ]
      },
      {
        "heading": "Canceling, and what canceling does not do",
        "paragraphs": [
          "Semora cannot cancel your subscription, and neither can we — Apple owns the billing relationship. Cancel on your iPhone under Settings, your Apple Account, then Subscriptions. The app links straight there from Settings, Manage Subscription. Canceling stops the next renewal; Pro features keep working until the period you already paid for ends, at which point the account reverts to free limits — 5 scans a month, 4 courses, one semester — with all of your data intact.",
          "The trap worth naming: deleting your Semora account does not cancel your subscription. Apple keeps billing until you cancel it in your Apple Account settings. The delete-account screen warns Pro users about this, but do it in this order — cancel with Apple first, then delete the account. Refunds are Apple's too, requested through reportaproblem.apple.com."
        ]
      },
      {
        "heading": "Your data, and deleting your account",
        "paragraphs": [
          "Semora stores what you would expect: your semesters, courses, tasks and grades, the syllabus files you upload, and any course notes you attach. Uploaded files live in private per-user storage, and every row is scoped to your account at the database level rather than by what the app happens to display.",
          "Deletion is permanent and Semora treats it that way. Go to Me, Settings, Delete Account. You will be asked to verify with Face ID, Touch ID or your device passcode, and then to sign in again — the server requires an actual sign-in within the last five minutes, not just a valid session, so an unlocked phone in someone else's hands cannot delete your account. If you verify with a different account than the one on screen, nothing is deleted and Semora tells you so.",
          "What deletion removes: uploaded syllabi and course notes are cleared from storage first, then your tasks, scan history, courses, semesters, profile and the login itself. There is no recovery and no grace period.",
          "If you only want a clean slate for a new term, deleting the account is the wrong tool for it. On Pro, just start a new semester — unlimited semesters is part of what Pro buys, and last term stays intact next to it. On free you get one semester per account, so a second one needs Pro; the clean slate there comes from reusing the semester you already have, editing or removing the courses you are done with and scanning the new ones into it. And if you want your data out before you go, Pro accounts can export from Progress Insights as CSV, and Pro calendar sync can export your deadlines as an .ics file."
        ]
      }
    ],
    "faq": [
      {
        "question": "Does a failed scan use up one of my 5 free scans?",
        "answer": "No. If Semora rejects the document as not a syllabus, the response gets truncated, or the AI is unreachable, the attempt is logged as a failure and your monthly count is untouched. It does still count toward the separate rolling 24-hour cap of 20 scans, so hammering one stubborn document can trip that limit even while your 5 stay intact. The one case that does spend a free scan is an extraction that succeeded, reached the review screen, and was then abandoned without saving — the work was already done and delivered. Finish the review even if you only keep a couple of items."
      },
      {
        "question": "Why is my course grade so high in the first week?",
        "answer": "Semora grades only the work that has a score. The denominator is the weight you have attempted so far, not the whole course, so one 10% quiz scored 80 reads as 80% rather than 8%. That is deliberate — it tells you where you stand right now, and it stabilizes as more weight gets graded. If it still looks wrong, check that your grade categories add to exactly 100%. Weighted grade tracking and semester GPA are both free."
      },
      {
        "question": "I bought Pro on my iPhone and the web app still shows free.",
        "answer": "Pro is a server-side entitlement your account carries everywhere, so this is almost always a refresh problem. Reload the browser tab first. If nothing changes, open the iPhone app, go to Settings and tap Restore Purchases — that re-validates the App Store receipt and rewrites the record the web reads — then reload the tab. There is no separate web purchase to make, and no second charge; Pro is only ever bought inside the iOS app."
      },
      {
        "question": "I edited something on my laptop and my phone still shows the old version.",
        "answer": "Tasks, courses and semesters sync in real time, usually within seconds. If one device lags, its connection dropped; it reconnects on its own within about 30 seconds, and backgrounding then reopening the app forces an immediate refetch. On the web, reload the tab. If the edit was made offline, check Me, Settings, Offline & Sync — a nonzero Conflicts count needs you to pick a version before it will clear."
      },
      {
        "question": "Can I get 3-day advance reminders on the free plan?",
        "answer": "No. Free accounts get same-day reminders only: for a task with a due time the same-day alert fires at the deadline itself, for an all-day task at 9 AM, plus a last call two hours before a timed deadline or at 7 PM for an all-day task. A paper due at 11:59 PM therefore gets 9:59 PM and 11:59 PM, not a morning ping. The 1-day and 3-day advance reminders and quiet hours are Pro. When you upgrade, Semora reschedules reminders for every incomplete task you already have, so existing deadlines pick up the earlier alerts without you editing them one by one."
      },
      {
        "question": "Can I start a second semester on the free plan?",
        "answer": "No. A free account supports one semester, with up to 4 courses in it, and that is enforced both in the app and in the database — so a new term does not hand you a fresh 4-course allowance. Unlimited courses and unlimited semesters are part of Pro. If you want to keep going on free, reuse your existing semester: remove or edit the courses you have finished and scan the new ones in."
      },
      {
        "question": "Does deleting my Semora account cancel my Pro subscription?",
        "answer": "No, and this catches people out. Apple owns the billing, so deleting your account inside Semora leaves the subscription renewing. Cancel first under Settings, your Apple Account, Subscriptions on your iPhone, then delete the account. Refunds go through Apple at reportaproblem.apple.com. Deletion itself is permanent — courses, tasks, grades, uploaded syllabi and course notes are all removed, with no recovery and no grace period."
      }
    ]
  },
  "ai-syllabus-scanner": {
    "sections": [
      {
        "heading": "The Four Ways to Get a Syllabus Into Semora",
        "paragraphs": [
          "There are four import paths, and the fastest one depends on where your syllabus currently lives. On iPhone and iPad, the camera path is a loop rather than a single shot: you take a photo, Semora asks whether you want to add another page, and you keep going until the syllabus is captured or you reach the five-page ceiling. The first page is captured at higher quality for reading fidelity, and later pages use lighter compression so five phone photos still fit inside the upload budget. If you back out of the camera with pages already captured, you are asked whether to scan them or discard them rather than losing them silently.",
          "The second path is your photo library. Multi-select is on, capped at five images, and page order follows the order you tapped them rather than the order the library happens to sort them in. The third path is a file: a PDF pulled from an email attachment, or anything sitting in Files, iCloud Drive, or Google Drive. Accepted types are PDF, JPEG, PNG, HEIC, HEIF, and WEBP. A PDF is sent as one file and read in full, which is why a long syllabus belongs in as a PDF rather than as photos.",
          "The web app adds two more. You can drag a file onto the scan frame, which lights up to confirm the drop and then runs the identical pipeline. Or you can skip images entirely and paste raw text copied out of a PDF or an LMS page, between 20 and 60,000 characters, with a live character counter. Pasting is the one path with no photography and no reading of an image involved at all, and it is usually the most accurate way to import a syllabus you already have open on a laptop. The pasted text itself is stored with the scan, so the record still points at something you can reopen later."
        ],
        "bullets": [
          "Camera on iPhone and iPad: up to 5 pages in one scan, captured page by page",
          "Photo library: multi-select up to 5 images, ordered by the sequence you tap",
          "Files and PDFs: PDF, JPEG, PNG, HEIC, HEIF, WEBP",
          "Web drag-and-drop: the same file types, dropped straight onto the scan frame",
          "Paste text, web only: 20 to 60,000 characters",
          "Photo scans are budgeted at roughly 10 MB combined, checked as each page is added"
        ]
      },
      {
        "heading": "What a Single Scan Actually Pulls Out",
        "paragraphs": [
          "Extraction runs in one pass and returns a structured record, not a wall of text. At the top level that is the course name, the course code where one is printed, and the instructor.",
          "Class times come back as meeting blocks, one block per recurring slot, which matters for real schedules. A course with a lecture Monday, Wednesday, and Friday from 10:00 to 10:50 in one room plus a Tuesday lab from 14:00 to 16:00 in another comes back as two separate blocks, each with its own day list, start and end time in 24-hour form, kind (lecture, lab, discussion, or other), and location. Office hours use the same shape, except that the day list may be omitted altogether for by-appointment hours: a block that simply has no day list is kept and stored as by-appointment, while one that arrives with a day list that is present but malformed — including an empty one — is dropped like any other bad row. Semester name, semester start, and semester end are pulled when the syllabus states them, and the letter-grade scale comes back as cutoffs sorted highest to lowest, plus and minus grades included.",
          "Then the part you are actually here for: every assignment, quiz, exam, project, and reading. Each one carries a title, a type, a due date, a due time where the syllabus gives one, the percentage weight it contributes to your final grade, a description when there is one, and a confidence score between 0 and 1.",
          "Values that cannot be trusted are repaired or set aside rather than saved as they are. A date has to survive a round-trip check, so an impossible date like February 30 is treated as no date at all instead of quietly rolling forward into March. A due time has to be a real 24-hour clock value. A meeting block with no usable day list, or one that ends before it starts, is dropped on its own, because a single bad row should never sink the rest of the import."
        ],
        "bullets": [
          "Course name, course code, instructor",
          "Meeting blocks: days, start and end time, lecture or lab or discussion or other, room",
          "Office hours blocks, including by-appointment hours where the day list is omitted entirely",
          "Semester name, semester start date, semester end date",
          "The letter-grade scale, with plus and minus cutoffs",
          "Every deadline with its type, date, time, weight, description, and confidence score"
        ]
      },
      {
        "heading": "Review and Confirm: Deadlines Never Save Themselves",
        "paragraphs": [
          "Semora splits the extraction in two. The course, its meeting times, its office hours, the term dates, and the grading scale are written as soon as extraction succeeds, because that part is scaffolding and having it in place is what makes the review screen worth reading. The deadlines themselves wait for you. The review screen opens with a count of items found and a count selected to save, and nothing becomes a task until you press save.",
          "Three badges tell you where to look. Anything scored below 0.8 confidence is badged \"Low confidence — please verify\". Anything whose date parses but falls outside the plausible window for the term is badged \"Date looks outside this term — double-check\"; that window is the term itself plus or minus 45 days when the syllabus stated both term dates, and a wide window around today when it did not. Editing the date clears the badge, because you have now looked at it. Items the syllabus lists without a date, such as a final exam marked TBA, land in a separate \"Needs a date\" section, deselected, and cannot be selected until you supply a date.",
          "There is a fourth signal at the top of the screen. If at least two items came back dated and more than half of them are already in the past, a banner warns that these dates look like a previous term. That is the recycled-PDF case: professors reuse last year's file, and the dates inside it are wrong for you.",
          "Every item is editable in place, including title, type, date, time, weight, and description. Select all only sweeps items that already have a real date. The save is one batch, so either every selected deadline is written or none is, and if it fails you stay on the screen with your selections intact instead of losing them. Once the batch commits, reminders are scheduled for each new deadline."
        ],
        "bullets": [
          "Course, meeting times, office hours, term dates, and grading scale are written before review",
          "Deadlines are written only when you confirm them",
          "Under 0.8 confidence: \"Low confidence — please verify\"",
          "Outside the term window: \"Date looks outside this term — double-check\"",
          "No date in the document: parked in \"Needs a date\", deselected until you set one",
          "Mostly past dates: a banner warns the file may be a previous term's syllabus"
        ]
      },
      {
        "heading": "What Happens When the Document Isn't a Syllabus",
        "paragraphs": [
          "Before anything is extracted, the document is classified. A receipt, an invoice, an article, a form, a menu, an ID card, or a random screenshot is rejected outright, the response never carries a guessed course name, and no rows are created. No phantom course, no phantom semester, no deadlines. It also does not count against your five free monthly scans, because nothing was produced. You get a calm prompt offering to pick another file or try again, not a failure screen.",
          "The same rejection fires when the extraction comes back genuinely empty, with no course name, no meetings, and no deadlines. That is almost always a document that is not a syllabus, and treating it as one would leave you deleting rows you never asked for.",
          "Other failure modes get their own handling. A syllabus dense enough to truncate the response gets a message asking you to scan one course, or fewer pages, at a time. If the model is overloaded, the request is retried with backoff and then falls back to a second model, and only if both stay busy do you see a plain note that the AI is busy and to try again in a minute. A scan that hangs is cancelled at two minutes, and that cancellation stops the pipeline before any writes, so a stalled scan does not leave an orphan course behind. Photos too large to send together tell you exactly how many pages will fit and suggest a PDF instead."
        ]
      },
      {
        "heading": "How Extracted Data Becomes a Working Semester",
        "paragraphs": [
          "The semester comes first. Semora uses the term the syllabus names. If the syllabus does not name one, it falls back to the term you picked during onboarding, but only for your very first semester, so a scan a year later is not filed under a stale term. Failing both, it suggests a term from the current date. An existing semester with that name is reused rather than duplicated. That reuse is doing real work on the free tier, which covers exactly one semester per account: if a scan resolves to a term you already have, it flows straight in, and if it resolves to a new one, it stops there — before the course, the grading scale, the meeting times, or anything else is written — and offers Pro or a re-scan into the term you already have.",
          "Then the course. Matching runs on the course code at a word boundary, which is a small detail with real consequences: \"CS 10\" does not match an existing \"CS 101\" and dump your freshly extracted deadlines into the wrong class. When the course genuinely does already exist, you are asked whether to open the existing one or create a separate duplicate. Semora deliberately does not offer to merge, because the review screen has no per-item duplicate detection and merging would silently double every task you already have.",
          "Re-scanning is safe. Meeting times and office hours are written only for a course the scan just created, so a second scan never overwrites schedule rows you edited by hand. An extracted grading scale is applied only to a new course, or to one still sitting on the default scale, so customized weights are left alone.",
          "Everything you accept on the review screen becomes an ordinary task attached to the course, carrying its type, due date, due time, and percentage weight. That is why one scan gives you both a deadline list and working weighted grade tracking: the weights came out of the same pass, and weighted averages and semester GPA are free. Same-day reminders are free too. Device calendar sync and .ics export are Pro, as is custom reminder timing — 1-day and 3-day, with quiet hours. Calendar sync writes to the calendar on your device, so it is an app feature rather than something the browser can do."
        ]
      },
      {
        "heading": "How Scans Count Against the Free Allowance",
        "paragraphs": [
          "The free tier includes five syllabus scans per calendar month. The window is the calendar month in UTC, so the count resets on the 1st rather than 30 days after your first scan. The scan tab shows how many you have left, and before you spend the fifth you get an explicit heads-up, so the limit is never something you discover after the fact.",
          "One submission is one scan, no matter how much is inside it. Five photos of a stapled five-page syllabus cost exactly what one PDF costs. A pasted-text import costs one. A scan that produced nothing, whether a rejected non-syllabus document or a failed extraction, costs nothing.",
          "The count is enforced identically at every layer: the usage pill on the scan tab, a check that runs in the app before any data is written, a server-side check that runs before the extraction call itself, and a database trigger on the upload row as the last line. All four use the same UTC month boundary and the same limit of five, so what the app tells you and what the server enforces cannot drift apart.",
          "Two other free-tier limits are separate from the scan count, and they show up in different places. The first is four courses per semester, and the scan tab says so plainly: the moment you are at the cap it shows an amber note, so if you still have scans left but already have four courses, you know to re-scan a course you already have — adding a fifth needs Pro. The second is stricter than \"one at a time\" suggests. A free account gets one semester, total. It is not a slot that frees up when the term ends and it does not roll over into spring, which is why the four-course cap is effectively four courses, full stop, rather than four per term. That limit is not previewed on the scan tab; it surfaces at the moment a scan would otherwise create a second term, and it is enforced both in the app and by a trigger on the semesters table, so there is no way around it.",
          "Pro is $3.99 per month or $19.99 per year, which works out to about $1.67 a month on the annual plan. It is purchased inside the iOS app and applies to your whole account, including the web app — there is no separate web checkout. It lifts the monthly scan cap and removes the course and semester limits entirely. Scanning on Pro is not literally infinite, though, and it is worth saying so plainly: every account, free or Pro, is held to a fair-use ceiling of 20 extractions per rolling 24 hours, and a request past that is refused with a note to try again in a day. Twenty scans in one day is scripted-abuse territory; a student importing a full course load never comes near it."
        ],
        "bullets": [
          "Free: 5 scans per calendar month, reset at the start of the month in UTC",
          "One submission equals one scan, whether it is 1 page or 5",
          "Rejected non-syllabus documents and failed scans do not count",
          "Free also allows 4 courses and one semester total — not one semester per term",
          "Pro, $3.99/month or $19.99/year: no monthly scan cap, unlimited courses and semesters",
          "Fair use on every account: 20 extractions per rolling 24 hours"
        ]
      }
    ],
    "faq": [
      {
        "question": "Does a rejected or failed scan use up one of my five free scans?",
        "answer": "No. A document classified as a non-syllabus is refused before any extraction is stored, and nothing is written — no course, no semester, no deadlines — so there is nothing to count. Failed and rejected attempts are logged separately from successful ones. Your monthly count only moves when a scan actually produced a syllabus you can review."
      },
      {
        "question": "Can Semora read a syllabus that runs several pages?",
        "answer": "Yes. A photo scan holds up to five pages in a single submission, captured one at a time or multi-selected from your library, and every page is read together as one document. A PDF is sent whole with no page cap, so a longer syllabus should go in as a PDF. If a very dense syllabus truncates the response, Semora asks you to scan fewer pages at a time."
      },
      {
        "question": "What if the extracted dates are wrong?",
        "answer": "Every deadline waits on the review screen before it is saved, and every field is editable in place: title, type, date, time, and weight. Items scored below 0.8 confidence are badged for verification, dates falling outside the term get their own badge, and if most dates are already in the past a banner warns that this may be last year's syllabus. Nothing is written until you confirm."
      },
      {
        "question": "Does scanning again overwrite the changes I made to a course?",
        "answer": "No. Class meeting times and office hours are written only when the scan creates a brand new course. A grading scale is applied only to a new course, or to one still using the default scale. If Semora finds the course already exists, it asks whether to open it or create a separate duplicate — it will not merge and double the tasks you already have."
      },
      {
        "question": "How many courses and semesters can I scan into on the free tier?",
        "answer": "Four courses, inside a single semester. The semester limit is one per free account in total, not one per term, so a free account cannot start a second semester later — a scan that resolves to a new term stops before anything is written and offers the upgrade instead. Pro ($3.99 a month, or $19.99 a year) removes both limits along with the monthly scan cap. Deadline and task tracking, weighted grade averages, semester GPA, same-day reminders, and joining a Course Space a classmate invites you to are all included free."
      },
      {
        "question": "Do I need a phone camera to scan a syllabus?",
        "answer": "No. On the web app you can drag the file onto the scan frame, or pick it from your computer the usual way. If you would rather skip files entirely, copy the syllabus text and paste it, between 20 and 60,000 characters. Pasting skips the image step and is often the most accurate route when the syllabus is already open in a browser tab."
      }
    ]
  },
  "ai-study-planner-for-college": {
    "sections": [
      {
        "heading": "How Smart Plan turns a deadline into a dated session",
        "paragraphs": [
          "Smart Plan (Pro) does not start by asking you how long anything will take. It reads the incomplete, dated tasks you already have — whatever came out of a syllabus scan, a Canvas import, or a task you typed yourself — and assigns each one an effort estimate. If you entered your own estimate on the task, that number wins, as long as it is at least 15 minutes and no more than 48 hours; an estimate under 15 minutes is treated as no estimate at all. When there is no usable number, Semora starts from a base for the task type, scales it by the grade weight the scan pulled off your syllabus, and rounds up to the nearest 15 minutes.",
          "Effort then gets spread, not dumped. On every planning day, a task contributes its remaining minutes divided by the number of usable days left before it is due, so a six-hour project due in three weeks shows up as a short session most days instead of a wall on the last night. On the day something is actually due, or once it is overdue, the full remainder gets scheduled rather than a slice.",
          "When more work wants a day than your capacity allows, Semora ranks it. Each task's urgency is its load score — grade weight times a prep multiplier for its type — adjusted by its priority flag, divided by the days remaining, plus the pace it has to keep to finish on time. High priority multiplies by 1.55, low priority by 0.78. Heavier and nearer wins; ties break by due date and then title, so the same inputs always produce the same plan."
        ],
        "bullets": [
          "Base effort by type: reading 45 minutes, assignment 90, quiz 75, exam 240, project 360, anything else 60.",
          "Weight multiplier: a task worth 25% or more of your grade gets 1.5x that base, 15% or more gets 1.25x, 8% or more gets 1.1x.",
          "Your own estimate overrides both of those, but only inside a 15-minute floor and a 48-hour ceiling — under the floor it is ignored, over the ceiling it is clamped.",
          "Daily capacity: 1, 1.5, 2, or 3 hours a day, defaulting to 90 minutes.",
          "Session length: 25, 45, or 50 minutes, defaulting to 45.",
          "Start times: separate weekday and weekend start times, defaulting to 5:00 PM and 10:00 AM, with weekends switchable off entirely."
        ]
      },
      {
        "heading": "Your class schedule is a hard boundary",
        "paragraphs": [
          "The class meeting blocks the scanner extracted from your syllabus — days of the week, start time, end time — are not decoration. Smart Plan converts them into blocked intervals and will not place a session on top of one. When a candidate session collides with a class, the planner jumps past the end of that class and tries again rather than shrinking the session or dropping the task.",
          "On iPhone and iPad, leaving \"Avoid calendar conflicts\" on adds your device calendar to the same wall. Semora reads events for the next 14 days only, read-only — the planner never creates or edits an event — and pads each one by 10 minutes on both sides so you are not walking out of a meeting straight into a study block. All-day events are ignored, since they say nothing about your hours. An event that crosses midnight is split by day so each date is judged on its own.",
          "Smaller rules keep the plan physically possible. Sessions are separated by a 10-minute gap. Today's first session never lands in the past: the planner starts from the next 15-minute mark after the current time, or your preferred start time, whichever is later. If a task is due later today at a specific time, its session is placed before that time. Sessions you already completed stay reserved, so a rebuild cannot stack new work onto an hour you already spent."
        ]
      },
      {
        "heading": "The plan rebuilds instead of going stale",
        "paragraphs": [
          "A plan built on Sunday is wrong by Wednesday. Every time you open Smart Plan — on every visit to the screen, not only on app launch — it regenerates. Unfinished sessions are deleted and rebuilt from today forward using your current tasks, current preferences, and current class schedule. Completed sessions are never touched: they stay as history, and the minutes you logged are subtracted both from that task's remaining effort and from that day's capacity.",
          "That is what makes a moved due date a non-event. A professor pushes the midterm back a week, you edit the date once, and the next time you open your plan the sessions for it have redistributed across the longer runway. Mark a task complete and its remaining sessions disappear on their own. Add a task and it competes for time on the next rebuild. The rebuild is deterministic and idempotent — running it twice never duplicates a session.",
          "The plan is also honest about what does not fit. If your daily capacity cannot absorb everything due inside the 14-day window, Semora states the shortfall in plain minutes — for example, that your current capacity leaves three and a half hours of work due within two weeks unscheduled — and names the two real levers: raise your daily study time, or lower your effort estimates. It does not quietly truncate the list and let you discover the gap later."
        ]
      },
      {
        "heading": "Missed sessions roll forward, and they say so",
        "paragraphs": [
          "Skipping happens. When you open the plan, any unfinished session sitting in the past — an earlier day, or an earlier hour today — counts as missed. Its task goes back into the pool and is rescheduled into the next slots that fit, and the new session is stamped with where it came from. Under the session time, the row carries a \"Moved from\" line with the original date on it, so the plan is not quietly rewriting your history behind you.",
          "A banner at the top of the screen summarizes what just changed: how many missed sessions moved forward, and how many calendar conflicts were avoided. If you would rather the plan hold still, turn auto-reschedule off in plan preferences and rebuild on demand with the refresh button instead.",
          "Every unfinished session carries a play button that opens the Focus timer already loaded with that task and that session's length. The plan and the timer are the same object, not two lists you keep in sync by hand."
        ]
      },
      {
        "heading": "The Workload dashboard sees the whole term at once",
        "paragraphs": [
          "Smart Plan answers \"what do I do in the next two weeks.\" The Workload dashboard (Pro) answers \"when does this semester get bad.\" It buckets every incomplete dated task into calendar weeks across your semester's start and end dates — or, if you never set those, across the range of your own due dates — and draws one bar per week.",
          "Bar height is a load score, not a task count. Each task contributes its grade weight multiplied by a prep factor for its type: exams count triple, projects 2.5x, quizzes 1.5x, assignments 1.2x, readings and everything else 1x. A task the scan could not find a weight for still contributes a small base value, so an unweighted exam is never invisible on the chart.",
          "The dashboard also prints the weeks left in the term next to the semester name, which changes how the chart reads. Six heavy bars with eleven weeks left is a scheduling problem. The same six bars with three weeks left is a different conversation."
        ],
        "bullets": [
          "Crunch weeks are outliers, not merely busy weeks. A week is flagged when its load is at least one standard deviation above the mean of the loaded weeks and it holds at least two items. If every week carries near-identical load, nothing gets flagged, because a chart where everything is red tells you nothing.",
          "Exam density gets its own strip: incomplete exams grouped by week, earliest first, so three midterms landing in the same week is visible in September instead of the night before.",
          "Load by course lists your courses heaviest-first with how many items remain, a bar for relative load, how much of your final grade that course's weighted work adds up to, and the next deadline by name and date. Courses with nothing left are dropped from the list.",
          "A short \"start on this next\" list ranks your top three by load divided by days remaining and tiers them as Do now, Coming up, or Plan ahead. It is deterministic math rather than an AI call, and it respects start dates, so work you cannot begin yet stays out of it."
        ]
      },
      {
        "heading": "What planning looks like on the free tier",
        "paragraphs": [
          "Smart Plan and the Workload dashboard are both Pro. Free is not a stripped demo, though — it is a complete tracking layer without the scheduling engine on top. You still get every deadline the scanner pulls out of your syllabus, in a calendar and a task list, with weighted grade tracking, your semester GPA, and reminders on the day work is due.",
          "One boundary is worth knowing before you start, because it is not the usual per-month cap: a free account covers one semester, total. The 4-course limit lives inside that single term and does not refill in January — a free account cannot start a second semester at all, in the app or in the database, which is where Pro's unlimited semesters actually earn their keep.",
          "Pro is $3.99 a month or $19.99 a year, which works out to about $1.67 a month and is roughly 58% cheaper annually. You buy it inside the iOS app through the App Store, and the entitlement applies to your whole account, so the web app reads the same Pro status. There is no separate web checkout."
        ],
        "bullets": [
          "Free: 5 syllabus scans per calendar month, up to 4 courses, and one semester per account. Full deadline and task tracking, grade tracking with weighted averages, semester GPA, same-day reminders, and joining any Course Space a classmate invites you into.",
          "Pro adds the planning layer: Smart Plan, the Workload dashboard, unlimited courses and semesters, syllabus scanning with no monthly cap (a fair-use ceiling of 20 scans in a day), custom reminder timing (1-day and 3-day) with quiet hours, device calendar sync with .ics export, Canvas, Blackboard and Moodle import, hosting your own Course Space, Flashcards, the Focus timer, the AI Tutor, Grade Scale and Forecasting, Academic Risk alerts, Progress Insights, and Share and Streaks."
        ]
      }
    ],
    "faq": [
      {
        "question": "How far ahead does Smart Plan schedule?",
        "answer": "Fourteen days, rolling. Smart Plan builds dated, timed sessions for the next two weeks and regenerates that window every time you open the screen, so the horizon always starts today. Work due after two weeks is not ignored: the pacing math divides a task's remaining minutes by the usable days left before its actual due date, so a distant project simply contributes smaller slices until its deadline moves inside the window."
      },
      {
        "question": "What happens if I skip a study session?",
        "answer": "It moves forward. Any unfinished session that sits in the past — an earlier day, or an earlier hour today — is treated as missed on your next visit, and its work is rescheduled into the next slots that fit around your classes and capacity. The new session is labeled with the date it came from, and a banner tells you how many moved. You can turn auto-reschedule off and rebuild manually instead."
      },
      {
        "question": "Will Smart Plan schedule study time during my classes?",
        "answer": "No. The class meeting blocks the scanner pulled off your syllabus become blocked intervals, and sessions are placed around them. On iPhone and iPad you can also let Smart Plan read your device calendar for the next 14 days, read-only, and it will avoid those events too with a 10-minute buffer on each side. The planner never creates or edits a calendar event."
      },
      {
        "question": "How does the Workload dashboard decide a week is a crunch week?",
        "answer": "Statistically, not by feel. Each week's load is the sum of its incomplete tasks' grade weights times a prep multiplier for type — exams count triple, projects 2.5x, quizzes 1.5x. A week is flagged only when its load is at least one standard deviation above the average loaded week and it contains at least two items, so a single heavy exam does not paint a whole week red."
      },
      {
        "question": "Can I plan a semester on the free tier?",
        "answer": "One semester, partly. Free gives you the tracking layer: every deadline the scanner extracts, a calendar and task list, weighted grade tracking, semester GPA, same-day reminders, up to 4 courses and 5 scans a calendar month. Two limits shape it. The first is that a free account gets one semester total — the 4-course cap does not reset next term, because starting a second term is itself a Pro feature. The second is that the scheduling layer is Pro: Smart Plan's timed sessions and the Workload dashboard's crunch-week chart. You can plan manually from the free deadline list; Semora just will not build the schedule for you."
      }
    ]
  },
  "canvas-deadline-tracker": {
    "sections": [
      {
        "heading": "Start free: paste your Canvas assignments into the scanner",
        "paragraphs": [
          "Canvas import itself is a Pro feature. The job it does, though — getting a semester of deadlines out of Canvas and into one tracked list — has a free path that works right now. Open your Canvas assignments page in a browser, select the list, copy it, and paste it into Semora's scanner on the web. Anything between 20 and 60,000 characters is accepted, which comfortably covers a full course's assignment index.",
          "Pasted text runs through exactly the same pipeline as a photo or a PDF. Gemini extracts the course, then every assignment, quiz, exam, project, and reading with its due date, due time, weight, and a confidence score. You land on a review screen where each item can be edited before it is saved. Anything under 0.8 confidence is badged \"Low confidence — please verify.\" Items with no date at all sit in a \"Needs a date\" section, deselected, so nothing reaches your calendar on a guess.",
          "The free tier gives you 5 scans per calendar month and up to 4 courses — inside a single semester. Be clear on that last part, because it is the limit people misread: a free account gets one semester total, not one semester at a time. The cap is enforced in the app and again by a database trigger on the semesters table, so the 4-course allowance does not reset in January. Four courses pasted once at the start of term sits comfortably inside the scan allowance. Where the paste route genuinely falls short is refresh: a paste is a snapshot, and a Canvas connection keeps re-checking. That gap, plus the second semester, is what Pro actually buys you here."
        ]
      },
      {
        "heading": "Why a personal access token instead of a \"Connect with Canvas\" button",
        "paragraphs": [
          "Most LMS integrations run on OAuth. The vendor registers a developer key with each institution, your school's Canvas administrator reviews and approves it, and until that happens you cannot connect at all. It is a queue you do not control, it has to be repeated per institution, and smaller schools often never reach the front of it.",
          "Semora skips that path entirely. You generate a personal access token inside your own Canvas account. It is scoped to your own enrollments, it belongs to you rather than to a third-party app installed on your school's instance, and you can delete it from the same page at any time. No administrator has to approve anything, and there is nothing for your school's IT office to review.",
          "The token then stays on your device — the iOS Keychain via SecureStore on iPhone and iPad, browser storage on web. It is sent to Semora's sync function only for the length of a single request and is never written to the database. What the server does keep is connection metadata: which provider, your school's Canvas URL, which Canvas course maps to which Semora course, when the last sync ran, and whether it worked. Because the credential never lives server-side, there is no server cron either — sync runs from your device."
        ]
      },
      {
        "heading": "Generating the token: the exact steps",
        "paragraphs": [
          "Do this in a browser, not the Canvas mobile app. The mobile app does not expose the token screen. You will also need your school's Canvas web address, usually yourschool.instructure.com, entered as a full HTTPS URL.",
          "Semora rejects plain HTTP outright, and it refuses private-network addresses — localhost, 127.x, 10.x, 192.168.x, 172.16 through 172.31, and 169.254.x — so a mistyped or hostile URL cannot point the sync server at something it should not reach. Redirects are followed at most three times, and only when they stay on the same host you entered.",
          "Leave the expiry blank so you are not redoing this in week nine. If a token does expire, or you revoke it, the connection flips to \"credentials required\" in Settings with a Reconnect action that accepts a fresh token and re-syncs in place. Your imported courses and assignments are not disturbed while that happens.",
          "The whole sequence, start to finish:"
        ],
        "bullets": [
          "Sign in to Canvas on the web.",
          "Open Account, then Settings.",
          "Under \"Approved Integrations,\" choose \"+ New Access Token.\"",
          "Name it Semora, leave the expiry blank, then Generate Token.",
          "Copy the token and paste it into Semora, along with your school's Canvas web address."
        ]
      },
      {
        "heading": "Choosing which courses actually import",
        "paragraphs": [
          "Once the token is accepted, Semora asks Canvas for your active enrollments and shows you the list before writing a single row. Each course appears with its name and its Canvas course code, all pre-selected, with a Clear control if you would rather take two out of six. Nothing exists in Semora yet at this point — this screen is a preview, not a commitment.",
          "On the same screen you name the connection and choose the semester the courses belong to. \"Import and sync\" then creates one Semora course per selection, each with its own color, links it to the Canvas course id, and runs the first assignment pull. You get a count back: how many courses and how many assignments landed.",
          "The bounds are worth knowing. Up to 50 courses sync per connection, Canvas is paged at 100 results per request for up to 12 pages per endpoint, and a single sync returns at most 5,000 assignments. A course you leave unselected at import is never touched at all. After import, the unit you control is the connection: Settings, Learning Platforms gives each connection exactly two actions, \"Sync now\" and \"Disconnect,\" and disconnecting stops automatic updates without removing anything already in Semora. There is no per-course sync toggle in the interface today, so if you drop a class mid-term, delete that course in Semora directly — which also removes its tasks — or disconnect and re-import with a narrower selection."
        ]
      },
      {
        "heading": "What comes across for each assignment",
        "paragraphs": [
          "Canvas assignments are pulled ordered by due date with your own submission attached, so a single request carries both the assignment and where you stand on it.",
          "Assignments with no due date are counted and skipped, not given a fabricated one. Semora needs a real date to place an item on a calendar and schedule a reminder. The sync result says so plainly — \"N assignments updated, M skipped without usable due dates\" — and the connection is marked \"partial\" instead of \"success\" so that number does not quietly vanish.",
          "Field by field, here is what lands on each item:"
        ],
        "bullets": [
          "Title and description — the Canvas description is stripped of HTML, script and style blocks are dropped, entities are decoded, and the text is capped at 10,000 characters.",
          "Type — quiz when Canvas's submission types say so, otherwise inferred from the name: midterm, final, exam, or test becomes an exam; quiz becomes a quiz; project becomes a project; read, reading, or chapter becomes a reading; everything else is an assignment.",
          "Due date and due time — Canvas returns one absolute timestamp, and Semora carries it through as an absolute value and converts it on your device. An 11:59 p.m. deadline does not slide a day because a server and your timezone disagree.",
          "Points possible, points earned, and a percentage score computed as earned divided by possible, which then feeds your weighted average.",
          "Completion — marked done when your Canvas submission state is submitted, graded, or pending review.",
          "Submitted late — Canvas's own late flag, carried straight across.",
          "Submission time — taken from Canvas's submitted_at when Canvas supplies one, and left blank rather than invented when it does not.",
          "A deep link back to the assignment's Canvas page, plus Canvas's own updated_at so Semora knows how fresh each row is."
        ]
      },
      {
        "heading": "How refresh works",
        "paragraphs": [
          "There are two paths. \"Sync now\" on the connection card in Settings, Learning Platforms runs a refresh immediately. Automatically, Semora re-syncs any connection whose last sync is more than 30 minutes old, on app launch and again each time you bring the app back to the foreground.",
          "Automatic sync is deliberately quiet. It never raises an alert, it skips when the device is offline, it skips any connection whose credential is not stored on that particular device, and it will not run two syncs at once. Failures are recorded as connection health you can read later in Settings rather than thrown at you mid-lecture.",
          "After every sync, Semora reschedules your task reminders, so a due date Canvas moved actually moves the notification too. Each connection carries a visible state — never, syncing, success, partial, error, or credentials required — with the last error text and a Reconnect action on the ones that need attention."
        ]
      },
      {
        "heading": "What a sync will never overwrite",
        "paragraphs": [
          "The merge is written so a refresh can add and correct, but not erase. These rules are enforced in the database rather than in the app, so they hold no matter which device triggered the sync.",
          "What does get refreshed from Canvas each time is the set of fields Canvas is genuinely authoritative for: title, description, type, due date and time, which course the item belongs to, the deep link, and Canvas's updated_at. Everything about whether you did the thing, when, and what you scored stays yours.",
          "Disconnecting is equally non-destructive. The confirmation says it in as many words: automatic updates will stop, and imported courses, assignments, completion, and grades stay in Semora. What gets removed is the connection record and the stored token.",
          "Here is what a sync will not touch:"
        ],
        "bullets": [
          "Completion is a logical OR. If you checked something off in Semora, no sync un-checks it, regardless of what Canvas reports. If Canvas says submitted and Semora did not know, it becomes complete.",
          "Completion timestamps are sticky. Once an item is complete, the original timestamp stands and later syncs leave it alone. When Canvas knows work is done but not when, the timestamp stays empty instead of being backfilled with the sync time — filling it in would falsely make on-time work look late.",
          "The late flag is also an OR, so it cannot be silently cleared by a later response.",
          "Grades merge rather than replace. Points possible, points earned, and score each take the Canvas value only when Canvas has one. A null from Canvas leaves whatever is already there, so a score you entered by hand survives a sync that returns nothing for it.",
          "Nothing is deleted. The sync response is explicitly flagged as unsafe for removal inference, so the deletion pass never runs at all. Even when it could run, it only stamps a removed-at timestamp on the row — a tombstone, never a delete."
        ]
      },
      {
        "heading": "Blackboard and Moodle: the honest version",
        "paragraphs": [
          "Both are supported. Both are thinner than Canvas, and both usually depend on your institution rather than on you. That is worth knowing before you buy Pro expecting the Canvas experience on a different platform.",
          "Blackboard needs a school-issued OAuth access token, which in practice means an administrator has to approve read access first. What comes across is gradebook columns: title, description, due date, points possible, and a link back to the item in the Ultra course outline. There is no submission state and no earned score in that feed, so completion and grades in Semora stay entirely yours to track by hand.",
          "Moodle needs an administrator to have enabled web services and issued you a web-service token with course and assignment read permissions. Semora then reads your enrolled courses and your mod_assign assignments — name, intro text, due date, and grade value. Activities that are not mod_assign, including Moodle quizzes, do not come across. Negative grade values, which Moodle uses to denote non-numeric scales rather than point totals, are deliberately discarded so they cannot become \"-1 possible points\" inside your weighted average.",
          "If your school runs Blackboard or Moodle and will not issue a token, the paste route from the top of this page is not a consolation prize. It is the same extraction that reads a syllabus, and it does not care which LMS your school licensed."
        ]
      }
    ],
    "faq": [
      {
        "question": "Does connecting Canvas change anything inside Canvas?",
        "answer": "No. Every Canvas call Semora makes is a read. It lists your active courses and pulls assignments with your submission attached. Nothing is created, edited, submitted, or deleted on the Canvas side, and you still submit your work in Canvas as usual. The sync function also cannot reach a private-network address or follow a redirect off your school's host — both are blocked outright."
      },
      {
        "question": "Where is my Canvas token stored, and how do I revoke it?",
        "answer": "On your device: the iOS Keychain through SecureStore on iPhone and iPad, browser storage on web. Semora's server keeps only connection metadata — provider, your school's Canvas URL, which courses are linked, and sync health. To revoke, delete the token in Canvas under Account, Settings, Approved Integrations, or disconnect inside Semora, which removes the stored credential. Either action stops the sync immediately."
      },
      {
        "question": "If I check an assignment off in Semora, will a sync un-check it?",
        "answer": "No. Completion is a logical OR between what Semora already knows and what Canvas reports, so a sync can only ever mark an item complete, never incomplete. The completion timestamp is equally sticky — once set, later syncs leave it alone. The late flag behaves the same way, and grades merge rather than replace, so a score you typed in survives a sync that returns nothing for that field."
      },
      {
        "question": "What happens to Canvas assignments with no due date?",
        "answer": "They are counted and skipped rather than guessed at. Semora needs a real date to place an item on a calendar and schedule a reminder, so undated Canvas rows never receive an invented one. The sync result reports how many were skipped, and the connection is flagged \"partial\" rather than \"success\" so the number stays visible. Add those items by hand if you want them tracked."
      },
      {
        "question": "Can I stop syncing one course without disconnecting the whole thing?",
        "answer": "Not today. Each connection in Settings, Learning Platforms offers two actions — \"Sync now\" and \"Disconnect\" — and there is no per-course toggle in the interface. The choices that do exist: leave a course unselected at import, in which case it is never created; delete the course inside Semora, which also deletes its tasks; or disconnect the connection and re-import with a narrower selection. Disconnecting keeps everything already imported."
      },
      {
        "question": "Can I use Semora with Canvas without paying for Pro?",
        "answer": "Yes, with a different mechanic. The Canvas connection is Pro, but the free tier covers 5 syllabus scans per calendar month, up to 4 courses, full deadline and task tracking, grade tracking with weighted averages, semester GPA, same-day reminders, and joining a Course Space a classmate invites you to. Copy the text of your Canvas assignments page and paste it into the scanner — it runs the same extraction as a PDF. You refresh it yourself instead of automatically. The one hard stop is that a free account covers a single semester total, so a second term needs Pro: $3.99 a month or $19.99 a year, purchased in the iOS app and applied to your account everywhere, including web. Pro also drops the monthly scan cap, subject to a fair-use ceiling of 20 scans in a day."
      }
    ]
  }
};

export function getPageContent(key: PageKey): PageLongForm | undefined {
  return PAGE_CONTENT[key];
}
