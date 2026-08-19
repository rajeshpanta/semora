/**
 * Additional depth for the shorter /compare/{slug} pages.
 *
 * Kept separate from lib/competitors.ts so the fact-checked competitor
 * record there stays untouched. Everything here is Semora-side detail or
 * product-neutral buying guidance — by design it introduces NO new factual
 * claim about any competitor, because competitor claims cannot be verified
 * against this repo the way Semora's own behaviour can.
 */
import type { FaqItem } from '@/components/Faq';

export interface CompareExtra {
  extraSections: { heading: string; body: string[] }[];
  faq: FaqItem[];
}

export const COMPARE_EXTRA: Record<string, CompareExtra> =
{
  "dormway": {
    "extraSections": [
      {
        "heading": "Syllabus-first vs. LMS-first: what the difference actually does",
        "body": [
          "Both apps start from a document rather than a blank calendar, but what each one treats as the source of truth changes what you end up with. DormWay's own description pairs syllabus parsing with read-only Canvas, Blackboard, and Moodle sync, merging both into a single timeline and week view. Semora treats the syllabus itself as the primary record: the scan pulls the course name and code, the instructor, class meeting blocks with days, start and end times, kind and room, office hours, the semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading with a due date, a due time, a percentage weight, and a confidence score.",
          "The percentage weight is the part that matters most, and it is usually the part an LMS feed does not carry. A Canvas assignment list tells you a paper is due Thursday. The syllabus is what tells you the paper is 25 percent of your grade. Semora's workload math runs on that number: each item's load score is its extracted grade weight multiplied by a prep-effort multiplier for its type, so an exam counts three times a reading at equal weight, a project 2.5 times, a quiz 1.5, an assignment 1.2. A week is flagged as a crunch week when its total load is a statistical outlier for your semester — at or above the mean plus one standard deviation, with at least two items in it, so a single big exam does not get called a crunch week on its own. Without weights that ranking is impossible, and every deadline looks the same size.",
          "Which model suits you depends on your professors, not on the software. If every one of your instructors posts every assignment into the LMS and keeps the dates current, an LMS-first timeline is genuinely less work. If some of your syllabi never make it into Canvas in full — the reading schedule lives in a PDF appendix, the exam dates sit in a table on page two — a syllabus-first tool captures work the sync would never see. Semora offers both paths: Canvas, Blackboard, and Moodle import is a Pro feature. Its current Canvas connector uses a personal access token and should be used only where the institution permits third-party token connections. The alternative is to copy assignment text out of an LMS page and paste it into the scanner on web, which accepts anywhere from 20 to 60,000 characters at a time. That floor is low enough that a pasted assignment list of a few hundred characters goes through fine, and the ceiling is generous enough for a full multi-course syllabus."
        ]
      },
      {
        "heading": "What the review screen actually asks you to approve",
        "body": [
          "Semora splits the scan result into two categories rather than dumping everything into one confirm-all list. On a course's first scan, the course itself, its meeting times, and its grading scale are written to your semester before you review anything, because those are stable facts you would have typed identically. Only the deadlines wait for your approval. Re-scanning a revised syllabus into a course you already have is more conservative still: the meeting times and office hours are not rewritten at all, and an extracted letter scale is applied only if you never touched the default one, so your own schedule and grading edits survive and only the new deadlines come through for review. Either way the review step stays short enough that you actually read it.",
          "Every extracted item carries a confidence score, and the review screen uses it. Anything below 0.8 is badged \"Low confidence — please verify\". Any dated item that falls well outside the term the scan extracted — roughly six weeks either side of the semester start and end dates, to allow for early postings and finals-week spillover — is badged \"Date looks outside this term — double-check\", and when the scan could not find term dates at all the same check still runs against a wide window around today rather than being skipped. Items the scan found but could not date drop into a separate \"Needs a date\" section, deselected, so an undated reading never quietly becomes a deadline for today. If most of the dated items land in the past, the screen shows a banner warning that this may be an old syllabus before you save anything.",
          "This is deliberate, and it is worth applying as a test to any AI planner you evaluate. Extraction from a scanned PDF is probabilistic. A tool that hides that fact and presents 40 confidently wrong dates is worse than no tool, because you will trust it and stop reading the syllabus. Ask to see the review step before you commit a semester. Photo scans are budgeted at 10 MB combined across up to five pages per scan, which covers a normal phone capture of a multi-page syllabus without you compressing anything first."
        ]
      },
      {
        "heading": "When a due date moves",
        "body": [
          "Due dates move. A professor pushes the midterm a week, a snow day shifts the reading schedule, a group project slides after half the class asks. What that costs you is one of the more useful things to test in any planner, because in a lot of tools the answer is re-import everything and clean up the duplicates.",
          "In Semora you edit the date once on the deadline itself, and the rest follows from that edit. Device reminders for that task are cancelled and rescheduled against the new date and time rather than left pointing at the old one. If device calendar sync is on — a Pro feature, and one that does not run in a browser — the existing calendar event is updated in place instead of a second event appearing next to the stale one. Smart Plan rebuilds every unfinished study block from today forward the next time you open the planner, carrying missed sessions forward while leaving completed sessions in your history, so the schedule reflects the new deadline without you rebuilding it by hand. The workload dashboard recomputes its crunch weeks because the item moved into a different week bucket, and Academic Risk re-evaluates what is now overdue.",
          "On the free tier, the deadline and its same-day reminder move with the edit. The study-plan rebuild, the calendar-event update, and the risk re-evaluation are Pro. Either way, the point is that one edit propagates rather than requiring a fresh scan, which also matters because on the free tier a re-scan would spend the single AI action the account ever gets."
        ]
      },
      {
        "heading": "What the free tier honestly covers for a full course load",
        "body": [
          "The free tier is one AI action for the lifetime of the account and up to 4 courses, with no credit card. You pick what that one action goes on — a syllabus scan, a lecture recording, or turning a document into notes, whichever you reach for first. Nothing resets afterwards, and there is no monthly allowance to wait for. A standard four-course semester therefore means one scanned syllabus and three courses you enter by hand, which free supports: four course slots, with unlimited tasks and deadlines inside them. There is a third cap the arithmetic above hides, and it is the one worth knowing before you start: a free account covers one semester, total. The single AI action and the 4 courses all live inside that one term, the limit is enforced both in the app and by a database trigger on the semesters table, and starting a second semester requires Pro. The 4-course cap does not roll over into a fresh term, because a free account never gets a fresh term.",
          "Re-scanning a course you already have does not consume a second course slot. Semora matches an incoming scan against your existing courses in that semester by course code at a word boundary, so \"CS 101\" matches your existing CS 101 and does not match CS 10, and folds the new deadlines into the course that is already there. That behavior matters most on Pro, where re-scanning a revised syllabus is routine; on free, the one action is the whole budget, so spend it on the messiest syllabus you have.",
          "Free covers full deadline and task tracking, grade tracking with weighted averages against the letter scale the scan extracted, semester GPA, your class schedule, same-day reminders, and joining a Course Space a classmate invites you to. Pro, at $3.99 per month or $19.99 per year — about $1.67 a month on the annual plan — adds unlimited courses and unlimited semesters, syllabus scanning with no cap at all (a fair-use ceiling of 20 scans per day applies), LMS import subject to school policy and platform configuration, hosting your own Course Space, Smart Plan, the workload dashboard, flashcards, a focus timer, the AI tutor, grade scale customization and forecasting, device calendar sync with .ics export, custom 1-day and 3-day reminder timing with quiet hours, Academic Risk alerts, Progress Insights, and Share and Streaks. Pro can be bought two ways — with a card on the web at app.semoraai.com, processed by Stripe, or inside the iOS app through the App Store — and either way it applies account-wide, including on the web app, so you only ever pay once.",
          "A permanently free product and a free tier under a paid product are different bets, and it is fair to weigh them as such. A free tier tells you how the paid version is funded and what happens if the developer needs revenue. A free product tells you nothing about that, favorably or unfavorably. With Semora the shape of the bet is unusually clear: free is one real term, with your real courses and one AI action to spend inside it, and everything past that is a paid decision. Make it on how the term actually went rather than on a feature list."
        ]
      },
      {
        "heading": "What to check before committing a semester to any planner",
        "body": [
          "First, check whether you can get your data out. Semora exports a semester of deadlines and weekly class meetings as a standard .ics file you can import into Google Calendar or Outlook, and Progress Insights produces a CSV semester report plus a printable grade report on web, both Pro. Account deletion is available in the app. Ask any competing tool the same question before you type in a semester of work.",
          "Second, check the devices you actually use. Semora is one universal iOS app for iPhone and iPad plus a web app, sharing a single account with near real-time sync, and there is no Mac app and no Android app. Browser notifications on the web app fire while a tab is open; they are not closed-tab push, and device calendar sync does not run in a browser at all. If you live on a Mac or an Android phone, that constraint should decide the question before any feature comparison does.",
          "Third, check what the tool does when you are offline and when you stop paying. Semora lets you create courses and tasks, edit them, and tick them off with no connection at all, keeps the last seven days of your semester cached on the device so there is something to open in the first place, then flushes the queue with exponential backoff, parking anything that fails permanently instead of retrying forever, and it detects conflicts when the server row changed underneath you. On the paid question: a lapsed subscription in Semora falls back to same-day reminders rather than quietly continuing Pro reminder timing.",
          "Fourth, and simplest: run one real syllabus through anything you are considering during add/drop week, before the first exam, while the cost of switching is a lost afternoon rather than a lost semester. Scan the messiest syllabus you have, the one with the reading schedule in a table and the exam dates buried in a paragraph, and read the review screen line by line. Whatever survives that test is the tool to use."
        ]
      }
    ],
    "faq": [
      {
        "question": "What happens in Semora when a professor moves a due date?",
        "answer": "You edit the date on the deadline once and everything downstream follows. Semora cancels the old device reminders and reschedules them against the new date and time, updates the existing calendar event in place rather than creating a duplicate if device calendar sync is on, and rebuilds every unfinished Smart Plan study block the next time you open the planner, carrying missed sessions forward while keeping completed ones in your history. Calendar sync and Smart Plan are Pro; the deadline and its same-day reminder move on the free tier."
      },
      {
        "question": "Do I need a separate scan for every course, and does re-scanning use up my free course limit?",
        "answer": "One scan handles one syllabus, and free includes one AI action for the lifetime of the account, so a four-course semester means one scanned syllabus and three courses entered by hand unless you upgrade. Re-scanning a course you already have does not consume a second course slot: Semora matches the incoming scan against your existing courses by course code at a word boundary, so a revised CS 101 syllabus folds into the CS 101 you already have, and that re-scan leaves your meeting times, office hours and any grade-scale edits untouched, bringing through only the deadlines. Nothing resets, though — the free action does not come back next month — and the 4-course cap is counted separately from it. The 4-course cap does not reset with a new term either, because a free account is limited to one semester in total."
      },
      {
        "question": "Is Semora's free tier enough for a real semester, or is it a demo?",
        "answer": "It is a working tier rather than a timed sample, but it is scoped to one semester — free accounts are capped at a single semester total, so a second term needs Pro. Inside that term, free gives you one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or turning a document into notes, whichever you reach for first — plus up to 4 courses, full deadline and task tracking, grade tracking with weighted averages against the letter scale the scan extracted, semester GPA, your class schedule, same-day reminders, and joining a Course Space a classmate invites you to. That is a genuine full course load to track, not a crippled preview; what is rationed is the AI, not your semester. What it does not include is the study-planning layer: Smart Plan, the workload dashboard, flashcards, the focus timer, the AI tutor, grade forecasting, calendar sync, and custom reminder timing are Pro."
      },
      {
        "question": "Can I get my deadlines and grades out of Semora if I switch apps later?",
        "answer": "Yes. Semora exports a semester's deadlines and weekly class meetings as a standard RFC 5545 .ics file you can import into Google Calendar, Outlook, or Apple Calendar, and Progress Insights generates a CSV semester report with per-course grades, completion and on-time percentages, plus a printable report on web. Both are Pro features. Account deletion is available in the app. Checking the export path before you commit a semester is worth doing with any planner, not just this one."
      }
    ]
  },
  "mindgrasp": {
    "extraSections": [
      {
        "heading": "Syllabus-first vs. file-first, mechanically",
        "body": [
          "The difference between these two tools is not AI quality. It is what the AI is pointed at and what it leaves behind. Semora reads one specific document , your syllabus, and writes durable structure out of it: a course record with its code and instructor, the class meeting blocks (days, start and end time, kind, room), office hours, semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading with a due date, a due time, and a percentage weight. That structure is the thing you keep and edit for four months. A file-first tool, by design, produces an artifact per upload — notes, a summary, flashcards, a quiz for that one file. Both are legitimate jobs. Only one of them ends with a calendar.",
          "Semora also splits the write into two stages on purpose. The course, its meeting times, and its grading scale are saved as soon as the scan finishes, because those are rarely contested and you want them on your schedule immediately. Only deadlines wait for your approval. The review screen lists every extracted item with a per-item edit control, badges anything the model scored under 0.8 confidence as \"Low confidence — please verify,\" badges anything dated outside your term as \"Date looks outside this term — double-check,\" and parks undated items like \"Final exam — TBA\" in their own \"Needs a date\" section, deselected, so an invented date never reaches your calendar.",
          "The practical effect is that you correct a scan in week one instead of discovering a wrong date in week nine, and the version that gets saved is the one you edited, not the one the model guessed."
        ]
      },
      {
        "heading": "What the free tier actually covers for a real course load",
        "body": [
          "Free means: one AI action for the lifetime of the account, up to 4 courses, full deadline and task tracking, grade tracking with weighted averages, a semester GPA, same-day reminders, and joining a Course Space a classmate invites you to. No credit card. Nothing on the free tier runs on a clock either — its limits are counts you can check against your own course load before you commit a single week to it.",
          "One of those counts decides whether free works for you at all, so it belongs first: a free account gets one semester, total. The app sets that limit to 1, and a BEFORE INSERT trigger on the semesters table enforces it server-side, so it is not a client-side nudge you can route around. The practical reading is that the four-course cap is not a per-term allowance that refills in January — it is four courses inside the single semester a free account holds. Pro is what lifts both ceilings: unlimited courses and unlimited semesters.",
          "Run the arithmetic against a normal semester anyway, because within that one term the free tier is still genuinely usable. The single AI action covers one syllabus — pick the course whose dates would be hardest to type out — and the other three go into the same four course slots by hand, with unlimited tasks and deadlines inside them. Nothing refills, so a professor handing out a revised syllabus in week three is a manual edit rather than a second scan, and re-scanning a course you already have does not consume one of your four course slots. A fifth course does, and that is where Pro starts. You have four ways to feed the scanner: a camera photo of up to 5 pages per scan (budgeted at roughly 10 MB combined), a PDF upload, drag-and-drop on the web app, or raw text pasted into the web app, anywhere from 20 to 60,000 characters. On Pro the scan cap goes away entirely and only a fair-use ceiling remains — 20 scans in a day, after which the parser asks you to come back tomorrow.",
          "One more limit worth stating plainly: Canvas, Blackboard, and Moodle import is a Pro feature, gated on the server, in the settings screen, and on the deep link. The current Canvas connector uses a personal access token and should be used only where your institution permits third-party token connections. If it is unavailable or not permitted, or you are on the free plan, open your Canvas assignments page, select the list, and paste it into the web scanner as text. You get the same extraction and the same review screen — you have simply done the fetching yourself, and on free it costs the same single AI action any other scan would."
        ]
      },
      {
        "heading": "How deadlines, grades, and planning are wired together",
        "body": [
          "Every deadline Semora extracts carries two fields that most task apps do not have: a task type and a percentage weight, both read off the syllabus. Those fields are what let one scan drive three different views instead of one flat list.",
          "Grades come first. The running course grade is a weighted average computed against your professor's real rules (grade categories, drop-lowest policies, and an extra-credit setting) and converted to a letter using the scale the scan lifted from the syllabus. Weighted course grades and your semester GPA are both on the free tier. Pro adds the forecasting layer: a \"What do I need?\" card that, for each letter on your scale, shows the average you would need across the weight still in play and labels it \"Locked in,\" \"avg 84% on the rest,\" \"Needs extra credit,\" or \"Out of reach\"; plus a final-exam what-if that projects the course grade for a hypothetical score without saving anything.",
          "Planning uses the same fields. The Pro Workload dashboard buckets your incomplete dated work into ISO weeks and scores each week by weight times a prep multiplier (exams count triple, projects 2.5x, quizzes 1.5x, assignments 1.2x, readings 1x) then flags a week as crunch only when it is a genuine outlier: a full standard deviation above your own semester mean, and holding at least two items. Academic Risk alerts, also Pro, watch three separate signals: overdue work, a course whose last three graded items average seven or more points below the three before them (or sits under 70 percent), and five or more deadlines inside a seven-day window. Each one arrives with a specific first step rather than a red badge."
        ]
      },
      {
        "heading": "What happens when a due date moves",
        "body": [
          "Professors move dates, and that is where a planner either earns its place or becomes another thing to maintain. In Semora you change the due date once, on whichever device is in your hand, and everything derived from that date follows. Reminders for that task are cancelled and rebuilt — same-day on free, plus 1-day and 3-day advance notices with quiet hours on Pro. The device calendar event refreshes if calendar sync is on; that sync is a Pro feature and it writes to the calendar on your iPhone or iPad, not inside a browser tab, though the .ics export downloads on the web just fine. The week scoring in the Pro workload view recomputes, which can move a crunch week or clear one.",
          "Smart Plan, also Pro, re-plans over a rolling 14-day horizon using your own settings: a daily study budget of 60, 90, 120, or 180 minutes, sessions of 25, 45, or 50 minutes, separate weekday and weekend start times, and whether weekends count at all. It schedules around your class meetings and your calendar events rather than on top of them. Sessions you missed get auto-rescheduled and labeled \"Moved from\" the original date, so you can see what slipped. When work due inside the horizon genuinely will not fit your budget, the plan reports those minutes as at risk instead of quietly overbooking you.",
          "All of this propagates across iPhone, iPad, and the web app in near real time on one account. A tool whose output is a per-file study artifact has no date to move — that is not a flaw in it, it is simply a different job."
        ]
      },
      {
        "heading": "What to check before committing a semester to any planner",
        "body": [
          "This is worth doing regardless of which app you pick. Five questions separate tools that survive a semester from tools you abandon by October. Does it hold all of your courses in one place, or does it work one file at a time? Can you see and correct what the AI extracted before it becomes your calendar? Are the free tier's limits published as numbers you can check (scans, courses, terms) rather than left vague until you hit one? If you pay on your phone, does the subscription apply on your laptop? And does it compute your grade from your syllabus's actual weights, or just store the scores you type in?",
          "Semora's answers, for the record: every course lands in one deadline list; deadlines pass through an editable review screen with confidence and out-of-term warnings before they are saved; the free tier is exactly three numbers (1 AI action per account for life, 4 courses, and 1 semester per account) with nothing expiring on a date; Pro is $3.99 a month or $19.99 a year (about $1.67 a month on the annual plan), bought once either with a card on the web through Stripe or inside the iOS app through the App Store, and applied account-wide whichever route you take, so the browser and the phone read the same entitlement rather than charging you twice; and the gradebook uses the weights the scan pulled off your syllabus.",
          "The limits deserve the same directness. Google Classroom and Google Calendar sync exist in Semora's codebase but are not shipped, so do not plan around them. Device calendar sync is iPhone and iPad only — a browser cannot write to your system calendar, and the .ics download is the web equivalent. Browser notifications on the web only fire while a tab is open. And Semora launched recently, so there is no long public rating history to point you at. Ask the same five questions of Mindgrasp on its own site before you decide — third-party pricing and feature summaries go stale quickly, and both products are worth checking firsthand."
        ]
      }
    ],
    "faq": [
      {
        "question": "How does Semora keep a bad AI reading out of my calendar?",
        "answer": "Every scan ends on a review screen before any deadline is saved. Each extracted item shows its due date, due time, and percentage weight, and each one is editable in place. Anything the model scored below 0.8 confidence is badged \"Low confidence — please verify,\" anything dated outside your semester is badged \"Date looks outside this term — double-check,\" and items with no date at all sit deselected in a \"Needs a date\" section until you set one yourself."
      },
      {
        "question": "Where exactly does Semora's free tier stop?",
        "answer": "At three numbers, not a date: one AI action for the lifetime of the account, 4 courses, and 1 semester per account. That single action is yours to spend on a syllabus scan, a lecture recording, or turning a document into notes, and it does not come back — nothing about it resets. The semester limit is enforced by a database trigger, not just a client check, so the four-course cap lives inside that single term rather than refilling each fall and spring. Everything inside those bounds keeps working: deadline and task tracking, weighted grades and semester GPA, same-day reminders, and joining a Course Space someone invites you to. Pro ($3.99/month or $19.99/year) removes the course and semester limits and the scan cap, leaving only a fair-use ceiling of 20 scans a day."
      },
      {
        "question": "What happens in Semora when a professor moves a due date?",
        "answer": "You change the date once, on any device, and everything derived from it follows. Reminders for that task are cancelled and rescheduled, the device calendar event refreshes if calendar sync is on (a Pro feature, on iPhone and iPad — the web app exports .ics instead), and the workload week scoring recomputes. Smart Plan re-plans its rolling 14-day horizon around the new date, auto-rescheduling any sessions you missed and labeling them \"Moved from\" the original day. iPhone, iPad, and web stay in step in near real time."
      },
      {
        "question": "Can I get Canvas assignments into Semora without paying for Pro?",
        "answer": "Yes, by pasting. Direct Canvas, Blackboard, and Moodle import is a Pro feature. The current Canvas connector uses a personal access token and should be used only where your institution permits third-party token connections. The scanner accepts raw pasted text on the web app, anywhere from 20 to 60,000 characters, so you can select your Canvas assignments list, paste it in, and get the same extraction and the same editable review screen. You are doing the fetching yourself, and it draws on the same allowance a syllabus scan does — on free, that is your one AI action."
      },
      {
        "question": "Does Semora actually calculate my course grade, or just store scores?",
        "answer": "It calculates. The scan pulls each item's percentage weight and the course's letter-grade scale off your syllabus, so the running grade is a weighted average against your professor's real rules, including grade categories, drop-lowest policies, and extra credit. That part is free, as is your semester GPA. Pro adds forecasting: for every letter on your scale, the average you would need across the weight still in play, plus a final-exam what-if that projects a result without saving it."
      }
    ]
  },
  "taskade": {
    "extraSections": [
      {
        "heading": "What \"syllabus-first\" actually changes",
        "body": [
          "A general-purpose workspace gives you views and lets you decide what goes in them. That flexibility is the product. Semora goes the other way: it already knows what a syllabus is, so the structure arrives before you do. When a scan finishes, Semora has already written the course, its meeting blocks (days, start and end time, kind, room), its office hours, the semester start and end dates, and the letter-grade scale the document specified. Only the deadlines wait for your approval.",
          "That approval step is a review screen, not a silent import. Every extracted assignment, quiz, exam, project, and reading shows up with its due date, due time, and percentage weight, each one editable in place. Items the model was unsure about are badged \"Low confidence — please verify.\" Dated items that fall outside the term you just imported are badged \"Date looks outside this term — double-check.\" Items the syllabus never dated at all — the classic \"Final Exam — date TBA\" — sit in their own \"Needs a date\" section, deselected, because a deadline without a date is not a deadline. If most of the dated items are already in the past, you get a banner saying so; that usually means you scanned last year's recycled PDF.",
          "The practical difference is where the opinion comes from. In a configurable workspace you decide what a course record is, which fields an assignment carries, how weights roll into a grade, and what a term boundary means, and then you maintain that schema for four months. Semora ships those decisions. That is a real trade: you get less freedom to model your own system, and you stop spending September building one."
        ]
      },
      {
        "heading": "What the free tier covers for a real course load",
        "body": [
          "Semora's free tier is $0 with no credit card and no time limit: one AI action for the lifetime of the account, up to 4 courses, full deadline and task tracking, grade tracking with weighted averages, a current-semester GPA estimate, same-day reminders, and joining any Course Space a classmate invites you to. Two of those numbers matter more than the rest and both are easy to miss on a feature grid: the AI action is once per account rather than once a month, and a free account gets one semester, total, not one at a time.",
          "Run the math against an actual semester. Four courses is one scanned syllabus and three you type in, because the AI action is spent the first time you use it and nothing refills it — there is no monthly window to wait out. The course cap is written as four per semester, but because a free account only ever holds the one semester, four courses is the whole account. Where the free tier genuinely runs out, then, is your second syllabus, a five-course term, and, the hard one, the next term. The free semester limit is one, checked in the app and again by a before-insert trigger on the semesters table, so starting a second semester is not a nag screen you can click past: the record is refused until you upgrade. Plan on one free semester, and expect the scanning question to come up in week one rather than in December.",
          "Two things students often assume are free here are not, and it is worth being blunt about them. Canvas, Blackboard, and Moodle import is a Pro feature — the sync function itself returns a Pro-required error, and the provider list and connect deep link are both gated. The current Canvas connector uses a personal access token and should be used only where your institution permits it. Hosting your own Course Space is Pro as well, though joining one someone else hosts is free and stays free. The fallback for LMS import is not a consolation prize: open your assignment list in Canvas, copy the text, and paste it into the web scanner, which accepts anywhere from 20 to 60,000 characters. It runs through the same extraction path a PDF does and lands on the same review screen."
        ]
      },
      {
        "heading": "What happens when a due date moves",
        "body": [
          "This is the question that separates a planner from a list, and it is worth asking of any tool you are considering. A professor pushes the midterm back a week. What updates by itself, and what do you have to remember?",
          "In Semora, changing a due date is not just a field write. The device reminders already scheduled for that task are cancelled and re-scheduled against the new date and time — same-day on free; your custom 1-day and 3-day timing and your quiet hours on Pro, since the custom offsets are themselves the paid part and the scheduler falls back to same-day defaults for everyone else. If device calendar sync is on — Pro, and on iPhone or iPad, since it deliberately no-ops in a browser — the existing calendar event is updated in place rather than duplicated. The study blocks that referenced the task are invalidated. The next time you open Smart Plan (Pro), the plan rebuilds deterministically: completed sessions stay in your history, every unfinished block is regenerated from today forward across a two-week horizon, work you missed carries forward, and sessions route around your class meeting times.",
          "The workload dashboard re-derives at the same time. A crunch week there is not a week with a lot of items in it — it is a statistical outlier, a week whose load score sits at least one standard deviation above the mean of your loaded weeks and that holds at least two items. Move one exam and a week can stop being flagged while the week you moved it into starts.",
          "On a manually maintained board, moving a card moves a card. The reminder, the calendar entry, the study time you had blocked out, and your sense of which week is the bad one are all only as current as the last time you updated them yourself, unless you built an automation to do it, and then you own that automation for the rest of the term."
        ]
      },
      {
        "heading": "Grades, weights, and study time are the same data",
        "body": [
          "When the scanner reads a syllabus it pulls the percentage weight attached to each item and the letter-grade scale for the course. That single number then does two different jobs, which is why the grade side and the planning side of Semora stay consistent with each other.",
          "On the grade side, weights drive a weighted average against your course's own scale rather than a generic one. The \"What do I need?\" card (Pro) inverts that math: for every letter on that scale it computes the average you would have to hold across your remaining weight, and shows it as a plain answer — \"avg 84% on the rest,\" \"Locked in\" when the letter is already secured, \"Needs extra credit\" when it is reachable only by banking the ungraded extra credit still on the table, and \"Out of reach\" when it is not reachable at all. Base grade tracking with weighted averages is free, and so is the current-semester GPA estimate on the Courses tab; the forecast is the Pro layer on top.",
          "On the planning side, the same weight feeds a load score scaled by a per-type prep multiplier — exams count triple, projects two and a half, quizzes one and a half, assignments slightly above a reading. That is why an exam with no weight recorded still reads as heavier than an unweighted reading, and it is the signal behind both the crunch-week flags and the per-course ordering that tells you which class needs attention first.",
          "Academic Risk alerts (Pro) sit on top of both: a grade trending down, work that has gone missing, and a week that is overloaded, each returning a short recovery plan pointed at the specific task, plan, or course rather than a generic nudge."
        ]
      },
      {
        "heading": "What to check before committing a semester to any planner",
        "body": [
          "Whatever you choose, week nine is a bad time to discover a limitation. Four questions are worth putting to any tool before you move a semester into it. Does it understand that a term has a start and an end, or is it an infinite list? Can it tell you a grade, or only a date? Can you get your data back out in a format something else can read? And when you stop paying, what happens to what you already put in?",
          "Semora's answers, for the record: semester start and end dates come out of the syllabus itself and bound the term, which is what makes the outside-the-term date warning possible in the first place, and what makes the one-semester free limit a real boundary rather than a paperwork detail. Grade tracking and the semester GPA estimate are on the free tier, not behind the paywall. On the way out, Pro includes device calendar sync on iPhone and iPad , it does not run in a browser, plus an .ics export that works with Google Calendar or Outlook, and a CSV export of the semester report with a browser print view for carrying a clean grade summary into an advising meeting. Courses and tasks created or edited without a connection queue locally and flush with exponential backoff when you are back online, rather than vanishing.",
          "Pricing shape is worth a look too, and it is where these two products stop being comparable. A team workspace prices around collaborators and seats (Taskade's own pricing page lists Pro at $10/month billed annually, Business at $25, and Max at $100) which is a reasonable structure for a company and an odd one for a single student. Semora Pro is $3.99/month or $19.99/year, which works out to about $1.67 a month annually. It is bought either with a card on the web at app.semoraai.com, processed by Stripe, or inside the iOS app through the App Store, and the entitlement applies to your whole account, so the same login is Pro in the browser too.",
          "One last thing to budget honestly: assume you are paying from day one, and let the free tier carry you until you actually need something in Pro. There is no promo code to chase, and you can pay whichever way suits you: a card on the web, handled by Stripe, or the App Store on iPhone or iPad, where Restore Purchases re-attaches it if you change devices. Either way, signing in anywhere else simply re-reads the entitlement your account already has. In practice the moment free stops being enough is specific and predictable: your second syllabus scan, a fifth course, the first permitted LMS import you choose to use, hosting a Course Space instead of joining one, or the day you try to start your second semester."
        ]
      }
    ],
    "faq": [
      {
        "question": "If a professor moves a deadline, what updates automatically in Semora?",
        "answer": "Editing the due date cancels the reminders already scheduled for that task and re-schedules them against the new date and time — same-day reminders on the free tier, and your custom 1-day and 3-day timing plus quiet hours if you are on Pro. If device calendar sync is on (Pro, on iPhone or iPad — it does not run in a browser), the existing calendar event is updated in place instead of duplicated, and the study blocks tied to that task are invalidated. Open Smart Plan (Pro) and it rebuilds from today forward, keeping completed sessions and carrying unfinished work along. The workload dashboard re-derives its crunch weeks from the new dates."
      },
      {
        "question": "Can I get Canvas assignments into Semora without paying?",
        "answer": "Not through the direct connection — Canvas, Blackboard, and Moodle import is a Pro feature, and the current Canvas connector uses a personal access token that should be used only where your institution permits it. The free path is real, though it is a single shot: open your assignment list in Canvas, copy the text, and paste it into the scanner on the web, which accepts 20 to 60,000 characters. It runs the same extraction as a PDF and lands on the same review screen, where you confirm dates before anything is saved, and it spends the one AI action a free account gets."
      },
      {
        "question": "Is four courses enough on the free plan?",
        "answer": "For a single semester, usually yes: four course slots with unlimited tasks and deadlines inside them covers a standard full-time load. What free gives you only once is the AI — one action for the lifetime of the account, spent on a syllabus scan, a lecture recording, or turning a document into notes — so the other three courses are set up by hand, and nothing resets to give you a second go. The other limit people hit is the semester: a free account supports one in total, enforced by a database trigger, so the free tier covers this term and not the next. Pro lifts all of it: unlimited scans, unlimited courses, and unlimited semesters, with a fair-use ceiling of 20 scans a day."
      },
      {
        "question": "Can I share a course with classmates the way I'd share a team workspace?",
        "answer": "Semora's version is Course Spaces, scoped to a single course rather than a whole workspace. You invite classmates with a link, and shared deadlines and group assignments sync in near real time across everyone's iPhone, iPad, and web. The split is worth knowing before you plan around it: hosting your own space is a Pro feature, and joining a space someone else hosts is free and always will be."
      }
    ]
  },
  "studley-ai": {
    "extraSections": [
      {
        "heading": "Syllabus-first and materials-first are different starting points",
        "body": [
          "The mechanical difference is what you hand the app and what it hands back. Semora takes one document per course, the syllabus, and returns structured records: course name and code, instructor, class meeting blocks with days, start and end times, kind and room, office hours, semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading with a due date, due time, percentage weight, and a confidence score. A materials-first app takes a chunk of content and returns study objects built from that content. Studley AI sits squarely in that second group: uploaded PDFs, lecture slides, YouTube videos, article links, or a photo of handwritten notes become flashcards, multiple-choice quizzes, fill-in-the-blank and written-response exercises, an AI tutor scoped to that material, and AI-narrated audio, with progress tracked across four mastery levels.",
          "That difference decides what each app can answer. A syllabus-first tool answers what is due, when, and how much it is worth, across every course at once. A materials-first tool answers help me learn this specific pile of material. Neither answer substitutes for the other, which is why the two categories tend to coexist on the same phone rather than replace each other.",
          "Semora also splits the write into two stages on purpose. The course itself, its meeting times, and its grading scale are saved as soon as the scan finishes, because those are low-risk and you want them there. Only the deadlines wait for your approval. The review screen shows every extracted item with per-item editing: anything the model scored below 0.8 confidence is badged \"Low confidence — please verify,\" a dated item falling outside the semester window is badged \"Date looks outside this term — double-check,\" and undated items like \"Final exam — date TBA\" sit in a separate \"Needs a date\" section, deselected, so they cannot quietly land on the wrong day. Saving is all-or-nothing: one batch insert, and if it fails you stay on the screen with your selections intact."
        ]
      },
      {
        "heading": "What happens when a due date moves",
        "body": [
          "Professors move dates. This is the part that separates a planner you keep from one you abandon in week six, because the cost of a schedule change has to be one edit rather than a re-import. In Semora, changing a task's due date cancels that task's existing reminders and reschedules them against the new date and time. If device calendar sync is on (Pro), the calendar event is updated in place through a stable task-to-event map rather than a duplicate being created, and if you had deleted that event by hand, the update fails and a fresh one is written instead.",
          "Grades recompute rather than sit stale, because a course grade is calculated from the current task list at read time: weighted categories, drop-lowest rules, points earned over points possible, and your extra-credit policy all resolve on the fly. The workload dashboard re-buckets by ISO week using a load score of grade weight times a per-type multiplier, so an exam still reads as a heavier week than a reading even when the syllabus put a percentage on neither.",
          "Smart Plan (Pro) replans over a rolling 14-day horizon against your own settings: daily study minutes, session length, separate weekday and weekend start times, whether weekends count at all, and whether to route around your class meetings and calendar. With auto-reschedule on, a moved deadline reshuffles the plan without you touching it. Edits made offline queue locally, flush with exponential backoff when you reconnect, and reschedule reminders afterward, so a date change typed on the bus is not lost."
        ]
      },
      {
        "heading": "What the free tier actually covers for a real course load",
        "body": [
          "Free is one AI action for the lifetime of the account and up to 4 courses within one semester, with one semester total and no credit card. That action is yours to spend on whatever you reach for first — a syllabus scan, a lecture recording, or turning a document into notes — and nothing resets it afterwards. Run that against a normal load: one syllabus goes through the scanner and the other three courses are entered by hand into the remaining slots, with unlimited tasks and deadlines inside them. Spend it on the worst document you have, because a multi-page photo scan counts as one scan, not one per page, up to 5 pages and roughly 10 MB combined, so a dense four-page syllabus still costs the same single action. Re-scanning a course you already created does not consume a new course slot either.",
          "Inside those limits the free tier is not a demo. You get the unified deadline list across every course, tasks and subtasks, weighted grade tracking against the letter scale your own syllabus specified, same-day reminders, and the ability to join a Course Space a classmate invites you to. Joining a shared course is free and stays free; it is hosting one that requires Pro.",
          "Pro at $3.99/month or $19.99/year is where the rest lives: unlimited scans and courses, Canvas, Blackboard, and Moodle import, hosting your own Course Space, Smart Plan, the workload dashboard, flashcards, the focus timer, the AI tutor, grade scale and forecasting, device calendar sync with .ics export, 1-day and 3-day reminder timing with quiet hours, academic-risk alerts, and Progress Insights with CSV export and a print view on web. The current Canvas connector uses a personal access token and should be used only where the institution permits it. If it is unavailable or not permitted, or you are on the free tier, copy assignment text out of a Canvas page and paste it into the scanner on web, anywhere from 20 to 60,000 characters; on free, that paste spends your one AI action."
        ]
      },
      {
        "heading": "Where the two categories overlap, and where they don't",
        "body": [
          "Semora Pro does generate flashcards, so the overlap is real, but the input differs. Semora's cards are built from that course's own syllabus topics plus any lecture notes you upload to the course as a PDF or image, extracted server-side, and a deck can be scoped to a single exam or quiz instead of the whole course. The generator deliberately skips administrative content (office hours, grading policy, late-work rules) because none of that is quizzable. The AI tutor is grounded on the same syllabus-plus-notes material.",
          "What Semora does not do is accept the wider range of inputs a materials-first app is built for. Studley AI's public materials describe YouTube videos and article links as valid uploads, a \"Solve\" feature that gives step-by-step help from a photo of a homework problem, and AI-narrated podcast-style audio. Semora has none of those. Going the other direction, no syllabus parsing or deadline extraction appears in Studley AI's public materials, and no LMS integration is described there.",
          "The honest read is that these are complements more often than alternatives. If you already have a study-set app you like, adding a syllabus-first planner does not duplicate it. If you already have a planner, a study-set app does not replace the deadline and grade layer underneath it. The question is which half you are missing, not which app wins."
        ]
      },
      {
        "heading": "What to check before you commit a semester to any planner",
        "body": [
          "Five things are worth checking on any app in this space before your semester depends on it, whichever one you pick. First, does it show you the extraction before it commits it? An AI that writes forty due dates straight into your calendar with no review step is one bad date away from a missed final. Second, is the free tier permanent or trial-shaped? A tier that expires after a couple of weeks is a discount, not a free plan.",
          "Third, can you get your data back out? In Semora that means CSV export and a print view for grade reports on the web, plus .ics export for deadlines, both on Pro. Fourth, does anything depend on your school? Yes. LMS import is a Pro feature, and the current Canvas connector uses a personal access token that should be used only where your institution permits it. If it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
          "Fifth, check the devices honestly. Semora is one universal iOS app for iPhone and iPad plus a web app, sharing a single account with near real-time sync; there is no Android app and no Mac app, and browser notifications fire only while a tab is open. Pro is purchased either with a card on the web through Stripe or in the iOS app through the App Store, and applies account-wide either way, so a student who only ever uses the browser can subscribe right there and still be Pro if an iPhone turns up later."
        ]
      }
    ],
    "faq": [
      {
        "question": "What happens in Semora when a professor pushes a due date back?",
        "answer": "You change the date on the task and everything downstream follows from that one edit. Semora cancels that task's existing reminders and reschedules them against the new date and time, and if device calendar sync is on it updates the same calendar event in place instead of leaving a duplicate behind. Your course grade recalculates from the current task list, the workload dashboard re-buckets that week, and Smart Plan replans its 14-day horizon when auto-reschedule is on."
      },
      {
        "question": "Does Semora generate flashcards from course material the way Studley AI does?",
        "answer": "Semora Pro includes flashcards with spaced repetition, but they are built from your course's syllabus topics and any lecture notes you upload to that course as a PDF or image, and a deck can be scoped to one exam or quiz rather than the whole course. It skips administrative content like office hours and late-work policy. Studley AI's materials describe a wider input range, including YouTube videos and article links, which Semora does not accept."
      },
      {
        "question": "Can I use Semora and Studley AI at the same time?",
        "answer": "Yes, and for a lot of students that is the sensible setup, because they solve different halves of the problem. Semora turns your syllabi into one deadline list, a weighted gradebook, and a class schedule across all your courses. Studley AI turns a specific pile of material into flashcards, quizzes, and study aids. No syllabus parsing or deadline extraction appears in Studley AI's public materials, so neither app makes the other redundant."
      },
      {
        "question": "Does a multi-page syllabus use up more than one scan?",
        "answer": "No. A photo scan can cover up to 5 pages and roughly 10 MB combined, and the whole thing counts as one scan — which on free is the single AI action the account gets, however many pages it covers. The same holds for a PDF upload, a drag-and-drop on web, or pasted text. Re-scanning a course you already created also does not use a new course slot, so a syllabus corrected in week two costs you a scan but not a course."
      }
    ]
  },
  "myhomework": {
    "extraSections": [
      {
        "heading": "Where the deadlines actually come from",
        "body": [
          "Every planner has to answer one question before it is useful: how do the dates get in. There are really only three answers. You type them in yourself, you pull whatever your school posted to its LMS, or something reads the syllabus. The comparison above covers the first two — myHomework is built around manual entry of classes and assignments, with an import from a supported LMS as the shortcut. Semora is built around the third.",
          "In practice that means four import paths. You can photograph the syllabus with your camera, up to 5 pages per scan and about 10 MB of images combined. You can upload the PDF. On the web you can drag the file onto the page, or paste raw text — anywhere from 20 to 60,000 characters — straight out of a PDF viewer or an LMS page. Luna reads whichever one you give it and returns structured fields: course name and code, instructor, class meeting blocks with days, start and end times, kind and room, office hours, semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project and reading with its due date, due time, percentage weight and a confidence score.",
          "Nothing lands silently. The course itself, its meeting times and its grading scale are written before you review; only the deadlines wait for your approval. On the review screen every extracted item is editable one by one. Anything the model scored under 0.8 confidence is badged \"Low confidence — please verify.\" Anything dated outside the term you just imported is badged \"Date looks outside this term — double-check.\" Items the syllabus listed without a date, the \"Final exam — TBA\" cases, land in their own \"Needs a date\" section, deselected, and cannot be saved until you set a date on them.",
          "The point is not that extraction is never wrong. The point is which direction you work in. Reviewing a filled-in list and correcting three rows is a different task from typing thirty rows from scratch, and it is also different from an LMS pull, which can only ever be as complete as what your instructor actually uploaded to the LMS. Weekly readings and percentage weights very often live only in the syllabus PDF."
        ]
      },
      {
        "heading": "What the free tier covers for a real course load",
        "body": [
          "Semora's free plan is not a countdown, but it does have a shape worth knowing before you commit. It gives you one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or turning a document into notes, whichever you reach for first, with nothing resetting afterwards — and up to 4 courses, inside one semester. That last part is the boundary: a free account supports one semester total, not one per term. Everything inside that semester is generous. Tasks and deadlines are unlimited. Grade tracking with weighted averages is included, not held back , you enter scores and your course grade recalculates, and your semester GPA sits on the courses screen for free as well. Same-day reminders are included. Joining a Course Space a classmate invites you to is free and always will be. No credit card is involved anywhere in that.",
          "Do the arithmetic against a real semester. A standard four-course load is one scanned syllabus and three courses typed in, because the AI action is gone once you use it and no new one arrives next month; re-scanning a course you already created does not consume a new course slot, so on Pro that path stays open even when you are sitting at the 4-course cap. What the free tier does not do is roll into a second term. Starting a new semester — spring after fall, or a summer session running alongside spring — requires Pro, and the limit is enforced by the database on insert, not just by the app, so there is no way to slip around it. Plan on the free tier as one full semester, start to finish, rather than as something you renew every August.",
          "What is genuinely gated, then, is repeat AI use, the next semester, and the automation layer. Pro at $3.99 a month or $19.99 a year makes courses and semesters unlimited and takes the ceiling off scanning (there is still a fair-use limit of 20 scans in a day, which no normal course load comes near) and adds Canvas, Blackboard and Moodle import subject to school policy and platform configuration, hosting your own Course Space, Smart Plan, the Workload dashboard, Flashcards, a Focus timer, the AI Tutor, Grade Scale and Forecasting, device calendar sync with .ics export, custom reminder timing at 1 or 3 days out with quiet hours, Academic Risk alerts, Progress Insights, and Share and Streaks. Annual works out to about $1.67 a month, roughly 58% below monthly.",
          "Semora's current Canvas connector uses a personal access token you generate in Canvas. If you are on the free plan, or if your institution disables or prohibits third-party token use, open your Canvas assignments page, select the list, and paste it into the scanner on the web. You get the same extraction and the same review screen without the Pro LMS connection, though it still counts as an AI action, so on free it is the one you get."
        ]
      },
      {
        "heading": "What happens the week a due date moves",
        "body": [
          "Every semester an exam slides a week or a paper gets pushed past a holiday. This is where a planner either holds together or quietly rots, because the due date is never the only thing that has to change.",
          "Change a date in Semora and the edit propagates in one pass. Device reminders for that task are cancelled and re-scheduled against the new date. If the task repeats, Semora asks first (this occurrence only, this and every future one, or the entire series) and reschedules the reminders for whichever you pick, so a shifted weekly lab does not leave stale alerts behind on every later week. (The series options need a connection; editing a whole recurring series offline is refused outright rather than half-applied.) If calendar sync is on, the existing calendar event is updated in place rather than duplicated. The cached study blocks are invalidated, so your plan is stale for exactly as long as it takes you to open it.",
          "With auto-reschedule on — it is the default, and a toggle on the planner screen — opening Smart Plan is the reschedule. Completed study sessions stay in your history; every unfinished block is rebuilt from today forward against the current tasks, your settings and your class meeting times, across a rolling 14-day horizon. The rebuild is deterministic and idempotent, so running it again does not duplicate anything, and missed sessions roll forward instead of piling up behind you. Turn auto-reschedule off and nothing regenerates on open — the rebuild waits for the \"Save & rebuild plan\" button instead. Defaults are 90 minutes a day in 45-minute sessions, starting at 5pm on weekdays and 10am on weekends, avoiding your class blocks and, if you want, your calendar events. All of that is Pro.",
          "The workload picture and the risk report recompute from the same underlying data, so a moved exam changes which week is flagged as your crunch week without you touching anything else. In any planner where a due date is only text in a list, moving the date is the easy part — it is the reminder, the calendar entry and the study time you had already blocked out that get left behind."
        ]
      },
      {
        "heading": "How grades, deadlines and study time connect",
        "body": [
          "The scan gives Semora three things a to-do list does not have: what each item is worth, what type it is, and what letter scale your professor uses. Everything downstream runs on those.",
          "Grades first. Each course carries its own scale, taken from the syllabus and editable on Pro. You can set up weighted categories, drop-lowest rules and an extra-credit policy, and enter a score either as a percentage or as points earned over points possible. The weighted average is computed over the weight you have actually attempted, so a 94% in week three reads as a 94% rather than being dragged toward zero by work that is not due yet. On Pro, a what-if card answers the question everyone actually asks — what do I need on the final — using the weights the scan already pulled out of the syllabus.",
          "Study time next. Semora scores each task as its grade weight multiplied by a type factor: exams count triple, projects 2.5x, quizzes 1.5x, assignments 1.2x, readings 1x. That is why an exam with no listed percentage still outranks a reading with none. The same score drives the Workload dashboard's crunch-week view and the order in which Smart Plan fills your sessions, which is the difference between knowing a week is heavy and knowing what to start on Tuesday night.",
          "Risk last. Academic Risk alerts watch three specific things (a grade trending down, work that went past due unfinished, and a week carrying more load than you can absorb) and attach concrete recovery steps rather than a red badge. Progress Insights adds trend charts, a CSV export you can pull from the iPhone or iPad app as well as from the web, and a printable report, which is the one piece that is web-only because there is no print concept on iOS."
        ]
      },
      {
        "heading": "What to check before you commit a semester to any planner",
        "body": [
          "Time the entry step against your own course load, not against a demo. Four syllabi is somewhere between thirty and sixty rows of assignments, weights and dates. Whatever tool you pick, the honest question is how many minutes of typing stand between installing it and having your actual semester in it, and how likely you are to still be doing that typing in week six.",
          "Then ask what the free plan actually is, and read where it stops rather than where it starts. Semora's is a full semester of real use (4 courses, one AI action for the life of the account, unlimited tasks and deadlines, weighted grades and semester GPA) and it stops at the edge of that semester, because the second term needs Pro. Knowing the boundary up front is the difference between a plan and a surprise in January. Check the renewal price, not the first price, and check where the purchase lives. Semora Pro is bought either with a card on the web at app.semoraai.com, processed by Stripe, or inside the iOS app as an App Store subscription, and either one applies account-wide, including on the web app. A card subscription is cancelled from Settings inside Semora, under \"Manage Semora Plan,\" which opens Stripe's billing portal; an App Store subscription is cancelled through your Apple ID settings, at least 24 hours before the period ends.",
          "Check what happens on change day, and check the exits. Semora exports your deadlines and class meetings as a standard .ics file, and your semester grade report as CSV from the iPhone, iPad or web app, with a printable version on the web — all Pro, so your semester is not trapped. And be honest about hardware: Semora is one universal iOS app for iPhone and iPad plus a web app that runs in any modern browser, sharing one account with near real-time sync. If what you need is a native Windows, Mac or Android client, weigh that against the automation you would be giving up."
        ]
      }
    ],
    "faq": [
      {
        "question": "What happens in Semora if my professor pushes a due date back?",
        "answer": "You change the date once and the rest follows. Semora cancels and re-schedules that task's device reminders against the new date; if the task repeats, it asks whether to apply the change to that occurrence only, to this and every future one, or to the whole series, and reschedules the reminders to match your choice. If calendar sync is on, it updates the existing calendar event in place instead of creating a second one. Your study blocks are invalidated, so with auto-reschedule on — the default — the next time you open Smart Plan it rebuilds every unfinished session from today forward, and the workload and risk views recompute on the same data."
      },
      {
        "question": "How much AI does the free plan include?",
        "answer": "One action, once. A free account gets a single AI action for its lifetime, and you decide what it goes on — scanning a syllabus, recording a lecture, or turning a document into notes. It is not a monthly allowance and nothing resets it, so spend it on the syllabus that would take longest to type. Everything else on free keeps working without it: 4 courses within a single semester, unlimited tasks and deadlines, weighted grades and semester GPA. Starting a second semester requires Pro, as does a second AI action. Pro removes the course and semester limits and the scan cap, subject only to a fair-use ceiling of 20 scans in a day."
      },
      {
        "question": "Can I use Semora on a Windows laptop or an Android phone?",
        "answer": "Through the browser, yes. Semora is one universal iOS app for iPhone and iPad plus a full web app that runs in any modern browser on Windows, Mac, Chromebook or Android, all on one account with near real-time sync. What you do not get is a native desktop or Android client, and browser notifications only fire while a tab is open — device calendar sync is an app feature and does not run in a browser. Pro is not iPhone-only either: you can pay with a card in the browser through Stripe, or in the iOS app through the App Store, and the subscription covers the whole account whichever way you buy it."
      },
      {
        "question": "Can I get my semester back out of Semora?",
        "answer": "Yes, on Pro. Deadlines and class meetings export as a standard .ics file that imports into Apple Calendar, Google Calendar or Outlook, and the semester grade report exports as CSV from the iPhone or iPad app as well as from the web, with a printable version on the web app. Device calendar sync writes your deadlines into the calendar you already use on your phone, so they keep showing up alongside everything else in your life even when Semora is not open."
      }
    ]
  }
};

export function getCompareExtra(slug: string): CompareExtra | undefined {
  return COMPARE_EXTRA[slug];
}
