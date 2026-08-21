/**
 * Content for the tool, alternative and about pages.
 *
 * Same contract as the other content modules: written against the shipping
 * source, adversarially fact-checked, corrections applied. Do not change a
 * number or a tier here without re-verifying it in the app.
 */
export interface NewPageSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  /**
   * An optional comparison table, rendered under the bullets by LongFormPage.
   *
   * The English blog posts are MDX and can import <BlogTable /> directly. The
   * Spanish ones are data, rendered through this shell, so without a slot here
   * a table could only ever exist in one of the two locales — and EN/ES are
   * meant to carry identical information.
   */
  table?: {
    columns: string[];
    rows: string[][];
    caption?: string;
    highlightColumn?: number;
  };
}

export interface NewPageSource {
  label: string;
  href: string;
}

export interface NewPage {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  intro: string[];
  sections: NewPageSection[];
  /** Optional note displayed with the article's visible source list. */
  sourceNote?: string;
  sources?: NewPageSource[];
  faq: { question: string; answer: string }[];
}

export type NewPageKey =
  | 'gpa-calculator'
  | 'pomodoro-timer'
  | 'myhomework-alternative'
  | 'shovel-alternative'
  | 'studyfetch-alternative'
  | 'dormway-alternative'
  | 'mindgrasp-alternative'
  | 'assignment-tracker-app'
  | 'blackboard-assignment-tracker'
  | 'ai-flashcard-generator'
  | 'ai-tutor-for-college-students'
  | 'about';

export const NEW_PAGES: Partial<Record<NewPageKey, NewPage>> =
{
  "ai-flashcard-generator": {
    "metaTitle": "AI Flashcard Generator From Your Syllabus and Notes",
    "metaDescription": "Generate a flashcard deck from a course's own syllabus and lecture notes, focused on one exam if you want, then review it on a spaced-repetition schedule.",
    "h1": "An AI Flashcard Generator That Already Has Your Material",
    "lede": "Most generators ask you to paste something in. This one builds from the syllabus and lecture notes already attached to the course, and can focus a deck on one specific exam you are tracking.",
    "intro": [
      "The tedious part of flashcards has never been the reviewing. It is the making \u2014 reading back through a chapter deciding what deserves a card, then typing both sides, at exactly the moment you least want another task.",
      "AI generators fix the typing and usually introduce a new chore in its place: finding the source material, pasting it in, doing it again for the next chapter. If the tool has no memory of your course, every deck starts from nothing.",
      "This page describes a generator with the opposite starting position \u2014 one that already holds the course's syllabus and your uploaded notes \u2014 what it does with that material, exactly how much of it it reads, and how the review schedule decides what to put in front of you."
    ],
    "sections": [
      {
        "heading": "What the deck is actually built from",
        "paragraphs": [
          "When you generate, the request carries the course's own material rather than whatever you happened to paste. Three sources go in.",
          "The most recent syllabus parse for that course: up to 60 extracted items, each as its title and type, trimmed to 8,000 characters. That is what gives a deck the shape of the course \u2014 its topics, its units, what the instructor said it would cover.",
          "Up to the 10 most recently uploaded note files for that course, sharing a combined 24,000-character budget of extracted text, each labelled with its filename. Notes are read newest first, on the reasonable assumption that recent material is what you are studying.",
          "And a list built from the course's other tracked tasks \u2014 up to 60 of them, ordered by date \u2014 so the generator knows what the term contains around the thing you are studying."
        ],
        "bullets": [
          "Syllabus: up to 60 items, 8,000 characters",
          "Notes: 10 newest files, sharing 24,000 characters of extracted text",
          "Tracked tasks: up to 60, ordered by date"
        ]
      },
      {
        "heading": "Focusing a deck on one exam instead of the whole course",
        "paragraphs": [
          "The generate panel asks two things and then confirms. The first is what to focus on: the whole course, or one specific item you are already tracking as a deadline.",
          "That second option is the one that earns its place. A deck generated for the whole course is diluted by definition \u2014 a midterm review that includes material from finals is a worse deck for the midterm, no matter how good the individual cards are. Pointing it at a tracked exam narrows the source material to what that exam is about.",
          "It works because the exams are already in the app as real dated items with types, extracted from the syllabus. A generator with no knowledge of your term cannot offer this, because it has no idea what your midterm covers or when it is."
        ]
      },
      {
        "heading": "Adding a review packet the instructor handed out",
        "paragraphs": [
          "The second question in the panel is optional study material: attach a PDF or a photo and it becomes part of what the deck is generated from, alongside the syllabus and notes.",
          "This is the highest-signal input available, and it is worth using when it exists. A review sheet is the instructor telling you what the exam covers, in their own words, with their own emphasis.",
          "The file goes to a private storage bucket, filed under your own user ID. Nothing is parsed on your phone: the first time a generation or a tutor request needs that file, the server reads it, extracts the readable text while preserving structure, and caches the result."
        ]
      },
      {
        "heading": "What comes back, and what gets thrown away",
        "paragraphs": [
          "The shape of the output is fixed rather than left to the model. The front is a short question or a term. The back is a concise answer or definition, one to three sentences.",
          "The target is between 10 and 20 cards, with an explicit instruction that fewer good cards beat padding \u2014 if the material genuinely does not support twenty, it should not invent them.",
          "Then everything is validated before it is saved. Both faces are trimmed and each is capped at 300 characters. Any entry missing a front or a back is dropped rather than failing the whole batch, so if fourteen of sixteen came back clean you get the fourteen. No more than 30 cards are inserted from a single run.",
          "The 300-character cap is a defensive clamp on model output specifically. Cards you type yourself are not truncated."
        ]
      },
      {
        "heading": "The review schedule, in actual numbers",
        "paragraphs": [
          "Every card carries four values: an ease factor, an interval in days, a due date, and a count of consecutive successes. A brand-new card starts at ease 2.5, interval 0, due now \u2014 so anything you generate is due in your very next session, with no waiting.",
          "Grading a revealed card runs a compact SM-2 variant. Again drops ease by 0.20, resets the success count, and brings the card back in about ten minutes rather than tomorrow. Hard drops ease by 0.15; a new card graduates to one day, an established one gets its interval multiplied by 1.2. Good is the standard ladder: one day, then six, then multiplied by the card's own ease. Easy raises ease by 0.15 and multiplies by that ease plus a further 1.3 bonus, so a new card graded Easy jumps straight to six days.",
          "Ease is floored at 1.3 \u2014 the SM-2 floor \u2014 both in the scheduler and by a database constraint, so a bad week of Again and Hard cannot drive a card into a permanent loop.",
          "In practice a card you keep getting right goes one day, then six, then fifteen, then about thirty-eight, then roughly three months. A card you keep missing stays in front of you."
        ],
        "bullets": [
          "New card: ease 2.5, due immediately",
          "Again \u2248 10 minutes; Good ladder 1 day \u2192 6 days \u2192 \u00d7 ease",
          "Easy multiplies by ease and a further 1.3",
          "Ease never falls below 1.3"
        ]
      },
      {
        "heading": "A session, and cards you write yourself",
        "paragraphs": [
          "Starting a session snapshots the due queue at that moment. Grading a card pushes its due date forward, and without the snapshot the list would reshuffle underneath you mid-session. A counter shows your position, like 4 / 12, with an exit beside it.",
          "Generation is entirely optional. New Deck creates an empty deck with a title of up to 80 characters, scoped to the course you came from or left uncategorized if you opened Flashcards on its own. Add Card gives you two multi-line fields, front and back, both required \u2014 a card with a blank side is not saved.",
          "Hand-written and generated cards live in the same deck and are scheduled by the same algorithm. There is no second-class citizen here."
        ]
      },
      {
        "heading": "What it costs and when to use something else",
        "paragraphs": [
          "Flashcards are part of Pro, at $3.99 a month or $19.99 a year \u2014 about $1.67 a month annually \u2014 bought with a card on the web or inside the iOS app, and applied account-wide across iPhone, iPad and the browser.",
          "The honest limitation is the source material. This generator is strong when a course has a scanned syllabus and uploaded notes, and weak when it has neither, because there is nothing to build from. If you want to turn an arbitrary PDF or a YouTube lecture into a deck with no course attached, a general-purpose generator is a better fit and you should use one.",
          "It is also not a shared deck library. There is no browsing other students' decks; everything here is generated from your own course's material or written by you."
        ]
      },
    ],
    "faq": [
      {
        "question": "Do I need to upload anything to generate a deck?",
        "answer": "Not if the course has a scanned syllabus \u2014 that alone is enough to generate from. Uploaded lecture notes and an attached review packet make the deck sharper, and a course with none of the three has nothing to build from."
      },
      {
        "question": "How many cards will it make?",
        "answer": "It targets 10 to 20, with an instruction that fewer good cards beat padding, and inserts no more than 30 from a single run. Cards missing a front or back are dropped rather than failing the batch."
      },
      {
        "question": "Can I generate a deck for just my midterm?",
        "answer": "Yes. The generate panel lets you focus on one specific item you are already tracking as a deadline, rather than the whole course, which is what keeps a midterm review from being diluted with material from finals."
      },
      {
        "question": "What spaced-repetition algorithm does it use?",
        "answer": "A compact SM-2 variant. New cards start at ease 2.5 and are due immediately; Again returns a card in about ten minutes, Good runs a one-day then six-day then multiply-by-ease ladder, and ease is floored at 1.3 so a bad week cannot trap a card."
      },
      {
        "question": "Are my own cards treated differently from generated ones?",
        "answer": "They share a deck and the same schedule. The one difference is the 300-character-per-side cap, which is a defensive clamp on model output \u2014 cards you type yourself are not truncated."
      },
      {
        "question": "Is the flashcard generator free?",
        "answer": "No, it is part of Pro at $3.99 a month or $19.99 a year. The free plan covers deadline tracking, weighted grade tracking and same-day reminders, plus one AI action for the life of the account — a syllabus scan, a lecture recording, or a document turned into notes."
      },
    ]
  },
  "ai-tutor-for-college-students": {
    "metaTitle": "AI Tutor for College Students, Grounded in Your Course",
    "metaDescription": "An AI tutor that answers from your own syllabus, tracked deadlines and uploaded lecture notes, cites what it used, and never invents a due date.",
    "h1": "An AI Tutor That Knows Which Course You Are In",
    "lede": "General chatbots explain concepts well and know nothing about your situation. This one is handed your syllabus, your tracked deadlines and your lecture notes before it sees the question.",
    "intro": [
      "Ask a general chatbot when your final is and it will either decline or, worse, guess plausibly. It does not know your professor said the midterm covers chapters one through six and not seven. It does not know your essay moved from the 14th to the 21st. The model is capable; it simply has no access to your term.",
      "That gap is not fixed by a better model. It is fixed by giving the model the right material before it answers, and by constraining what it is allowed to answer from.",
      "This page describes exactly what gets assembled before a question is sent, how deadline answers are handled differently from everything else, what the tutor deliberately does not know, and the real limits in numbers."
    ],
    "sections": [
      {
        "heading": "What gets assembled before it sees your question",
        "paragraphs": [
          "The server builds a packet of your real course material and instructs the model to answer from it. Four things go in.",
          "Your class meetings, labs and discussion sections included, since those are stored as their own meeting kinds. Your grading scale, as plain text \u2014 A at 93 percent and up, B at 83 and up, or whatever your school actually uses, if you have customized it.",
          "The structured items from your most recent syllabus scan: capped at 8,000 characters and up to 60 items. And your currently tracked deadlines: also capped at 8,000 characters and up to 60 tasks.",
          "Notes are read newest first \u2014 the 10 most recent files for that course, sharing a 24,000-character budget of extracted text. A syllabus or deadlines block that has to be cut is explicitly marked as truncated, so the model knows it is working from an abridged source rather than treating a partial list as complete."
        ],
        "bullets": [
          "Class meetings, including labs and discussion sections",
          "Your grading scale, customized cutoffs included",
          "Syllabus: 8,000 characters, up to 60 items",
          "Deadlines: 8,000 characters, up to 60 tasks",
          "Notes: 10 newest files, 24,000 characters shared"
        ]
      },
      {
        "heading": "Deadline answers come from your task list, not the model",
        "paragraphs": [
          "This is the constraint that matters most, because it is the one where a confident wrong answer does real damage.",
          "For questions about what is due and when, the tutor answers strictly from your actual tracked tasks. It does not reason its way to a date, and it does not fill a gap with something plausible. If the information is not in what you have given it, it says so plainly and offers general help instead of inventing a specific.",
          "It cites what it used in ordinary language rather than footnotes \u2014 \"your syllabus lists\u2026\", \"from your Week 3 notes\u2026\" \u2014 which is enough to tell you whether an answer came from your material or from general knowledge. That distinction is the whole point."
        ]
      },
      {
        "heading": "What it deliberately does not know",
        "paragraphs": [
          "The deadlines block carries titles, types, due dates, due times, weights, and whether you have checked something off. It does not carry your scores.",
          "So the tutor knows the final is worth 30 percent of your grade and that you have not done it yet. It does not know what you got on the midterm, and it cannot tell you what you need on the final \u2014 that is what the forecasting calculators in grade tracking are for.",
          "This is a design decision rather than an oversight, and it is worth knowing so you do not ask it a question it will answer badly. A tutor that had your scores could be more helpful and would also be holding more of your record than a chat feature needs."
        ]
      },
      {
        "heading": "Uploading lecture notes",
        "paragraphs": [
          "Notes attach to a course, so open the tutor from a course rather than on its own \u2014 if you have not, the app tells you to instead of accepting an orphan file. PDFs and photos both work.",
          "Extraction happens on the server, not on your phone. The file goes to a private storage bucket filed under your own user ID, and the first time a request needs it the server reads it, extracts the readable text preserving structure, and caches the result so the next question does not pay the cost again.",
          "One limit worth stating: a file over roughly 6 MB is skipped at extraction time rather than sent to the model. If a scanned lecture set is not showing up in answers, size is the first thing to check."
        ]
      },
      {
        "heading": "One thread per course, plus a general one",
        "paragraphs": [
          "Conversations are scoped to a course, which is what makes the grounding coherent \u2014 a thread for organic chemistry is not carrying context from your literature seminar.",
          "The last 12 messages of a conversation are replayed each turn, roughly six exchanges of working memory. That is enough to follow up on an explanation without the thread quietly dragging an hour of unrelated context into every request.",
          "There is also a general thread for questions that are not about a specific course, where it behaves like a competent general assistant with none of the course grounding."
        ]
      },
      {
        "heading": "The limits, in real numbers",
        "paragraphs": [
          "Fifty tutor messages per rolling 24 hours per account \u2014 rolling, not a reset at midnight \u2014 and 4,000 characters per message, enforced in the composer and checked again on the server.",
          "The model call goes to OpenAI GPT-5.6 Luna with low reasoning and an output ceiling of 2,048 tokens: enough for a worked explanation without inviting an essay. If the provider returns a retryable error the function backs off and retries up to three times, so you see one spinner rather than a failure.",
          "Replies are plain text by instruction \u2014 short paragraphs and bullets, no markdown headers \u2014 which is a deliberate trade. If what you want is a long formatted document, this is the wrong surface.",
          "The tutor is part of Pro, at $3.99 a month or $19.99 a year, bought with a card on the web or inside the iOS app, and applied account-wide either way."
        ],
        "bullets": [
          "50 messages per rolling 24 hours, per account",
          "4,000 characters per message",
          "12 previous messages replayed per turn",
          "Replies capped at 2,048 tokens, plain text"
        ]
      },
      {
        "heading": "Who this is genuinely for",
        "paragraphs": [
          "It is for the questions that need your context to answer: what does my syllabus say the exam covers, what did my Week 3 notes call this, what is actually due before Friday, how does my grading scale treat an 88.",
          "It is a poor fit if what you want is a general tutor for a subject you are studying outside a tracked course, because the grounding has nothing to work with. It is also a poor fit if you want long formatted output.",
          "And the same rule applies here as everywhere else in the app: it is worth exactly as much of your semester as you have entered. A course with a scanned syllabus, real deadlines and a few uploaded notes gets useful answers. An empty course gets a general chatbot."
        ]
      },
    ],
    "faq": [
      {
        "question": "Does the AI tutor know my actual due dates?",
        "answer": "Yes, and it answers those strictly from your tracked task list rather than from the model's own reasoning. It never invents a date, and if something is not in what you have given it, it says so instead of guessing."
      },
      {
        "question": "Does it know my grades?",
        "answer": "No. The deadlines it receives carry titles, types, dates, weights and completion status, but not your scores. For what you need on the final, use the forecasting calculators in grade tracking."
      },
      {
        "question": "How many questions can I ask?",
        "answer": "Fifty messages per rolling 24 hours per account, with a 4,000-character limit per message. The limit is rolling rather than resetting at midnight."
      },
      {
        "question": "Can it read my lecture notes?",
        "answer": "Yes, as PDFs or photos, attached to a course. The 10 most recent files per course are read newest first, sharing a 24,000-character budget of extracted text. Files over roughly 6 MB are skipped at extraction."
      },
      {
        "question": "Which model does it use?",
        "answer": "OpenAI GPT-5.6 Luna, with low reasoning and a 2,048-token output ceiling. Replies are plain text by instruction \u2014 short paragraphs and bullets rather than long formatted documents."
      },
      {
        "question": "Is the AI tutor free?",
        "answer": "No, it is part of Pro at $3.99 a month or $19.99 a year, bought with a card on the web or inside the iOS app, and applied to your whole account either way — iPhone, iPad and the web app."
      },
    ]
  },
  "assignment-tracker-app": {
    "metaTitle": "Assignment Tracker App for College Students",
    "metaDescription": "An assignment tracker that fills itself from your syllabus: every deadline, its weight, and a running grade. Free tier, no credit card, iPhone, iPad and web.",
    "h1": "An Assignment Tracker That Fills Itself In",
    "lede": "Most assignment trackers are an empty list you have to feed. This one reads your syllabus, extracts every deadline with its weight, and shows you what it found before saving anything.",
    "intro": [
      "Every assignment tracker does the same three things on paper: hold a list of what is due, sort it by date, and remind you. The difference between the ones people still use in November and the ones abandoned in week six is not the feature list. It is how the assignments get in.",
      "A tracker you fill by hand starts empty and stays accurate only as long as you keep feeding it. That is roughly an hour of typing at the start of every term, plus a correction every time an instructor moves a date. The maintenance costs more than the problem it solves, so it stops getting done, and a half-maintained tracker is worse than none because you trust it.",
      "This page is about what changes when the tracker fills itself from the document that already contains your term, what that makes possible downstream, and where it is honestly the wrong tool."
    ],
    "sections": [
      {
        "heading": "Three ways assignments get into a tracker",
        "paragraphs": [
          "Manual entry works everywhere and needs no setup. It is also the reason most planners get abandoned: it is recurring work with no end, and it competes with the actual coursework for the same hours.",
          "Learning-platform import removes that work when it is available. It mirrors what an instructor actually posts inside the platform, which is excellent when your courses are fully managed there \u2014 and silent about everything that is not. Weight percentages, exam dates, reading schedules and grading scales frequently never become platform entries.",
          "Syllabus extraction reads the document that already holds all of it. One scan per course, one review screen, and the term is in. It is the only one of the three that captures weights, which is what makes a grade calculation possible later."
        ],
        "bullets": [
          "Manual: works anywhere, costs an hour a term plus every correction",
          "Platform import: removes the typing, limited to what instructors post there",
          "Syllabus extraction: one pass per course, and the only route that captures weights"
        ]
      },
      {
        "heading": "What a scan actually puts in the list",
        "paragraphs": [
          "Photograph the syllabus, upload the PDF, drag it onto the web app, or paste the text. Ten to thirty seconds later you get the course and instructor, class meeting times and office hours, the semester's start and end dates, the grading scale, and every assignment, quiz, exam, project and reading it could find.",
          "Each item arrives with three things a hand-typed entry usually lacks: a due date, a due time if the syllabus stated one, and its weight toward the final grade. The weight is the part that matters most and the part nobody enters by hand, because typing twenty due dates is tedious but typing twenty weights alongside them is worse.",
          "Then it stops. Nothing is saved to your list until you look at what came out and approve it. Low-confidence extractions are flagged for you to check, dates falling outside the semester are called out, and items that arrived without a date are held separately rather than quietly assigned one."
        ]
      },
      {
        "heading": "Sorting by date is not the same as sorting by what matters",
        "paragraphs": [
          "A plain tracker sorts by due date, which is the correct default and an incomplete answer. Two items due Thursday are not equally urgent if one is a five-percent reading and the other is a quarter of your grade.",
          "Because the weights came off the syllabus, Semora can score each dated item as its weight multiplied by a per-type effort factor \u2014 an exam counts triple, a project 2.5, a quiz 1.5, an assignment 1.2, a reading 1. That is what turns a list into a workload view that can tell you a week is heavy before you are inside it.",
          "This is the practical payoff of capturing weights at intake. A tracker that only knows dates can only ever tell you what is next. One that knows weights can tell you what is worth your evening."
        ]
      },
      {
        "heading": "Reminders that are set for you",
        "paragraphs": [
          "Same-day reminders are scheduled automatically the moment you approve the extracted dates, on the free plan. There is no per-item reminder to configure, which matters because the reminders people configure by hand are the ones they stop configuring by week four.",
          "Pro adds one-day and three-day advance notice. The distinction is about the size of the work rather than a preference: for a short submission, a morning-of reminder is enough; for a project that needs six hours, learning about it that day changes nothing. Three days is the window where the information is still actionable.",
          "If a date moves and you edit it, the reminder moves with it. That sounds obvious and is one of the things worth actually testing in any tracker you are considering."
        ]
      },
      {
        "heading": "The tracker and the gradebook are the same data",
        "paragraphs": [
          "This is where an assignment tracker stops being a to-do list. Each item already carries its weight, so entering a score turns the same list into a running weighted average with no second screen to maintain.",
          "The arithmetic divides by the weight you have attempted rather than the full semester's weight, which is what keeps the figure honest in October. Three graded items covering 45 percent of the course produce a grade based on that 45 percent, and an unscored final worth 30 percent never drags the number toward zero.",
          "Categories work the way syllabi actually describe them \u2014 Homework 25 percent, Quizzes 15, Exams 45, Project 15 \u2014 with drop-lowest rules per category and letter grades from your course's scale. All of that is on the free plan."
        ],
        "bullets": [
          "Enter a score on a tracked item; the weighted average updates",
          "Divides by weight attempted, not weight total",
          "Categories, drop-lowest and letter grades included free"
        ]
      },
      {
        "heading": "What the free plan holds, precisely",
        "paragraphs": [
          "Full deadline and task tracking, with no cap on how many assignments a course holds. Grade tracking with weighted averages, complete. Same-day reminders. Joining a Course Space a classmate shares with you. And one AI action for the life of the account, spent on whichever you reach for first: a syllabus scan, a lecture recording, or a document turned into notes.",
          "The two limits are on courses and terms, and they behave differently. Four courses is a ceiling on how much of one term you can hold at once. One semester is a harder line \u2014 a free account cannot start a second term at all, so it does not roll over in January.",
          "Pro removes all three at $3.99 a month or $19.99 a year, bought with a card on the web or inside the iOS app and applied account-wide either way. But if you carry four courses or fewer in a single term and what you need is to stop missing deadlines and know your grade, the free plan does that job completely."
        ]
      },
      {
        "heading": "Where this is the wrong tool",
        "paragraphs": [
          "If every one of your courses is fully managed in your learning platform and your instructors post everything there with dates, platform import may be all you need, and that is a Pro feature subject to your institution's policy. Scanning would be solving a problem you do not have.",
          "If you want a general task manager for work, errands and coursework in one place, a tracker built around courses, semesters and grade weights will feel narrow. That narrowness is what makes the grade math possible, and it is a real trade.",
          "And this is not a submission tool. Turning work in and messaging instructors stays in your school's platform; this is the layer that tells you what is coming and what it is worth."
        ]
      },
    ],
    "faq": [
      {
        "question": "Do I have to scan anything to use it as a tracker?",
        "answer": "No. You can create a course by hand and add assignments, subtasks and scores yourself, and the calendar, the Today view, reminders and grade calculation all behave identically on hand-entered data. Scanning is a shortcut for the tedious part, not a requirement."
      },
      {
        "question": "Is there a limit on how many assignments I can track?",
        "answer": "No. The free plan's limits are on AI actions (one for the life of the account), courses (up to four within one semester) and terms (one total). A course can hold as many assignments as it actually has."
      },
      {
        "question": "Does it work on iPhone, iPad and the web?",
        "answer": "Yes, on one account and one database that sync in near real time. Pro can be bought with a card on the web or inside the iOS app, and either route applies account-wide, including the web app \u2014 you only ever pay once."
      },
      {
        "question": "What happens when an instructor moves a due date?",
        "answer": "Edit the item and the date, its reminder and its place in the workload scoring all move with it. If the date came from a learning-platform import, a re-sync updates the title and dates in place without touching anything you had already marked complete."
      },
      {
        "question": "Can I track assignments for a class that has no syllabus dates?",
        "answer": "Yes. Some courses only announce work in class. Scan what the syllabus does have \u2014 the course, the schedule, the grading scale \u2014 and add the assignments as they are announced. Nothing downstream cares whether an item arrived by scan or by hand."
      },
    ]
  },
  "blackboard-assignment-tracker": {
    "metaTitle": "Blackboard Assignment Tracker: Deadlines and Grades",
    "metaDescription": "Track Blackboard coursework with real reminders and weighted grades. Import on Pro where your institution permits it, or scan your syllabus free.",
    "h1": "A Blackboard Assignment Tracker With Reminders and a Real Grade",
    "lede": "Blackboard holds your coursework. It does not tell you that three items land in the same 48 hours, remind you the night before, or show what your grade does if you skip one.",
    "intro": [
      "Blackboard is where your instructors publish and where you submit. Those are the two jobs it is built for, and it does them. What it leaves to you is the synthesis: gathering several course pages into one list, ordering that list by what actually matters rather than by date alone, and knowing which item moves your grade.",
      "That synthesis is the work. It is also the work that gets skipped in a busy week, which is how three deadlines end up discovered together instead of separately.",
      "This page covers what a tracking layer on top of Blackboard adds, how importing works and when you should not use it, and what the free path covers for students whose institutions do not permit third-party connections."
    ],
    "sections": [
      {
        "heading": "What Blackboard gives you and what it leaves out",
        "paragraphs": [
          "Course pages, announcements, submission, and grades your instructor chooses to publish. Notifications exist, but they are built to tell you something changed in the platform rather than to prepare your week.",
          "The gaps that matter for planning are consistent across institutions. There is usually no single cross-course view ordered by urgency, no advance reminder you control, and no running weighted grade you can trust unless your instructor configured the gradebook carefully \u2014 and many do not.",
          "The grade point deserves emphasis. Whether a Blackboard grade means anything depends on whether categories and weights were set up, whether ungraded work counts as zero, and whether grades are published or hidden. Two courses in the same term routinely differ on all three."
        ]
      },
      {
        "heading": "Importing from Blackboard, and when not to",
        "paragraphs": [
          "Canvas import is free for everyone, with no limit on how many classes come across. Blackboard and Moodle import is a Pro feature. Setup varies meaningfully by institution: Blackboard deployments differ in version, configuration and what integrations the school allows.",
          "Before connecting anything, confirm your institution's policy on third-party access. Some schools permit it, some restrict it, and some prohibit it outright in their acceptable-use terms. If it is not permitted, do not connect \u2014 and you have not lost anything, because the syllabus path below covers the same job.",
          "This is stated plainly rather than buried because it is the honest position: the connector's availability is not entirely in the app's control, and a tracker that only works if your school cooperates is not a tracker you should have to gamble on."
        ],
        "bullets": [
          "Blackboard, Blackboard and Moodle import are part of Pro, while Canvas import is free",
          "Setup varies by institution and version",
          "Confirm your school's policy before connecting; if unclear, use the free path"
        ]
      },
      {
        "heading": "The syllabus path: scan it or paste the list",
        "paragraphs": [
          "The syllabus usually contains more of what you need for planning than the platform does. Weight percentages, exam dates, the reading schedule and the grading scale live there, and much of that never becomes a Blackboard entry.",
          "Photograph it, upload the PDF, drag it onto the web app, or paste the text \u2014 up to 60,000 characters, which is the fastest and most accurate route when you can select the syllabus text on a laptop. You get the course, instructor, meeting times, semester dates, grading scale, and every dated item with its weight.",
          "You can also paste a Blackboard assignment list straight into the same scanner. If you can select the text, it can be read, and no connection or token is involved.",
          "The free plan includes one AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand within one semester, one semester total, full deadline tracking, weighted grade tracking and same-day reminders."
        ]
      },
      {
        "heading": "Reminders you actually control",
        "paragraphs": [
          "Same-day reminders schedule themselves as soon as you approve the extracted dates, at no cost. Pro adds one-day and three-day advance notice.",
          "The reason to care about advance notice is the size of the work, not preference. A short discussion post is fine with a morning-of nudge. A paper that needs six hours is not \u2014 by the time you are reminded, the only available response is to start late.",
          "Because reminders are derived from the dates rather than configured per item, they survive the thing that kills hand-built reminder systems: nobody has to remember to set them."
        ]
      },
      {
        "heading": "A grade you can check against the syllabus",
        "paragraphs": [
          "Semora computes the weighted sum of your scores divided by the weight you have attempted, not by the full semester's weight. That keeps the number meaningful mid-term, when an ungraded final worth 30 percent would otherwise drag it toward zero.",
          "It supports the structure syllabi actually use: categories with their own percentages, drop-lowest rules per category from 0 to 20 that never remove your last remaining grade, three different extra-credit policies, and letter grades from your course's scale. All of that is on the free plan.",
          "Editing the letter cutoffs to match your institution's scale, and the what-if calculators that tell you what you need on the rest, are Pro."
        ]
      },
      {
        "heading": "What a re-sync will and will not touch",
        "paragraphs": [
          "If you do connect, the behaviour on refresh matters more than the behaviour on first import, because that is where trackers quietly corrupt a semester.",
          "A re-sync refreshes an item's title and dates in place. It does not touch your completion state, the scores you entered, or subtasks you added. Something you marked done stays done.",
          "That is the single most useful thing to test in any tool you are evaluating: move a date, re-sync, and check that the item updated rather than duplicating, that the reminder follows the new date, and that your completions survived."
        ]
      },
      {
        "heading": "Who should skip this",
        "paragraphs": [
          "If your instructors post everything to Blackboard with accurate dates and your institution publishes a weighted grade you check and trust, a tracking layer is redundant. Use the platform.",
          "If you need to submit work or message an instructor, that stays in Blackboard regardless. This is an organizing layer on top, not a replacement for the LMS.",
          "And if your institution prohibits third-party connections and you would rather not scan syllabi either, then the honest answer is that this is not for you \u2014 the value here depends on the data getting in by one route or the other."
        ]
      },
    ],
    "faq": [
      {
        "question": "Is Blackboard import free?",
        "answer": "No. Canvas import is free \u2014 no Pro, no token, no limit on classes. Blackboard and Moodle import is part of Pro at $3.99 a month or $19.99 a year. The free plan covers the same job from the syllabus side, including pasting a Blackboard assignment list into the scanner, within the one AI action a free account gets."
      },
      {
        "question": "Will connecting Blackboard work at my school?",
        "answer": "It depends on your institution. Blackboard deployments vary by version and configuration, and schools differ on whether they permit third-party access at all. Confirm your school's policy first, and use the syllabus path if it is not permitted."
      },
      {
        "question": "Can I use it without connecting anything?",
        "answer": "Yes, and most of the value does not require a connection. Scan the syllabus or paste your assignment list, and you get deadlines, weights, reminders and grade tracking. The tracking side is free for good; the scan itself is the one AI action a free account gets."
      },
      {
        "question": "Does it replace Blackboard?",
        "answer": "No. Submission, instructor messaging and course materials stay in Blackboard. Semora adds the cross-course deadline view, reminders you control, and a weighted grade calculated from the weights your syllabus states."
      },
      {
        "question": "Does it work on iPhone, iPad and the web?",
        "answer": "Yes, on one account that syncs across all three. Pro is bought with a card on the web or inside the iOS app, and applies to the whole account either way."
      },
    ]
  },
  "gpa-calculator": {
    "metaTitle": "Free GPA Calculator: Semester & Cumulative GPA",
    "metaDescription": "A free GPA calculator plus the math behind it: quality points, credit hours, semester vs cumulative GPA, plus/minus scales, and the GPA you need.",
    "h1": "GPA Calculator",
    "lede": "Work out a semester GPA, roll it into your cumulative, and see what this term has to look like to reach the number you want, plus the parts only your registrar can answer.",
    "intro": [
      "A GPA is a weighted average, and the weights are credit hours. That one sentence explains almost every surprising result students get from it: why a strong grade in a one-credit seminar barely moves the number, why a single rough four-credit semester follows you around for two years, and why averaging your fall and spring GPAs gives the wrong answer unless you happened to take the same number of credits in each.",
      "The calculator above handles the arithmetic. What follows is the reasoning behind it — the formula worked through with real numbers, the difference between a semester GPA and a cumulative one, how to figure out what this term has to look like to hit a target, and the handful of situations where no calculator can give you a correct answer because the answer is set by your school's policy rather than by math.",
      "Every number on this page uses the standard American 4.0 scale: A+ and A are worth 4.0, A- is 3.7, B+ is 3.3, B is 3.0, and so on down to F at 0. If your school does it differently, and plenty do, the section on plus/minus scales explains exactly what to change."
    ],
    "sections": [
      {
        "heading": "The formula: quality points divided by credit hours",
        "paragraphs": [
          "Every GPA calculation is the same two steps. First, convert each course's letter grade into grade points on your school's scale. Second, multiply those grade points by the course's credit hours to get quality points — the real currency of a GPA. Then add up the quality points, add up the credit hours, and divide one by the other.",
          "GPA = total quality points divided by total credit hours, where a course's quality points = grade points times credit hours. Nothing else is involved. There is no step for how hard the course was, no adjustment for the professor, and no averaging of percentages.",
          "Take a fifteen-credit term:",
          "49.5 divided by 15 = 3.30. That is the semester GPA. Notice where the result lands: between the best and worst grade point on the list, pulled toward whichever grades carry the most credit. The C+ hurts more than the one-credit A helps, because it carries four times the weight.",
          "One rule matters here and is easy to get wrong. A course with no letter grade yet is left out of both totals — it is not a zero. An in-progress course, an incomplete, and in most systems a pass/fail credit simply do not appear in the numerator or the denominator until a letter is attached to them."
        ],
        "bullets": [
          "BIO 201 — 4 credits, B+ (3.3): 3.3 x 4 = 13.2 quality points",
          "ENG 105 — 3 credits, A- (3.7): 3.7 x 3 = 11.1 quality points",
          "MATH 220 — 4 credits, C+ (2.3): 2.3 x 4 = 9.2 quality points",
          "HIST 110 — 3 credits, A (4.0): 4.0 x 3 = 12.0 quality points",
          "PE 101 — 1 credit, A (4.0): 4.0 x 1 = 4.0 quality points",
          "Totals: 49.5 quality points across 15 credit hours"
        ]
      },
      {
        "heading": "Credit hours matter more than most students expect",
        "paragraphs": [
          "Here are the same five letter grades from above, rearranged so the C+ lands on the one-credit course and the second A lands on a four-credit one. Same letters, same fifteen credits, same scale.",
          "3.30 becomes 3.64 without a single letter changing. A third of a point, produced entirely by which courses the grades were attached to.",
          "The practical version: when you have a finite number of hours in a week and two things due, the four-credit course is worth four times as much to your GPA as the one-credit one. That is not an argument for neglecting the small course — it often has the least work per point available — it is just arithmetic worth knowing before you decide where the last two hours of a Sunday go.",
          "Credit hours are also where most hand-calculated GPAs go wrong. Labs are sometimes bundled into the lecture and sometimes carry their own credit and their own separate grade. Language and studio courses often run 4 or 5 credits. Some courses are variable-credit and depend on what you actually registered for. Any calculator that assumes three credits per course is guessing, and the guess is wrong often enough to matter. Pull the real numbers off your registration record rather than from memory."
        ],
        "bullets": [
          "BIO 201 — 4 credits, B+ (3.3): 13.2",
          "ENG 105 — 3 credits, A- (3.7): 11.1",
          "MATH 220 — 1 credit, C+ (2.3): 2.3",
          "HIST 110 — 3 credits, A (4.0): 12.0",
          "PE 101 — 4 credits, A (4.0): 16.0",
          "Totals: 54.6 quality points across 15 credit hours, which is a 3.64"
        ]
      },
      {
        "heading": "Semester GPA, cumulative GPA, and how to get from one to the other",
        "paragraphs": [
          "A semester GPA covers the courses in one term. A cumulative GPA runs the identical calculation across every graded course you have completed. Same formula, different set of rows, which is why a good term never lifts your cumulative as far as it feels like it should. The denominator is carrying every credit you have ever taken.",
          "You do not have to re-enter three years of courses to compute it. Your prior quality points are recoverable from two numbers already printed on your transcript: prior GPA times prior credit hours.",
          "New cumulative GPA = (prior GPA x prior credits + this term's quality points) divided by (prior credits + this term's credits).",
          "Say you have 45 credits at a 3.42 cumulative and you just finished the fifteen-credit term above at 3.30. Prior quality points: 3.42 x 45 = 153.9. This term added 49.5. That is 203.4 quality points over 60 credits, or a 3.39 cumulative. A term slightly below your average pulled the number down by three hundredths.",
          "One honest caveat about that shortcut. The GPA on your transcript is already rounded, usually to two decimals, so reconstructing prior quality points from it introduces a small error — a few thousandths of a point in the final answer. That is fine for planning and not something to quote to a scholarship committee. Your registrar's figure is the official one.",
          "Which credits land in the denominator is a school policy rather than a universal rule. Most systems separate credits earned from GPA credits (sometimes called quality hours or attempted hours). A failed course usually earns zero credit toward your degree while still occupying its credit hours in the GPA denominator, which is exactly why an F is so expensive. Transfer and pass/fail credits often run the other way: counted toward the degree, absent from the GPA."
        ]
      },
      {
        "heading": "Your school's plus/minus scale is the one that counts",
        "paragraphs": [
          "The scale on this page — A+ and A at 4.0, A- at 3.7, B+ at 3.3, B at 3.0, B- at 2.7, on down through D- at 0.7 and F at 0 — is the most common American convention. It is not a standard. Grade point values are set institution by institution, printed in the academic catalog, and they vary in ways that change your number.",
          "The tenths-versus-thirds difference sounds too small to bother with. Run the fifteen-credit example again with 3.67, 3.33 and 2.33 in place of 3.7, 3.3 and 2.3 and the GPA moves from 3.30 to 3.31. One hundredth. It stays that small right up until you are sitting on the line for Latin honors, a scholarship renewal or a program's stated 3.50 minimum, at which point a hundredth is the entire question. Look the scale up once, in your own catalog, and use it consistently everywhere."
        ],
        "bullets": [
          "A+ at 4.0 versus 4.3. On this scale an A+ is worth exactly what an A is worth: 4.0, so it is recognition on the transcript rather than a GPA change. Some schools award 4.3 or 4.33 for an A+, which is how a GPA above 4.0 becomes possible without honors weighting. Others record the A+ but cap it at 4.0, and some never issue one.",
          "Tenths versus thirds. Many catalogs use 3.67, 3.33 and 2.67 where this page uses 3.7, 3.3 and 2.7. Same intent, slightly different arithmetic.",
          "No plus/minus at all. Some schools record only A, B, C, D and F, so every grade point is a whole number and there is no 3.7 available to earn.",
          "Missing rungs. Plenty of scales award an A- but no A+, or stop at D with no D-. A letter your school does not issue has no point value to look up.",
          "Percentage cutoffs are a separate policy. What percentage earns an A- is decided per course by your professor and printed in the syllabus. What an A- is worth in grade points is decided by the institution. Two different documents, and you need both."
        ]
      },
      {
        "heading": "Working backwards: the GPA you need this term",
        "paragraphs": [
          "Target questions are the same formula solved for a different unknown. You know where you are, you know where you want to be, and you want the number this term has to hit.",
          "Required term GPA = (target cumulative x (prior credits + term credits), minus prior GPA x prior credits) divided by term credits.",
          "Back to the student with 45 credits at a 3.42, now registered for 15 credits and aiming at a 3.60 cumulative. Total quality points needed: 3.60 x 60 = 216. Already banked: 153.9. The gap is 62.1 quality points across 15 credits, which works out to a 4.14 term GPA. On a 4.0 scale, that does not exist.",
          "Better to know that in September than in December. The ceiling is quick to check first: (153.9 + 4.0 x 15) divided by 60 = 3.565. Straight A's in every course still leaves this student short of a 3.60 this term. Getting there takes two terms, and knowing that changes what you do with the first one.",
          "Aim at 3.50 instead and the math is demanding but real: 3.50 x 60 = 210 total quality points, minus the 153.9 already banked, leaves 56.1 across 15 credits — a 3.74 term. Roughly an A- average with one B+ in it.",
          "The general lesson is about the denominator. With 45 credits behind you, a perfect fifteen-credit term moves a 3.42 to 3.565. With 90 credits behind you, the identical perfect term moves it to 3.50. Early credits are cheap to move and late ones are not. That is the most useful thing to understand about cumulative GPA as a freshman and the least pleasant thing to learn as a senior."
        ]
      },
      {
        "heading": "Pass/fail, withdrawals, repeats and transfer credit",
        "paragraphs": [
          "Four situations break the clean arithmetic, and all four are governed by institutional policy rather than by math. No calculator can know your school's rules, this one included. Treat the list below as the questions to ask, not as the answers.",
          "The practical approach: search your school's site for \"grading policy\" or \"academic regulations\" instead of asking a friend who is one year ahead of you. Until you have that in hand, leave these courses out of the calculation entirely and label the result an estimate. An estimate you know is an estimate is more useful than a precise-looking number built on a guessed policy."
        ],
        "bullets": [
          "Pass/fail (P/NP, S/U, credit/no credit). The common pattern is that a P earns credit toward your degree and carries no grade points, so it sits outside the GPA on both sides of the division. The failing half varies more: some schools keep an NP out of the GPA as well, others convert it to an F worth zero that still occupies its credit hours. There are usually caps on how many pass/fail courses count toward a degree, and majors often refuse them for required courses.",
          "Withdrawals. A W typically appears on the transcript without grade points and stays out of the GPA. Two catches. It usually still counts as attempted credit for financial aid and satisfactory academic progress, which have their own completion thresholds. And most schools set a date after which a withdrawal becomes a WF or an F that does count as a zero. That date is the thing to look up.",
          "Repeats. This is the least standardized rule in the list. Some schools replace the original grade in the GPA while leaving it visible on the transcript. Some average both attempts. Some count only the most recent attempt, in either direction. Repeat forgiveness is frequently capped at a set number of credits and limited to courses below a certain original grade.",
          "Transfer credit. The usual pattern is that credits transfer and grade points do not, so the course counts toward degree requirements while your GPA at the new school starts clean. In-system transfers, dual enrollment and articulation agreements sometimes work differently, and some programs recompute a separate GPA that does include transfer work for admissions purposes."
        ]
      },
      {
        "heading": "The mistakes that produce a wrong number",
        "paragraphs": [
          "Most incorrect GPAs come from a short list of errors, and every one of them takes about a minute to avoid."
        ],
        "bullets": [
          "Averaging two GPAs. A fall at 3.20 over 12 credits and a spring at 3.60 over 18 does not make a 3.40. Convert both back to quality points, 38.4 plus 64.8, and divide by 30 credits for a 3.44. Averaging GPAs only works when the credit loads are identical.",
          "Feeding percentages into the formula. An 88% is not 3.52 grade points. Percentages become letters using the cutoffs in your syllabus, and only then do letters become grade points. Skipping the middle step invents precision the scale does not have.",
          "Counting an ungraded course as a zero. A course with no letter belongs in neither total. Leaving it in as a 0 is the fastest way to scare yourself with a number that is not real.",
          "Accepting default credit hours. Three is a reasonable guess and a bad input. Check the ones that are not three: labs, seminars, studios, language sequences, one-credit anything.",
          "Assuming a rounding rule. A 3.495 becomes a 3.50 only if your registrar rounds, and plenty truncate instead. If you are near a threshold that matters, ask rather than assume.",
          "Mixing scales inside one calculation. Use 3.7 for an A- or use 3.67, but not one in the fall and the other in the spring.",
          "Forgetting that an F keeps its credit hours. A failed 4-credit course earns nothing toward your degree and still puts four credits in the GPA denominator with zero quality points behind them. It is the single most damaging entry a transcript can carry, and the one a repeat policy is most worth reading about."
        ]
      },
      {
        "heading": "Where a calculator stops and tracking starts",
        "paragraphs": [
          "A GPA calculator answers a question you ask at the end of a term, once the letters already exist. The more useful question is the one you can only answer during the term: what is my grade in this course right now, and what does it need to be by December.",
          "That is the part Semora handles. Scan a syllabus and each assignment, quiz, exam and reading comes off it with its own percentage weight, plus the letter-grade cutoffs your professor set, so a weighted course average is built from what your professor actually wrote rather than from your memory of it. If your syllabus groups work into categories instead (homework 20 percent, midterm 30, final 30), you set those up once on the course's grading screen, along with any dropped-lowest and extra-credit rules. Enter scores as work comes back and each course carries a live weighted grade reflecting only what has been graded so far. The Courses tab rolls those into a current semester GPA estimate using the same quality-points math as this page: each course's letter converted to grade points, multiplied by its credit hours, divided by the total credits. Courses with no graded work yet carry no letter, so they are left out of the average entirely rather than counted as zero, one graded assignment is enough to bring a course in. The screen shows how many courses and how many graded credits are behind the number.",
          "Two details worth knowing, because they are the same two this page has been about. Credit hours default to 3 when a course does not specify one, so set the real figure on anything that is not a three-credit course. And the letter-to-points conversion uses the standard scale above (A+ and A at 4.0, A- at 3.7, on down to F at 0) until you change it.",
          "Weighted course grades and the semester GPA estimate are both on the free tier, alongside 1 AI action for the life of the account and unlimited classes synced free from Canvas plus one course you add by hand. Free covers one semester total, so think of it as a term rather than a transcript.",
          "Grade Scale & Forecasting is the Pro half, at $3.99 a month or $19.99 a year. It does the two things this page has argued matter. First, it makes both scales yours: an editable letter-to-grade-points table in Settings for the institutional side, and per-course percentage cutoffs for the professor's side, so a school that pays 4.33 for an A+ or a syllabus that puts the A- line at 93 percent is represented exactly instead of approximately. Second, it forecasts. A \"What do I need?\" panel on a course that uses per-item weights computes, from that course's real weights, the average you would need across the work still to be graded in order to land each letter — marking the ones already locked in, the ones only reachable with extra credit, and the ones out of reach. It appears once some weighted work has been graded. A final-exam what-if lets you pick an ungraded exam, try a score and see the projected course grade without saving anything.",
          "One limitation, stated plainly: Semora calculates course grades and a semester GPA. It does not calculate a cumulative GPA, which needs final letters and credit hours from every term you have completed — data that lives with your registrar rather than in any syllabus. For that number, use the prior-GPA formula in the third section above. Semora runs on iPhone, iPad and the web on one account with near real-time sync, and Pro can be bought with a card on the web or inside the iOS app, applying account-wide either way."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is an A+ worth 4.0 or 4.3?",
        "answer": "Both exist, and only your school's catalog settles it. On the standard scale used on this page, an A+ and an A are both worth 4.0, so an A+ is recognition on the transcript without a change to your GPA. Some schools award 4.3 or 4.33 instead, which is how a GPA above 4.0 becomes possible without honors weighting. Others do not issue an A+ at all. Look up \"grading system\" in your academic catalog and use whatever it says."
      },
      {
        "question": "How do I calculate my cumulative GPA if I only know my current one?",
        "answer": "Multiply your current cumulative GPA by the credit hours behind it to recover your prior quality points, then add this term. With 45 credits at a 3.42, prior quality points are 153.9. A 15-credit term at 3.30 adds 49.5, giving 203.4 over 60 credits, or a 3.39. The result is approximate, because the GPA printed on your transcript is already rounded, but it lands within a few thousandths — fine for planning."
      },
      {
        "question": "Do pass/fail courses count toward my GPA?",
        "answer": "Usually not on the passing side. A P generally earns credit toward your degree and carries no grade points, so it stays out of both the numerator and the denominator. The failing side varies: some schools leave an NP out of the GPA as well, others convert it to an F worth zero that still occupies its credit hours. Most schools also cap how many pass/fail courses count toward a degree, and majors often reject them for required courses."
      },
      {
        "question": "Does withdrawing from a class hurt my GPA?",
        "answer": "A W normally appears on your transcript with no grade points and stays out of the GPA calculation. Two things still bite. It usually counts as attempted credit for financial aid and satisfactory academic progress, which carry their own completion thresholds. And most schools set a withdrawal deadline after which the grade becomes a WF or an F that does count as a zero. Find that date before you decide."
      },
      {
        "question": "If I retake a course, does the first grade still count?",
        "answer": "It depends on your school's repeat policy, which is one of the least standardized rules in American higher education. Some institutions replace the original grade in the GPA while leaving it visible on the transcript. Some average both attempts. Some count only the most recent attempt, in either direction. Forgiveness is often limited to a set number of credits and to courses below a certain original grade. Check the catalog before you register."
      },
      {
        "question": "What GPA do I need this semester to reach a 3.50 cumulative?",
        "answer": "Work it backwards. Multiply your target by your total credits after this term, subtract the quality points you already have, then divide by this term's credits. With 45 credits at a 3.42 and 15 credits ahead, a 3.50 target needs 210 total quality points; minus the 153.9 banked, that leaves 56.1 across 15 credits, or a 3.74 term. Check the ceiling first — a perfect term here caps at 3.565, so a 3.60 is out of reach this semester."
      },
      {
        "question": "Does Semora calculate my GPA for me?",
        "answer": "It calculates your semester GPA, not your cumulative. Enter scores against the weights pulled off your syllabus and each course carries a live weighted grade; the Courses tab converts those to grade points, weights them by credit hours and shows a semester GPA estimate, leaving out any course that has no graded work yet and therefore no letter. That is on the free tier. Pro adds Grade Scale & Forecasting: your school's real point values and per-course cutoffs, plus what-if forecasting on a course once some weighted work has been graded."
      }
    ]
  },
  "pomodoro-timer": {
    "metaTitle": "Free Pomodoro Timer for Students — 15/25/45/50",
    "metaDescription": "A free Pomodoro timer with 15, 25, 45 and 50 minute focus blocks, plus what the technique actually fixes, when each length fits, and its real limits.",
    "h1": "Free Pomodoro Timer for Students",
    "lede": "Four focus lengths, three break lengths, no sign-up, plus an honest account of what a timer fixes, what it does not, and how timed study fits a week built out of gaps between lectures.",
    "intro": [
      "The timer above runs the four focus lengths this page is about (15, 25, 45 and 50 minutes) each paired with a 5, 10 or 15 minute break. There is no account and nothing to install. Pick a length, name the task in your head, start.",
      "What follows is the part most timer pages leave out: where the technique came from, what it is actually doing to your attention, why the classic 25/5 pairing became the default, when a longer or shorter block is the better call, how to spend a break so it works, and the specific situations where a timer will not help you at all.",
      "That last part matters more than it sounds. A timer is a starting device. If you sit down already knowing what to work on, it is very good at getting you moving. If you sit down with four courses, eleven open deadlines and no idea which one is closest to hurting you, no timer solves that. Running one anyway just means you spend 25 well-defended minutes on the wrong thing."
    ],
    "sections": [
      {
        "heading": "Where the technique came from",
        "paragraphs": [
          "Francesco Cirillo devised the Pomodoro technique in the late 1980s, as a university student in Italy who could not get through a chapter without drifting. He set a kitchen timer shaped like a tomato — pomodoro in Italian — for a short stretch and made a deal with himself to work until it rang, and nothing else. He wrote the method up later and published it. The tomato in the name is a kitchen timer, not a metaphor.",
          "The original method is short enough to state in full. Choose one task. Set the timer. Work on that task only until it rings. Stop, and take a short break. After four rounds, take a longer one. Everything else written about it since is elaboration on those five lines.",
          "Two details from the original get dropped in most retellings, and both are the good part. First, the block is meant to be indivisible: you do not pause a pomodoro halfway and resume it after a phone call. It either completes or it is abandoned and restarted. That sounds fussy until you notice that a paused, half-attended block is exactly the thing that makes you feel like you studied for three hours and remember none of it. Second, the technique was designed as a measuring instrument. You count the blocks a piece of work consumed, and the count is the point, three weeks in, you know that a problem set costs you four blocks and a reading response costs two, which is planning information you did not have before."
        ],
        "bullets": [
          "One task per block, chosen before the timer starts.",
          "The block runs to the bell. No pausing, no half credit.",
          "A short break after every block, a longer one after four.",
          "Count what you complete. The count tells you how long your work actually takes, which is the number every plan you make depends on."
        ]
      },
      {
        "heading": "It fixes starting, not concentrating",
        "paragraphs": [
          "This is the most useful thing to understand about the technique, and it is why people who try it and quit usually quit for the wrong reason. A timer does not manufacture concentration. What it does is make the first step cheap enough that you take it.",
          "Compare two commitments. \"Study organic chemistry tonight\" has no edge and no end, so agreeing to it means agreeing to an unknown amount of discomfort, and the honest response of a tired brain is to defer. \"25 minutes on the chapter 9 problems, then I stop\" has a visible end, a known cost, and a defined subject. It is a small enough ask that arguing with it takes more effort than doing it. The technique wins at the negotiation stage, before any focusing happens.",
          "There is a second effect that runs quietly underneath. Once the timer is going, the recurring question — should I be doing something else right now — has a scheduled answer. Not now. In eleven minutes. Deferring a distraction to a fixed, near point is far easier than resisting it indefinitely, and that is most of what the running clock is doing for you.",
          "The diagnostic use of this is worth taking seriously. If you can start fine but drift after ten minutes, a timer is treating the wrong problem, and adding more timers will not help. Look at your phone's position, your sleep, whether the task is defined tightly enough to have a next physical action, and whether you are working somewhere that interrupts you. Timed blocks are weak against all four."
        ]
      },
      {
        "heading": "Why 25 and 5 became the standard pair",
        "paragraphs": [
          "Twenty-five minutes sits in a specific sweet spot. It is short enough that you cannot credibly claim you are too tired for it, which is the whole trick, and long enough to get past the two or three minutes of throat-clearing that begin any piece of work — finding the file, remembering where you stopped, re-reading the last paragraph you wrote.",
          "It also produces clean arithmetic, which matters more than it should. A 25-minute block plus a 5-minute break is exactly half an hour. Two rounds is an hour. Four rounds is two hours and a long break. When you are planning a week around gaps between lectures, being able to do that math in your head without a calculator is a real advantage over an idiosyncratic 37-minute interval.",
          "The five-minute break is short on purpose. It is deliberately too brief to start anything with its own gravity — a five-minute break cannot become an episode. It is long enough to stand up, refill a glass and let your eyes focus on something farther away than a screen, and that is all it is for.",
          "The cost of 25 is re-entry. Every block spends its first minutes reloading context, so with short blocks, a larger share of your total time goes to reloading. For work made of small repeatable units — flashcards, short problems, vocabulary, reading a section at a time — that cost is near zero and 25 is ideal. For work where you hold a whole structure in your head, it is expensive, and that is the case for a longer block."
        ]
      },
      {
        "heading": "When 15, 45 or 50 is the better block",
        "paragraphs": [
          "Treat 25/5 as the default rather than the rule. The right length is a function of two things: how expensive it is to reload the task, and how much uninterrupted time you actually have.",
          "Fifty minutes is for work with a high reload cost. A proof you are halfway through, a problem set where each question depends on the last, a draft where you are holding an argument in your head, a lab report, a dense reading you are annotating as you go. Stopping at 25 in the middle of that costs you the structure, and you pay to rebuild it. Pair a 50 with a 10 or 15 minute break, because a longer block earns a longer recovery and five minutes will not feel like enough.",
          "Forty-five is the sensible single-sitting default and the one to reach for if you are unsure. It is long enough for real work on a hard task and short enough that a 90-minute evening holds two of them with a break in between. It is also the session length Semora's Smart Plan uses by default when it lays study sessions across your calendar, with 25 and 50 available as alternatives.",
          "Fifteen exists for the gaps, and college is mostly gaps. The stretch between a lecture ending and the next one starting, the twenty minutes before a lab, the bus, the line at the dining hall. A 15-minute block will not get you through a problem set, but it will get you through a flashcard deck, one worked example, the outline of a paragraph, or the first ten minutes of the thing you have been avoiding for four days, which is often all that thing needed. Use it as a wedge, not as your main method."
        ],
        "bullets": [
          "15 minutes: flashcards, one worked problem, an outline, admin, or breaking the seal on a task you keep postponing.",
          "25 minutes: anything made of small repeatable units — problem sets with short questions, reading a section at a time, vocabulary, note clean-up.",
          "45 minutes: the general-purpose block. Two of them plus a break fills a standard evening session.",
          "50 minutes: deep reading, proofs, essay drafting, code, lab reports — work where losing the thread costs you more than the extra fatigue.",
          "Break pairing: 5 after a 15 or 25, 10 after a 45, 10 or 15 after a 50."
        ]
      },
      {
        "heading": "How to actually spend the break",
        "paragraphs": [
          "The break has two jobs. It has to be genuinely different from the work, and it has to end. Most people fail the second one, and a break that does not end is just the end of the session.",
          "Different means different in kind, not different in content. Standing up is the single most reliable version — leave the chair, walk to another room, refill a glass, look out of a window at something far away, stretch your shoulders, wash a plate. Anything that moves your body and changes what your eyes are doing will return you to the desk in better shape than five minutes of sitting still in the same posture.",
          "The failure mode is a feed. This is not a moral point about phones, it is a mechanical one: a feed has no natural end, so nothing in it tells you the five minutes are up, and it recruits exactly the attention you were trying to rest. You come back having neither rested nor worked. If you must have your phone in the break, make it a call to someone, or a specific reply you owe, because both of those finish.",
          "The long break after four rounds is different and should be treated as such: fifteen to thirty minutes, eat something, go outside if there is any outside available. It is the one place a genuinely restorative pause fits. The one exception to all of the above is the honest one — if the bell catches you mid-sentence or mid-derivation, finish the thought and then break. Following the rule off a cliff is not the point of the rule."
        ]
      },
      {
        "heading": "What to do when you get interrupted",
        "paragraphs": [
          "Interruptions come in two kinds and they need different handling. External ones arrive from outside: a roommate at the door, someone in the library asking a question, a message that lights up the screen. Internal ones arrive from you: the sudden memory that you have not emailed the professor about the extension, or that you need to check whether the lab is in room 4 or room 6.",
          "Internal interruptions have a good, cheap fix. Keep a scrap of paper or a note on your phone beside you and write the thought down in five seconds, then go straight back. The writing is the deal: you are not ignoring the thought, you are scheduling it for the break. Most of what breaks a study block is not the world, it is a brain trying to make sure you do not forget something, and a written line satisfies it completely.",
          "External ones on campus need a sentence, not a system. The strict version of the technique is to inform the person you are mid-block, agree a time to come back, and then actually come back. The practical version is \"give me twelve minutes\" said out loud. Both work because they make the interruption finite instead of open-ended.",
          "Then there is the question of what to do with the damaged block. The original rule is strict: an interrupted pomodoro is void, and you start it again. That is stricter than most people need, but the principle behind it is worth keeping — a block you half-attended should not go in the count as a completed one, because the count is your record of how long work takes, and a padded record makes every plan you build on it wrong. A workable compromise: if you lost under a minute, carry on. If you lost five, reset the block and start it again."
        ],
        "bullets": [
          "Keep a capture list within reach and use it in under five seconds.",
          "Say the finite version out loud: not \"I'm busy\" but \"give me twelve minutes\".",
          "Put the phone out of arm's reach. Face-down on the desk is still within reach.",
          "Lost under a minute, keep going. Lost five, reset the block rather than counting it."
        ]
      },
      {
        "heading": "The limits worth knowing before you rely on it",
        "paragraphs": [
          "The largest limit is the one this page opened with, and it is worth stating flatly: the technique does not tell you what to work on. It is a container, and it will hold whatever you put in it, including the wrong thing. The symptom is unmistakable once you know to look for it — you start the timer, and then spend the first six minutes deciding what the block is for. That is not a focus failure. That is a planning failure showing up at the moment you sit down, and it needs a plan, not a longer timer.",
          "A related limit: timers do not create hours. If your week holds fourteen hours of work and six hours of usable gaps, timed blocks will make that arithmetic visible faster, which is genuinely useful, but the arithmetic does not change. At that point the decision you need is which deadline slips or gets a smaller version of your effort, and that is a triage question.",
          "The technique also fits some work badly. A three-hour lab, a group meeting, a seminar, an exam, a shift — these have their own clocks and do not want yours. Timed blocks are for solo, self-directed work where nothing external is setting the pace. Trying to Pomodoro a group project meeting will annoy everyone in it.",
          "Two smaller traps. Counting blocks can quietly become the activity — the number is a measurement, not a score, and eight shallow blocks is worse than four real ones. And a vague task fails inside a 25-minute box in the same way it fails across an entire evening. \"Work on the essay\" is not a block. \"Outline section two\" is. If you cannot say what the block is for in one short phrase, the problem is upstream of the timer."
        ]
      },
      {
        "heading": "Fitting timed study into a real college week",
        "paragraphs": [
          "The mistake in most study advice is imagining an evening. A college week is not shaped like an evening, it is shaped like a lecture at 9:30, another at 12:30, a lab on Thursday and a shift on Saturday. The hours that actually decide your semester are the awkward 60 to 105 minute gaps between classes, and almost nobody uses them, because a gap does not feel like enough time to start anything. A timer is very good at exactly that objection.",
          "Run the arithmetic on a real Tuesday. Your lecture ends at 10:45 and the next one starts at 12:30. That is 105 minutes. Take off ten for walking and settling somewhere, and you have 95. That holds a 50-minute block, a 10-minute break and a 25-minute block, with time to pack up, which is a genuine hour and a quarter of work you would otherwise have spent on your phone in a corridor. Do that on three days and you have added the best part of four hours to your week without touching your evenings.",
          "Then match the block to the gap rather than the gap to the block. This is the whole discipline. A 50 does not fit a 40-minute window and attempting it produces a rushed, resentful 40 minutes. A 15 fits almost everywhere. Decide the length when you see the gap, not the night before.",
          "For evenings, pick a daily total and stop there. Ninety minutes a day, five days a week, is a serious amount of study. Ninety minutes a day is also the daily total Semora's Smart Plan uses by default, though out of the box it plans weekends too, so left alone it will schedule seven days at 90 minutes rather than five, and you turn weekends off if you do not want them. In blocks, ninety minutes is two 45s with a break between them, or a 50, a 25 and a 15 if you want the long one first. A 50 plus a 25 is 75, not 90 — close enough on a tired evening, but count it honestly. The reason to fix the total in advance is that an open-ended evening tends to produce either four hours of guilt-driven grinding or none at all, and the fixed total reliably beats both."
        ],
        "bullets": [
          "15 to 25 minute gap: one 15-minute block. Flashcards or a single problem.",
          "30 to 45 minutes: one 25 and a 5, or a straight 45 if you can skip the break.",
          "45 to 60 minutes: one 45. This is the most common between-class gap and the most wasted.",
          "60 to 90 minutes: a 45, a 10, then a 25 if there is room.",
          "90 to 105 minutes: a 50, a 10, then a 25.",
          "Two hours or more: two 50s with a 10 between them, then a real break before deciding whether to continue."
        ]
      },
      {
        "heading": "Where Semora's Focus timer fits",
        "paragraphs": [
          "The timer on this page is complete for what a timer does, and it costs nothing. Semora's Focus timer is a Pro feature in the app, and it offers exactly the same lengths — 15, 25, 45 or 50 minutes of focus, 5, 10 or 15 minutes of break. That is deliberate. There is no reason for the tool on this page and the one in the product to disagree with each other.",
          "The difference is not the countdown. It is what the countdown is attached to. In Semora, a focus session starts from something specific: open a deadline and start a focus session against it, and the block carries that task's name with it, so the block is already defined before it begins. Start one from a Smart Plan study block and it arrives pre-set to that block's own length, and finishing the focus phase marks that block done. The counting problem — did that session actually happen, against what — stops being something you track on paper.",
          "On iPhone and iPad, a running session is stored on the device rather than held in memory, so backing out of the screen or relaunching the app resumes the same session at the correct remaining time, and the end-of-phase alert is a real scheduled notification. It fires with the app in the background and the screen off, which is what you want, because the alternative is a timer that only works if you sit and watch it.",
          "The part a standalone timer structurally cannot do is decide what the block is for. That is Smart Plan, and it is the honest reason the two sit next to each other in the app. Smart Plan reads every deadline across your courses, looks fourteen days ahead, and lays study sessions into your actual days — 90 minutes a day in 45-minute sessions by default, weekdays from 5pm and weekends from 10am, with 25, 45 and 50 minute sessions available and daily totals of 60, 90, 120 or 180. Weekends are included by default and can be switched off. It schedules around your class meeting times, because the syllabus scan already recorded when your classes are. When a deadline moves, the plan reschedules. You get a timer that already knows what it is counting down for.",
          "If what you need first is simply knowing what is due, that part costs nothing. The free tier covers 1 AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand within one semester (one semester total, because a free account cannot start a second term) full deadline and task tracking, weighted grade tracking with your semester GPA, and same-day reminders. Smart Plan, the Workload dashboard, flashcards, the AI tutor and the Focus timer sit on the Pro side, at $3.99 a month or $19.99 a year, which is about $1.67 a month. Pro is bought with a card on the web or inside the iOS app, and applies to your whole account either way, the web app included."
        ],
        "bullets": [
          "Same focus lengths as this page: 15, 25, 45, 50. Same breaks: 5, 10, 15.",
          "Start a session from a specific deadline and the block is named before it starts.",
          "Start it from a Smart Plan block and it opens at that block's length; completing the focus phase marks the block done.",
          "On iPhone and iPad the session survives leaving the screen or relaunching, and the end-of-phase alert is a scheduled notification that fires in the background.",
          "Smart Plan decides what the block is for: 14-day horizon, 90 minutes a day in 45-minute sessions by default, weekends included unless you turn them off, scheduled around your class meetings.",
          "Focus timer and Smart Plan are Pro — $3.99 monthly or $19.99 yearly, bought on the web or in the iOS app, applied account-wide."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is 25 minutes actually the right length for studying?",
        "answer": "It is a good default, not a law. Twenty-five works best for work made of small repeatable units — short problems, flashcards, reading a section at a time — where restarting costs you nothing. For a proof, an essay draft or a dense reading, the first minutes of every block go to rebuilding context, so 45 or 50 wastes less. Pick the length from the task and the size of the gap you have, then keep it consistent within the session."
      },
      {
        "question": "What should I do if the timer goes off while I am in flow?",
        "answer": "Finish the thought, then break. The rule exists to stop you grinding past the point of usefulness, not to interrupt you mid-sentence. If it keeps happening, that is a signal your blocks are too short for the work — move from 25 to 45 or 50 and the problem usually disappears. What you should not do is cancel the break entirely and keep going for two hours, because the fatigue arrives regardless and it arrives worse."
      },
      {
        "question": "How many blocks should I do in a day?",
        "answer": "Fewer than you think, done properly. Two 45-minute blocks on a normal weekday is real progress and is sustainable across a semester. Four to six is a heavy day and hard to repeat. Fix the daily total in advance rather than working until you feel finished, because an open-ended evening produces either guilt-driven grinding or nothing. Ninety minutes a day, in 45-minute sessions, is the daily total Semora's Smart Plan uses by default, and it plans weekends too unless you switch them off, so left alone that is seven days rather than five."
      },
      {
        "question": "Should I count a block I got interrupted during?",
        "answer": "The original rule voids it and makes you start again, which is stricter than most people need. Keep the principle though. The count is your record of how long your work actually takes, and if you pad it with half-attended blocks, every plan you build on that record is wrong. A workable line: lost under a minute, keep going and count it. Lost five, reset the block and start it again. Never count a block you spent mostly on your phone."
      },
      {
        "question": "The technique is not working for me. What am I doing wrong?",
        "answer": "Usually one of three things. You do not know what the block is for, which is a planning problem and needs a plan, not a timer. The task is too vague — \"work on the essay\" fails in a 25-minute box the same way it fails across an evening, so cut it to \"outline section two\". Or your block length does not match the work, and you are being pulled out of something that needed fifty minutes at the twenty-five minute mark."
      },
      {
        "question": "Is Semora's Focus timer free?",
        "answer": "No. The Focus timer is a Pro feature, at $3.99 a month or $19.99 a year, which works out around $1.67 a month. Pro is bought with a card on the web or inside the iOS app, and applies to your whole account either way, the web app included. The timer on this page is free and offers the same lengths, so if a plain countdown is what you need, use this one. Semora's version adds attachment to a specific deadline or Smart Plan block, and background notifications on iPhone and iPad."
      },
      {
        "question": "What can the app's timer do that this page's timer cannot?",
        "answer": "Three things. It attaches a session to a named deadline, so the block is defined before it starts. It launches from a Smart Plan study block at that block's own length, and completing the focus phase marks the block done. And on iPhone and iPad it survives leaving the screen or relaunching the app, with a scheduled end-of-phase notification that fires in the background. The countdown itself is identical — same 15, 25, 45, 50 and same 5, 10, 15."
      }
    ]
  },
  "myhomework-alternative": {
    "metaTitle": "myHomework Student Planner Alternative for College",
    "metaDescription": "Looking for a myHomework Student Planner alternative? How to choose one for college: the walls students hit, the four kinds of tool, and where Semora fits.",
    "h1": "myHomework Student Planner alternative: how to choose the right one",
    "lede": "If you are searching for a myHomework Student Planner alternative, you have usually already hit something specific — the typing, the missing gradebook, or a semester that quietly stopped matching what is in the app. This page is about choosing the right replacement for that particular wall, including the cases where the right answer is not Semora.",
    "intro": [
      "Most pages with \"alternative\" in the title are a head-to-head comparison wearing a different hat. This one is not, because the question is different. You are not weighing two products from a standing start. You have run a planner for a while, something specific broke, and you want to know what else exists and whether switching in week four is worth the disruption.",
      "So, in order: the reasons students leave planners in this category, the four shapes of tool you will actually find when you go looking, a checklist you can run in one afternoon against your own syllabus, and then what Semora does differently, plus an honest list of the students it suits badly. Everything said here about myHomework Student Planner is limited to what its own App Store listing, its in-app help documentation, and third-party review coverage describe, carrying the same caveats those sources carry."
    ],
    "sections": [
      {
        "heading": "Why students go looking for a different planner",
        "paragraphs": [
          "The search almost never starts with \"this app is bad.\" It starts with a week. You are three weeks into a term, you open the planner, and the thing you needed it to tell you is not in there, either because you never finished typing it in, or because the question you actually had was \"where do I stand in this class right now,\" and the planner was never built to answer that.",
          "For context on the specific product: myHomework Student Planner is built around manually entering your classes and assignments, or importing assignments from a supported LMS. Its listing and help documentation describe imports from Canvas, D2L, Google Classroom, Blackboard, and Schoology, with a premium account automatically updating the planner as new assignments are added going forward. There is no syllabus photo or PDF parsing. Grade tracking is not described as a core feature in the materials available (the app is positioned around scheduling, reminders, 60+ customizable themes, color-coded courses, and homework widgets for phone, tablet, and PC) and no dedicated study-schedule, flashcard, or tutor feature was found in those materials either.",
          "Two things follow from that, and they cut in opposite directions. The first is that myHomework runs almost everywhere: iOS, Android, Mac, Windows, Chrome, Kindle Fire, and web. That is broader device coverage than most of the tools you will line up against it, Semora included, and if the reason you are shopping is that you switched to a Windows laptop, you may be about to trade away the one thing you should keep. The second is that the company's primary current business focus has shifted toward a K-12 digital hall-pass product for schools, though the Student Planner consumer app remains separately available and was still being updated as recently as early 2025. That is not a prediction, and you should not read it as one. It is context worth having before you commit four years of coursework to any single planner.",
          "Underneath the specifics, the reasons students give for shopping around fall into five recognizable buckets."
        ],
        "bullets": [
          "The entry tax. Four syllabi is somewhere between thirty and sixty rows of assignments, dates, and weights. Whatever you are willing to type in August, you stop being willing to type by mid-September.",
          "The staleness gap. A planner that only knows what you told it is wrong the moment a professor moves an exam and you do not go update it in three places.",
          "No answer to \"where do I stand.\" A due-date list cannot compute a weighted average, because it never learned what anything is worth.",
          "A list is not a decision. Knowing that six things are due next week does not tell you what to start tonight.",
          "Coverage that stops where your instructor stopped. An LMS import can only ever be as complete as what got uploaded to the LMS. Weekly readings, percentage weights, and grading policies very often live only in the syllabus PDF."
        ]
      },
      {
        "heading": "Turn your wall into a requirement before you start shopping",
        "paragraphs": [
          "The common mistake is to go looking for \"a better planner.\" That is not a category. There is only the specific thing that broke, and the smallest change that fixes it without breaking something you currently rely on.",
          "So write down which of the five above is yours. Then write down the two things your current setup does that you would genuinely miss. Those two are almost always more load-bearing than whatever headline feature is on the landing page you are reading. A widget you actually glance at, or the fact that it runs on the desktop in the library, will beat an AI feature you use twice in a term."
        ],
        "bullets": [
          "Typing is the problem, so the tool has to read a document. Ask what formats it takes, how many pages per pass, and whether you get to review the output before it saves anything.",
          "Staleness is the problem, so ask what happens downstream when you change one date. Reminders, calendar entries, and any study time you had blocked out all have to move with it.",
          "Grades are the problem, so you need weighted categories and your professor's actual letter scale, not a generic assumption that 90 is an A.",
          "Deciding is the problem, so you want prioritization and scheduling, not a prettier list.",
          "Hardware is the problem, so check native clients against browser access, and find out which features quietly do not exist in a browser.",
          "Classmates are the problem, so look for genuinely shared courses that stay in sync, rather than an export button and a group chat."
        ]
      },
      {
        "heading": "The four shapes of alternative you will actually find",
        "paragraphs": [
          "Search results in this category blur together, because nearly everything now describes itself as an AI study app. There are really four shapes, and they are good at different jobs.",
          "Manual planners and calendar apps. The fastest thing to switch to, and the ones that carry your existing habits over intact. You keep the entry tax and you usually keep the missing gradebook, but nothing about how you work has to change. If your real complaint is about themes, widgets, or which devices it runs on, this is your category and you should not overthink it.",
          "LMS-sync-first planners. These pull assignments from Canvas, Brightspace, Moodle, and similar systems, and refresh on a schedule. Very low effort when your instructors are disciplined about posting everything. The ceiling is structural rather than a matter of quality: a sync can only show what was uploaded. The professor who runs the entire course from one PDF is invisible to it.",
          "Syllabus-scanning planners. These read the document that actually contains your semester and build the schedule from it. Higher ceiling, because a syllabus carries the weights and the grading scale as well as the dates. The cost is that extraction is imperfect, so the review step matters more than the model does.",
          "Materials-first AI study apps. You upload slides, a reading, or a lecture recording, and get flashcards, quizzes, and a tutor scoped to that material. These are good at studying and they are not deadline systems. Plenty of students run one alongside a planner rather than instead of one.",
          "Be honest with yourself about which sentence describes your semester. If the problem is \"I do not know what is due,\" a materials-first app will not fix it. If the problem is \"I do not understand chapter nine,\" no planner will fix that either."
        ]
      },
      {
        "heading": "A checklist you can run in one afternoon",
        "paragraphs": [
          "Test every candidate against your worst syllabus, not against the demo. The demo is a clean two-page PDF from a course designed to be demoed. Yours is the one with the assignment table split across a page break and three dates listed as TBA.",
          "Seven checks, and none of them take long."
        ],
        "bullets": [
          "Time the setup. Start a stopwatch and get one real course fully in, every assignment, every weight. Multiply by your course load. That number is what switching actually costs you.",
          "Move a due date, then look around. Did the reminder move with it? The calendar entry? Anything you had scheduled to study? Whatever did not move is the maintenance you will be doing by hand all term.",
          "Enter two grades. Ask whether it can tell you your weighted average and your term GPA, or only that you scored 88 on something.",
          "Find where the free plan stops, not where it starts. Ask what ends, when it ends, and whether the limit is monthly, per term, or permanent.",
          "Check the second-year price rather than the first, and check where the purchase lives — App Store subscription, web checkout, or per device.",
          "Find the exit before you need it. If you cannot get your semester out as a standard file, you are renting your own data.",
          "Open it on every device you genuinely use, including the browser on a school computer, and check which features are missing there."
        ]
      },
      {
        "heading": "What Semora does differently",
        "paragraphs": [
          "Semora starts one step earlier than a planner normally does. Instead of asking you to enter assignments, it reads the syllabus. There are four import paths: a camera photo of up to 5 pages per scan within about a 10 MB budget, a PDF upload, drag-and-drop on the web, and pasted raw text anywhere from 20 to 60,000 characters, which is the fastest route when you already have the PDF or an LMS page open on a laptop.",
          "What comes back is structured rather than a wall of text: course name and code, instructor, class meeting blocks with days, times, and rooms, office hours, semester start and end dates, the letter-grade scale your professor actually uses, and every assignment, quiz, exam, project, and reading it can find with a due date, a due time, a percentage weight, and a confidence score.",
          "Nothing lands silently. On a new course, the course record, its meeting times, and its grading scale are written for you; only the deadlines wait on a review screen where each row is editable. Anything the model scored under 0.8 confidence is badged for verification. Anything dated outside the term is flagged. Undated items — the \"Final exam: TBA\" cases — land deselected in a \"Needs a date\" group and cannot be saved until you set one. The point is not that extraction is never wrong. The point is that correcting three rows is a different task from typing thirty.",
          "The weights are what make the rest work. Because the scan captured what each item is worth and what type it is, your weighted average is real from the first graded item , that part is free, and Semora can score tasks by grade weight multiplied by a prep-effort factor: exams count triple, projects 2.5x, quizzes 1.5x, assignments 1.2x, readings 1x. That score is what drives the two Pro features built on top of it — the Workload dashboard's crunch-week view, and the order Smart Plan fills your study sessions, across a rolling 14-day horizon that works around your class times rather than pretending your afternoons are empty. Academic Risk, also Pro, watches three specific things: a grade trending down, work that went past due unfinished, and a week carrying more than you can absorb.",
          "Change day is where it shows. Move a due date once and Semora cancels and reschedules that task's device reminders against the new date, and asks whether a repeating task should change for one occurrence, all future ones, or the whole series. If you are on Pro, it also updates an existing calendar event in place rather than duplicating it, and invalidates your study blocks so Smart Plan rebuilds the plan the next time you open it, both of those ride on Pro features, so on the free plan the reminder and the task itself are what move."
        ]
      },
      {
        "heading": "What the free tier covers, and exactly where it stops",
        "paragraphs": [
          "The free plan is one AI action for the life of the account, and unlimited classes synced free from Canvas plus one course you add by hand within one semester, with one semester total. That action is yours to spend on whichever you reach for first: a syllabus scan, a lecture recording, or a document turned into notes. Inside that, it is not a stripped-down demo: deadlines, tasks, and subtasks are unlimited, grade tracking with weighted averages is included, your semester GPA sits on the courses screen, same-day reminders work, and joining a Course Space a classmate invites you to is free permanently. Five pages photographed in a single pass counts as that one scan rather than five, and everything you add or correct by hand afterwards costs nothing at all.",
          "Here is the boundary that matters most, stated plainly because it is the one people meet late: a free account gets one semester in total, not one per term. It is enforced by the database on insert, not just by the app, so there is no way around it. Free is a full semester of real use, start to finish — it is not something you renew every August.",
          "Pro is $3.99 a month or $19.99 a year, which works out to about $1.67 a month. It removes the course, semester, and AI action limits, subject to a fair-use daily ceiling, and adds Canvas, Blackboard, and Moodle import subject to school policy and platform configuration, hosting your own Course Space, Smart Plan, the Workload dashboard, Flashcards, a Focus timer, an AI Tutor, Grade Scale and Forecasting, device calendar sync with .ics export, 1-day and 3-day reminder timing with quiet hours, Academic Risk alerts, Progress Insights, and Share and Streaks. It is bought either with a card on the web or inside the iOS app, and the subscription applies account-wide either way, so you pay once whichever route you take.",
          "Semora's current Canvas connector uses a personal access token you generate in Canvas. If you stay free, or if your institution disables or prohibits third-party token use, open your assignments page, select the list, and paste it into the scanner on the web. You get the same extraction and the same review screen without the Pro LMS connection."
        ]
      },
      {
        "heading": "Who Semora is a bad fit for",
        "paragraphs": [
          "An alternative page that cannot name its own misfits is not worth much. Here is where Semora is the wrong answer, and in several of these cases staying put is the better decision."
        ],
        "bullets": [
          "You need a native desktop or Android client. Semora is one universal iOS app for iPhone and iPad, plus a web app. The browser covers Windows, Mac, Chromebook, and Android, but browser notifications only fire while a tab is open, and device calendar sync does not run in a browser at all. If native coverage across Mac, Windows, Chrome, Android, and Kindle Fire is the thing you actually rely on, that is a real reason not to switch.",
          "Price is the deciding factor. myHomework's base version is free with ads, and an ad-free premium tier is reported at around $4.99/year via third-party reviews, which is not confirmed on its current site. If that figure holds, Semora Pro at $19.99/year is the more expensive option, and there is no point pretending otherwise. Semora's free tier is the answer to that comparison, not its price.",
          "Your school runs D2L or Schoology. Semora's Pro LMS import covers Canvas, Blackboard, and Moodle subject to school policy and platform configuration. myHomework's import reportedly covers D2L and Schoology as well. Pasting or scanning still works, but a direct connection does not.",
          "Your courses do not really have syllabi. Studio classes, clinical rotations, research credit, and labs that post assignments weekly give the scanner very little to read, which removes most of the reason to switch.",
          "You want lecture recordings and slide decks turned into study material. That is a materials-first tool's job. Semora's flashcards and tutor are scoped to the courses you have scanned, and both are Pro.",
          "You expect a planner to stay free across several years. Semora's free tier is one semester total. If you want a permanent no-cost planner, this is not it.",
          "Your current system works. A planner you actually open beats a better one you abandon in week five. If nothing is broken, the honest recommendation is to keep going."
        ]
      },
      {
        "heading": "Switching mid-semester without losing a week",
        "paragraphs": [
          "The good moments to switch are before a term starts, or the weekend after a midterm. The bad moment is the night before something is due, when you are really looking for a way to avoid the work. If you are mid-semester, budget one sitting of about an hour and do it in this order."
        ],
        "bullets": [
          "Scan every syllabus first, in one pass, before you touch a single setting. This is the step that decides whether the rest of the app has anything to reason about.",
          "If you are on the free plan and your school uses Canvas, paste your assignments page text into the scanner on the web instead of connecting the LMS, which is Pro.",
          "Work through the review screen properly once. Fix the low-confidence rows and give the TBA items a placeholder date you can move later.",
          "Enter the grades you already have. Without them, the weighted average has nothing to average and, on Pro, the risk alerts have nothing to watch.",
          "Turn on reminders and check one notification actually arrives on your phone before you trust it with anything.",
          "Keep the old planner installed for two weeks. Do not delete anything until you have been through one real change day and seen both tools handle it."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is there a free alternative to myHomework Student Planner?",
        "answer": "Yes, in both directions. myHomework's own base version is free with ads, and its ad-free premium tier is reported at around $4.99 a year via third-party reviews, which is not confirmed on its current site. Semora's free tier gives you one AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand, unlimited deadlines and tasks, weighted grade tracking, your semester GPA, and same-day reminders — within one semester total, after which continuing requires Pro."
      },
      {
        "question": "Which alternative connects to D2L or Schoology?",
        "answer": "Not Semora. Its Pro LMS import supports Canvas, Blackboard, and Moodle. The current Canvas connector uses a personal access token and should be used only where the institution permits third-party token connections. If it is unavailable or not permitted, scan the syllabus or paste the assignments page into the web scanner. myHomework's import reportedly covers D2L and Schoology alongside Canvas, Blackboard, and Google Classroom. If a direct D2L or Schoology connection is non-negotiable, that is a genuine reason to stay."
      },
      {
        "question": "Can I import my existing planner data into Semora?",
        "answer": "No. Semora's import paths are the four scan routes (camera photo, PDF, web drag-and-drop, and pasted text) plus Canvas, Blackboard, and Moodle on Pro, subject to school policy and platform configuration. There is no importer that reads another planner's file. In practice, scanning your syllabi again is usually faster than any migration would have been, because the scan pulls the weights and grading scale a planner export would not have carried anyway."
      },
      {
        "question": "Does Semora work on Windows or Android?",
        "answer": "Through the browser, yes. The web app runs on Windows, Mac, Chromebook, and Android on the same account as the iOS app, with near real-time sync. What you do not get is a native client on those platforms. Browser notifications only fire while a tab is open, and device calendar sync is an app feature that does not run in a browser — on Pro, the .ics export is the equivalent there, and it does work in the browser, downloading a calendar file you can open in Google Calendar, Outlook, or anything else."
      },
      {
        "question": "Is switching worth it if I only take three courses?",
        "answer": "Often not. Three courses is a small enough load that manual entry stays manageable, and if your current planner is holding up, changing tools mid-term costs more than it returns. The case for switching gets strong when the syllabus holds weights you want tracked, when you cannot answer what your grade is, or when you need something to tell you what to work on tonight."
      },
      {
        "question": "What happens in Semora when a professor moves a due date?",
        "answer": "You change the date once and the rest follows. Semora cancels and reschedules that task's device reminders, and asks whether a repeating task should change for one occurrence, all future occurrences, or the entire series. On Pro, it also updates an existing calendar event in place instead of creating a second one, and your study blocks are invalidated so Smart Plan — also Pro — rebuilds unfinished sessions from today forward the next time you open it."
      },
      {
        "question": "Is Semora cheaper than myHomework premium?",
        "answer": "Probably not, and that is worth saying directly. myHomework's ad-free premium is reported at around $4.99 a year through third-party reviews, though that is not confirmed on its current site, while Semora Pro is $3.99 a month or $19.99 a year. The comparison Semora wins on cost is its free tier against a paid one, not Pro against premium. If the lowest annual price decides it, this is not your app."
      }
    ]
  },
  "shovel-alternative": {
    "metaTitle": "Shovel Alternative: How to Pick the Right Planner",
    "metaDescription": "Leaving Shovel? A practical guide to choosing a study planner: the three jobs these apps do, where Semora fits, and the students it fits badly.",
    "h1": "Looking for a Shovel alternative? Start with the job you need done",
    "lede": "Most people searching for an alternative have already decided something. They just have not decided what to replace it with. This page is about that decision rather than the pitch: the three jobs study apps actually do, the questions worth asking before you subscribe to anything else, and an honest account of where Semora fits and where it does not.",
    "intro": [
      "Shovel is a study-planning and scheduling app. You upload a PDF syllabus for AI parsing, with a review and confirmation screen, or you connect a school LMS — Canvas, Brightspace, Moodle, or Google Classroom — for read-only sync that auto-refreshes roughly every 24 hours. From there it builds a time-blocked study schedule across the whole semester, weighing your available time against estimated time-per-task, with The Cushion™ predictive conflict alerts, reading-time estimators, streak-based motivation tracking, and free supplementary \"how to study\" courses.",
      "That is a coherent theory of the problem: you already know what is due, and what you cannot do is decide when the work happens. If that theory had matched your problem, you would not be reading this page. So the useful question is not which product is the closest clone. It is which part of the job was still unsolved for you. Answer that first and the shortlist mostly writes itself."
    ],
    "sections": [
      {
        "heading": "The four reasons people go looking for something else",
        "paragraphs": [
          "Across this whole category — planners, syllabus scanners, LMS aggregators, materials-first study apps — the reasons students switch collapse into about four. None of them are really about a product being bad. They are about a mismatch between the job a tool was built for and the job you turned out to have.",
          "The first is that your job was tracking, not scheduling. You wanted to know where you stand: what your average in organic chemistry actually is after the second midterm, whether the 15 percent participation grade is quietly carrying you, what you need on the final to keep a B. Grade tracking is not something Shovel's public materials describe as core to the product; its documented focus is converting deadlines into a study schedule rather than computing course grades. If the thing keeping you up is the number, a scheduling tool is answering a question you did not ask.",
          "The second is the estimate problem. Time-blocking needs an input many students cannot produce honestly in week one: how long this reading will take, how long that problem set will take, how much of Saturday is really available. For some people, forcing those estimates is exactly the discipline that makes a semester work. For others, a schedule built on guesses drifts by week three and then starts to feel like a debt you are behind on, which is worse than no schedule at all. Neither reaction is wrong. They are different students.",
          "The third is the bill. Shovel's official pages conflicted when checked August 9, 2026. Its Pricing page showed a 7-day free trial followed by $9.79/month (with $19.99 also displayed) or $39/year, while its navigation-linked Buy page showed $33/month paid monthly or $16/month paid annually. Because the vendor's own pages disagree, confirm the checkout amount rather than relying on a single figure. That uncertainty alone can be enough to reopen the decision.",
          "The fourth is the shape of the thing. Shovel has native iOS and Android apps, with account creation and initial setup happening on the web app first and mobile positioned as a companion rather than a standalone starting point. Some students want that order reversed, because the syllabus PDF is already on the phone and the reminder has to land on the phone. Others specifically want Android, which narrows the field fast."
        ],
        "bullets": [
          "Tracking, not scheduling: you needed a running grade, and you got a calendar of study blocks.",
          "The estimate problem: time-blocking asks how long each task will take, and a schedule built on bad guesses decays.",
          "The bill: the vendor's official Pricing and Buy pages show different amounts, so checkout is the only reliable current quote.",
          "The shape: which device you start on, which device fires the reminder, and whether Android is on the table at all."
        ]
      },
      {
        "heading": "Three jobs, and most tools are honestly good at one",
        "paragraphs": [
          "It helps to stop thinking of these as competing apps and start thinking of them as three different jobs that happen to ship in similar-looking packages.",
          "Capture is getting a semester of dated items out of documents and systems and into one list. The raw material is a syllabus PDF, a course page nobody updates, an LMS that only knows about the assignments the professor bothered to create, and a paper handout from the first day. Capture is unglamorous and it is where most semesters actually go wrong, because a date that never got recorded cannot be missed by any planner.",
          "Tracking is keeping that list honest afterward and turning scores into a number that means something. Weighted averages, a grading scale with real cutoffs, a GPA that reflects credit hours rather than a flat mean. Tracking is the job that answers where do I stand, which is a different question from what should I do today.",
          "Scheduling is deciding when the work happens: blocking time, sequencing, protecting hours, predicting collisions. This is the job Shovel is built around — a time-blocked schedule across the semester, weighing available time against estimated time-per-task, plus The Cushion™ conflict alerts and reading-time estimators.",
          "Now write down which of the three actually broke for you last term, and be specific about it. \"I was disorganized\" is not a diagnosis. \"I missed two quiz dates that only ever existed in the syllabus PDF, never in Canvas\" is a capture failure. \"I knew every date and still did nothing until Sunday night\" is a scheduling failure. \"I walked into the final without knowing what I needed on it\" is a tracking failure. Those three sentences point at three different products, and only one of them points at Semora."
        ]
      },
      {
        "heading": "Seven questions worth asking before you subscribe to anything",
        "paragraphs": [
          "These are product-neutral. Ask them of Semora, ask them of whatever else is on your list, and ask them of the tool you are currently thinking about leaving — sometimes the honest answer is that you had it configured badly rather than that it was wrong for you.",
          "The last one deserves an extra beat. Annual pricing in this category is often quoted against a discounted monthly rate, which makes the saving look bigger than the decision actually is. Work out the real annual number, then divide it by the number of semesters you will actually use it. A tool you use for two 15-week terms a year is being paid for during 22 weeks when you are not in class."
        ],
        "bullets": [
          "Where does the data come from, and what happens in the week a professor posts a revised syllabus? Does the tool merge the change, duplicate everything, or make you redo the import?",
          "Does anything survive the term? Can you still read last spring next spring, or does the product assume you only care about the current 15 weeks?",
          "Does it compute a grade, or only a schedule? If it computes one, does it handle weighted categories and your course's actual letter cutoffs, or just average percentages?",
          "What is genuinely free, what is only capped rather than free, and what is gated behind the subscription? Those are three different things and marketing pages routinely blur them.",
          "Which LMS does your school actually run, and does connecting require your school to approve something? An integration your administrator has to enable is an integration you may never get.",
          "Which device has to fire the reminder, and does the reminder still work when the app is closed and the laptop is shut?",
          "What is the real annual cost after any introductory rate ends, and what happens to your data if you stop paying?"
        ]
      },
      {
        "heading": "Where Semora is the wrong answer",
        "paragraphs": [
          "It is worth being direct about this before describing what Semora does, because a page like this is otherwise just an advertisement wearing a guide's clothing. There are several kinds of student Semora serves badly, and for some of them Shovel is plainly the better tool.",
          "If you are on Android, stop here. Semora is one universal iOS app for iPhone and iPad, plus a web app. There is no Android build and no Mac app. You could run the web app in a mobile browser, but browser notifications only work while a tab is open rather than as real closed-tab push, and device calendar sync does not run in a browser at all. A deadline app that cannot reliably interrupt you is not doing its main job. Shovel has native iOS and Android apps.",
          "If time-blocking is the actual product you want, Semora is not a like-for-like swap. Semora's Smart Plan lays study sessions across a 14-day horizon and works around the class meeting times the scanner already captured. It is a rolling two-week study schedule, not a semester-wide engine that reconciles your total available hours against your estimated time-per-task. If The Cushion™ predictive conflict alerts, reading-time estimators, streak-based motivation tracking, or the free supplementary \"how to study\" courses are the specific reasons you subscribed in the first place, those are things Shovel does and Semora does not.",
          "If your school runs Brightspace, Semora's LMS import will not help you. Semora imports from Canvas, Blackboard, and Moodle on Pro, subject to school policy and platform configuration. Its current Canvas connector uses a personal access token you generate in Canvas and should be used only where your institution permits third-party token connections; if it is unavailable or not permitted, scan the syllabus or paste the assignment list into the web scanner. Google Classroom and Google Calendar sync are not shipped features today — do not plan around them. Shovel advertises read-only sync across Canvas, Brightspace, Moodle, and Google Classroom at once, auto-refreshing roughly every 24 hours, which is broader coverage than Semora offers.",
          "And if you are evaluating Semora's free tier as a permanent home, read the limits literally. Free is one AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand, and one semester total. Not one action a month, one, and not one semester at a time, one, enforced by a database trigger on the semesters table, so a free account cannot start a second term at all. If you carry five courses, or you want to still be reading this term's grades a year from now, free will not hold you. That is a real constraint, not a nudge."
        ],
        "bullets": [
          "Android users: no app, and browser notifications only fire while a tab is open.",
          "Students who want semester-wide time-blocking against estimated task durations as the core product.",
          "Schools on Brightspace, or anyone counting on Google Classroom sync.",
          "Anyone carrying five or more courses who wants to stay on the free tier.",
          "Anyone who needs multiple semesters of history without paying, since free is capped at one term.",
          "Anyone who specifically wants a Mac app or a built-in how-to-study curriculum."
        ]
      },
      {
        "heading": "What Semora does differently: the scan is the input step",
        "paragraphs": [
          "Semora treats capture as the primary job and builds everything else on top of what capture produced. There are four ways in. A camera photo of up to five pages per scan, within a 10MB budget, which handles the stapled syllabus your professor printed. A PDF upload. Drag-and-drop on the web. And pasted raw text between 20 and 60,000 characters, which is the underrated one — select a Canvas assignments page or a syllabus in a browser, copy it, paste it, and you get the same extraction without touching any integration.",
          "What comes out is structured, not just a summary. Course name and code, instructor, meeting blocks with days and rooms, office hours, semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading it can find, each with a due date, a due time, a percentage weight, and a confidence score.",
          "The review screen is where the design shows its hand. Anything the model is less than 0.8 confident about gets badged for you to verify. Anything dated outside the term you set is flagged, because a due date in the wrong year is the classic parsing failure. Items with no date at all land in a \"Needs a date\" group, deselected by default, so nothing reaches your calendar on a guess. You edit, deselect, and approve.",
          "One asymmetry worth knowing before your professor posts version two: on a course you are creating for the first time, the course record, its meeting times, and its grading scale are written immediately, and only the deadlines wait for your approval. On a re-scan into a course you already have, the deadlines merge in, but the meeting times are never overwritten and the grading scale is replaced only if you have left it on the default. That is a deliberate trade. The app would rather keep the corrections you made by hand than replace them with a fresh guess, which means a revision that moves your lecture room is still a manual edit on the course screen."
        ]
      },
      {
        "heading": "The gradebook is the part that is free",
        "paragraphs": [
          "This is the sharpest structural difference and the most common reason someone lands on this page. Grade tracking with weighted averages, plus your semester GPA, is on Semora's free tier, not as a teaser, and not a Pro feature wearing a free label. Grade tracking is not a feature Shovel's public materials describe as core to the product; its documented focus is converting deadlines into a study schedule rather than computing course grades. If your reason for leaving is that you never got a running number out of your planner, that gap is the whole answer.",
          "The math is specific enough to check. The scale runs A+ and A at 4.0, A- at 3.7, B+ 3.3, B 3.0, B- 2.7, C+ 2.3, C 2.0, C- 1.7, D+ 1.3, D 1.0, D- 0.7, and F at 0. GPA is the sum of grade points times credit hours, divided by the sum of credit hours. Credit hours default to 3 and clamp to a 0.5 minimum. A course with no letter grade yet is excluded from the calculation rather than counted as a zero, which is the behavior you want in week six when only one class has posted anything.",
          "Because the weights came off the syllabus during the scan rather than out of your memory, entering a score updates the weighted average immediately. The percentage you see reflects only what has actually been graded so far. Extra credit is treated as bonus by default: it lifts your percentage without growing the total you are being divided by, and the displayed grade tops out at 100%. A course you have set up with grading categories can switch that policy — count extra credit inside its own category instead, where it may lift that category above 100%, or ignore it in the calculation while keeping the work visible. On Pro, Progress Insights adds trend charts, CSV export, and a print view, and Grade Scale and Forecasting lets you adjust the cutoffs and run what-if calculations on a final. But the number itself, the one you check before deciding whether to skip a lecture, is free."
        ]
      },
      {
        "heading": "What planning looks like here, and what it costs",
        "paragraphs": [
          "Semora's planning layer is Pro, and it is worth understanding what it is before deciding whether it substitutes for what you had. Smart Plan generates a study schedule across a rolling 14-day horizon that adapts as deadlines move and works around the class times the scan already knows about. The Workload dashboard scores each dated task as its grade weight multiplied by a prep-effort factor (an exam counts three times, a project 2.5, a quiz 1.5, an assignment 1.2, a reading 1) so a week holding two exams reads as heavy even when the syllabus never printed a percentage next to them. That is how crunch weeks and exam-dense stretches surface before you walk into them.",
          "Academic Risk alerts watch three specific things and nothing else: a grade trending downward, work that has gone missing, and a week that is overloaded. Around that sit the study tools — flashcards with spaced repetition built from your own syllabus and notes, a focus timer with 15, 25, 45, and 50 minute sessions and 5, 10, or 15 minute breaks, and an AI tutor scoped to what it knows about your courses. Pro also covers unlimited courses and semesters with no cap on scans or any other AI action, Canvas, Blackboard, and Moodle import subject to school policy and platform configuration, hosting a Course Space for classmates, device calendar sync with .ics export, custom 1-day and 3-day reminder timing with quiet hours, and Progress Insights.",
          "Pro is $3.99 a month or $19.99 a year, which works out to about $1.67 a month annually. It is bought either with a card on the web, processed by Stripe, or inside the iOS app, and the entitlement applies to your whole account, web included. So signing up from a laptop works as well as signing up from a phone, and you pay once either way. For comparison, Shovel's official pages conflicted when checked August 9, 2026: its Pricing page showed a 7-day free trial followed by $9.79/month (with $19.99 also displayed) or $39/year, while its navigation-linked Buy page showed $33/month paid monthly or $16/month paid annually. Confirm the checkout amount.",
          "The free tier does not expire. There is no monthly counter to wait on either, because the one AI action is granted once for the life of the account rather than refilled, and the free features around it stay on for as long as you keep using the app. What it is instead is a single-term product: one AI action, one course you add by hand, one semester, and no second term without paying. Canvas is the part that is not rationed — connect it and every class you take arrives free, however many there are. Read that as the honest boundary rather than a growth tactic, because it is enforced in the database and will not bend."
        ]
      },
      {
        "heading": "Moving a semester across without paying for it first",
        "paragraphs": [
          "If Semora survives your own version of the questions above, the migration is cheap enough to test with a real semester rather than a demo. You do not need to export anything from your current tool, and you do not need to connect an LMS to try it.",
          "Take each syllabus and run it through whichever import path is least effort. If the PDF is on your laptop, drag it onto the web app. If it is a paper handout, photograph up to five pages in one pass — that counts as one scan, not five. If the dates only exist on a Canvas assignments page, select the text, copy it, and paste it into the scanner, which accepts anything from 20 to 60,000 characters and runs the same extraction. That paste route is also how a free account gets Canvas coursework in, and it remains the fallback when the current token-based connector is unavailable or not permitted; direct Canvas, Blackboard, and Moodle connections are Pro. A free account has one AI action to spend, so put your worst syllabus through first: that is the one where the extraction is worth judging, and scanning the other three is what Pro is for.",
          "Re-scanning a course you already have merges into it, matched by course code or by exact name when the syllabus has no code. That costs an AI action but not a course slot, which matters when the free cap is four. Joining a Course Space that a classmate is hosting is free too, though the course it imports does take one of your four slots, so count it. Hosting a space of your own is the part that needs Pro.",
          "The genuinely sensible thing to do, if you are undecided, is to run both for two weeks. Keep the tool you have doing the scheduling and put your worst syllabus through Semora to see whether the capture and the running grade are what was actually missing. Two weeks is enough to find out, and the scan itself costs nothing, because that is exactly what the one free AI action is for."
        ]
      },
      {
        "heading": "A short decision tree",
        "paragraphs": [
          "Reduced to its useful core, the choice looks like this. Stay where you are if the time-blocked schedule is working and the renewal price is one you would pay again knowingly — switching tools is itself a week of overhead, and a planner you have already trained yourself to open is worth something real.",
          "Look at Semora if your failure mode was capture or tracking rather than scheduling: dates buried in a PDF that never reached any calendar, or a semester where you never had a trustworthy running average. Look at it especially if you want the gradebook without a subscription, if you use Canvas and your institution permits third-party use of the current user-generated personal-token connection, which is a Pro feature, or if you want to split a course with classmates through a shared Course Space, where joining one is free and hosting one is Pro. When the Canvas connection is unavailable or not permitted, the syllabus-scan and pasted-assignment-list routes remain available.",
          "Keep looking elsewhere if you need Android, if you need Brightspace, if you need semester-wide time-blocking built on task-duration estimates, or if you need more than one term of history without paying. Those are not close calls, and there is no version of this page where pretending otherwise helps you.",
          "One last piece of process. Whatever you shortlist, check the current pricing page and the current App Store rating for each candidate yourself, on the day you decide. Prices in this category move, introductory rates expire, and Semora launched recently enough that it has no rating history to point you at, which is a fact worth weighing rather than one to talk around."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is Semora a drop-in replacement for Shovel?",
        "answer": "No, and it is better to know that now. Shovel's time-blocked scheduling, built from available time versus estimated time-per-task across the semester, is central to its product. Semora's equivalent is Smart Plan, a Pro feature that lays study sessions across a rolling 14-day horizon around your class times. If scheduling was the part that worked for you, Semora is a step sideways. If capture or grade tracking was the gap, it is a step forward."
      },
      {
        "question": "Does Semora connect to the same LMS platforms?",
        "answer": "Not the same set, and not on the same tier. Semora supports Canvas, Blackboard, and Moodle import on Pro. Its current Canvas connector uses a personal access token and should be used only where the institution permits it. If it is unavailable or not permitted, scan the syllabus or paste a Canvas assignment list into the web scanner. Shovel offers read-only sync across Canvas, Brightspace, Moodle, and Google Classroom simultaneously, auto-refreshing roughly every 24 hours. If your school runs Brightspace, that is a genuine point against Semora. Google Classroom sync is not a shipped Semora feature."
      },
      {
        "question": "Can I move a semester over without paying?",
        "answer": "Yes, within limits. The free tier gives you one AI action — a syllabus scan, a lecture recording, or a document turned into notes — and unlimited classes synced free from Canvas plus one course you add by hand, which is enough to put a real syllabus through and judge the extraction on your own material before paying anything. Deadline tracking, weighted grade tracking, semester GPA, and same-day reminders are all included, and connecting Canvas brings the rest of your load across free, however many classes it is. The hard boundary is that free covers one semester total, not one per term, so it is a single-term arrangement rather than a permanent one."
      },
      {
        "question": "Does Semora track my actual course grade?",
        "answer": "Yes, on the free tier. Weights come off the syllabus during the scan, so entering a score updates your weighted average immediately, and the percentage reflects only what has been graded so far. Extra credit is treated as bonus by default — it lifts the percentage without growing the total you are divided by, and the display tops out at 100%. Semester GPA uses credit hours rather than a flat mean, and courses without a letter yet are excluded rather than counted as zero. Grade tracking is not described as core in Shovel's public materials, which focus on scheduling instead."
      },
      {
        "question": "What does Semora cost compared with Shovel?",
        "answer": "Semora Pro is $3.99 a month or $19.99 a year, about $1.67 a month annually, bought with a card on the web or inside the iOS app and applied account-wide either way. Shovel's official pages conflicted when checked August 9, 2026: its Pricing page showed a 7-day free trial followed by $9.79/month (with $19.99 also displayed) or $39/year, while its navigation-linked Buy page showed $33/month paid monthly or $16/month paid annually. Confirm the checkout amount."
      },
      {
        "question": "I use Android. What are my options?",
        "answer": "Semora is not one of them, realistically. There is no Android app — Semora ships one universal iOS app for iPhone and iPad plus a web app. The web app runs in a mobile browser, but browser notifications only fire while a tab is open rather than as closed-tab push, and device calendar sync does not run in a browser. Shovel has native iOS and Android apps, which is the relevant difference here."
      },
      {
        "question": "What happens when a professor posts a revised syllabus?",
        "answer": "Re-scan it into the course you already have and the deadlines merge in, matched by course code or exact name. It costs an AI action but not a course slot. Two things deliberately do not change: your meeting times are never overwritten, and the grading scale is replaced only if you left it on the default. So a revision that moves your lecture room stays a manual edit on the course screen."
      }
    ]
  },
  "studyfetch-alternative": {
    "metaTitle": "StudyFetch Alternative: How to Pick the Right One",
    "metaDescription": "Looking for a StudyFetch alternative? The criteria that decide it, the four kinds of tool that replace it, and where Semora fits, plus where it does not.",
    "h1": "StudyFetch alternatives: choose by the job, not the feature list",
    "lede": "If you are shopping for a StudyFetch alternative, the deciding question is not which app has more features. It is which job you are hiring a tool to do, because this category splits into two jobs that look similar in a screenshot and feel nothing alike by week nine.",
    "intro": [
      "Almost nobody replaces a study app because it broke. They replace it because the semester moved on. In week two the problem is comprehension: this reading is dense, these slides are a mess, quiz me on them. By week seven the problem is coordination: four courses are producing work at the same time, two of them weight a midterm at 30 percent, and what you need is one list that says what is due, what it is worth, and what your grade does if you let it slide. A tool built for the first problem does not automatically become good at the second one.",
      "So this page is about the decision, not a scoreboard. It covers why students go looking, what to judge any candidate on, which categories of tool exist, what Semora does differently, and, plainly, which students Semora is a bad fit for. Everything stated here about StudyFetch is restated from the fact-checked record behind our Semora vs StudyFetch comparison, with its original caveats kept intact. Where something is reported by third parties rather than confirmed by StudyFetch, it is labeled that way."
    ],
    "sections": [
      {
        "heading": "Why students start looking for something else",
        "paragraphs": [
          "StudyFetch's published product information describes a materials-first platform built around Spark.E, a tutor that answers from your own uploaded course material (slides, PDFs, notes, photos, video, or audio) rather than the open internet. Around that core it generates flashcards, quizzes, practice and full-length exam simulations, essay feedback, narrated summaries, and explainer videos, and a Live Lecture Assistant turns class audio into real-time structured notes and a transcript. There is a calendar feature in there too: photograph a syllabus and Spark.E extracts events into a personal calendar with reminders and a spaced-repetition study plan. Per available descriptions, that works per upload rather than as automatic multi-course deadline aggregation, and it sits as one module inside a materials-centric product rather than as the organizing principle.",
          "Read that description and the common reasons for switching become predictable. None of them are indictments. They are mismatches between a tool's center of gravity and what your October looks like.",
          "If two or more of those describe your semester, you are not looking for a better version of the same tool. You are looking for a different category."
        ],
        "bullets": [
          "You need one aggregated list, not one upload at a time. When five courses each drop work in the same week, the value is in the merge, not in any individual document.",
          "You need a running gradebook. StudyFetch is not publicly confirmed to have a dedicated semester grade tracker; the grading-related features that are documented center on essay feedback and exam-simulation scoring.",
          "The LMS connection is not yours to make. StudyFetch documents an LTI 1.3 integration with Canvas, Blackboard, Schoology, D2L Brightspace, and Google Classroom, including roster sync, deployed by the institution rather than connected by an individual student. If your school has not deployed it, you cannot switch it on yourself.",
          "The price stopped matching your use. Third-party review sites, not StudyFetch's own pricing page, report a Base tier around $7.99 a month, a Premium tier around $11.99, a semester bundle around $49.99, and an annual plan around $99.99. Treat those as unverified and check the current pricing page. Paying for a lecture recorder and an exam simulator you stopped opening is a different calculation than paying for one you use daily.",
          "You stopped uploading. Every materials-first tool has the same dependency: it knows only what you feed it. In a heavy week, feeding it is the first habit to go."
        ]
      },
      {
        "heading": "Name the job before you shortlist anything",
        "paragraphs": [
          "There are two jobs in this category. The comprehension job is \"I do not understand this material and I need to.\" The coordination job is \"I do not know what is coming and it is going to hit me.\" At 1 a.m. both feel like the same panic. They are not, and the tools that solve them are built differently at the foundation, which is why a strong tool for one is usually only adequate at the other.",
          "There is a fast test. Open any candidate and ask where it shows you everything due in the next fourteen days, across every course, without you uploading anything first. If that view is the home screen, it is a coordination tool. If you have to go find it, or it only knows about the documents you personally fed it, it is a comprehension tool with a calendar inside. Neither answer is a flaw. It just tells you what you are holding.",
          "Then pick using last semester's worst moment. If your worst moment was sitting an exam you had read for but not understood, hire a comprehension tool. If it was learning on Sunday night that something was due Monday, or working out in December that a 25-percent paper you half-finished had already decided your grade, hire a coordination tool. Most students have had both. Pick for the failure that costs you the most points, and do the other job by hand."
        ]
      },
      {
        "heading": "Eight questions worth asking any alternative",
        "paragraphs": [
          "Feature lists are close to useless here, because every product in the category claims the same eight nouns. These questions separate them, and you can answer most of them in a free tier in under twenty minutes."
        ],
        "bullets": [
          "Does it aggregate across courses automatically, or does it work one document at a time? This is the single biggest structural difference between tools in this category.",
          "Who owns the LMS connection — you or your institution? Institution-deployed integrations are out of an individual student's hands, while student-level connections can still be restricted by institutional policies and platform configuration. Verify availability before subscribing; Semora's LMS import is part of Pro.",
          "Is there a weighted gradebook, and can it answer \"what do I need on the final\"? Deadline tracking without grade weights tells you what is due but not what matters.",
          "What happens when the professor posts version two of the syllabus in week three? Ask whether a re-import merges, duplicates, or overwrites edits you already made.",
          "Can the dates leave the app? Notifications on your lock screen, sync into your phone's calendar, an .ics file you can hand to something else. A plan trapped behind a login is a plan you will forget.",
          "What can the free tier actually finish, rather than just demo? A free tier that runs out mid-setup tells you nothing about whether the product works for you.",
          "Where does the subscription get billed, and how do you cancel it? Find this out before you subscribe, not in January. Anything bought through an app store is cancelled in that store's subscription settings, not by deleting the app.",
          "Does it run on the device you actually carry to class, and the one you write papers on? Web-only and mobile-only both create gaps, and check whether individual features differ between the two, because some do."
        ]
      },
      {
        "heading": "The four kinds of alternative, and who each one suits",
        "paragraphs": [
          "Almost everything you will find falls into one of four buckets. Knowing the bucket saves you from comparing a scalpel to a filing cabinet.",
          "There is a fifth option that people are embarrassed to consider: nothing. If you are taking two courses with four graded items each, a wall calendar and your phone's built-in reminders will beat any subscription. Software helps when the number of moving parts exceeds what you can hold in your head, which usually means four or more courses with weighted grading."
        ],
        "bullets": [
          "Materials-first AI study platforms. You upload course material and the tool turns it into study artifacts — summaries, flashcards, quizzes, practice exams, tutoring chat. This is the bucket StudyFetch's published description puts it in. Best for dense, content-heavy courses where your bottleneck is understanding and retaining material, and for anyone who learns by self-quizzing.",
          "Syllabus-first planners. The syllabus is the input and the whole semester is the output: deadlines, weights, grade math, a schedule. This is the bucket Semora is in. Best for four or five courses with weighted grading, where your bottleneck is knowing what is coming and what it costs you.",
          "Your LMS plus its own notification settings. Free, authoritative, and already installed at your school. The limit is that it only contains what instructors actually put in it, it rarely carries the grade weights printed in the syllabus, and it will not tell you that three courses have converged on the same Thursday.",
          "A general task manager plus a calendar app. Total control, zero extraction. The real cost is an evening of typing across four or five syllabi, every term, plus doing your own weighted grade math in a spreadsheet. Some students genuinely prefer this and should keep doing it."
        ]
      },
      {
        "heading": "Where Semora is the wrong answer",
        "paragraphs": [
          "Being useful about this decision means saying who should not switch to us. These are not roadmap items being coy about a date. They are what the app is today.",
          "The last one deserves an honest sentence rather than a bullet. Semora launched recently and has no meaningful public rating history, so you cannot evaluate it the way you would evaluate a product with thousands of reviews. What you can do is run the free tier against your own syllabus for a couple of weeks and judge the extraction on a course you actually take, which is better evidence than any star average anyway."
        ],
        "bullets": [
          "You are on Android. Semora is iPhone, iPad, and web. The web app works in an Android browser and covers scanning, deadlines, grades, and the .ics export, which downloads straight from the browser, but device calendar sync, the part that writes deadlines into your phone's own calendar app, does not run in a browser. Paying is not the obstacle — Pro can be bought with a card on the web as well as inside the iOS app. StudyFetch, by its published information, is on web, iOS, and Android.",
          "You want lecture capture. Semora does not record or transcribe class audio. Nothing in it replaces that.",
          "You want study material generated from arbitrary uploads. Semora's flashcards (Pro) come from your syllabus and notes you attach, and its AI tutor (Pro) is scoped to what it knows about your course (deadlines, grading scale, structure) rather than a pile of uploaded slides and recordings.",
          "Your courses are not schedule-shaped. Studio work, a thesis, research hours, or a self-paced course with no dated assignments give a syllabus scanner almost nothing to extract.",
          "You need more than one term on the free plan. Free is one semester total, enforced by a database trigger, not one semester at a time. You cannot start a second term without Pro or without deleting the first, and deleting cascades.",
          "You need the LMS connection without paying. Importing from Blackboard or Moodle is part of Pro, while Canvas is free and connection availability varies by institution. On free, or when direct Canvas import is unavailable, paste the assignments page into the scanner on the web app.",
          "You have no Apple device at all. Buying Pro is no longer the problem — a card on the web handles that — but scheduled reminders and device calendar sync belong to the iPhone and iPad app, and a browser tab cannot replace them.",
          "You want your school to deploy it centrally with roster sync. Semora is installed by students, one account at a time."
        ]
      },
      {
        "heading": "What Semora does differently, mechanically",
        "paragraphs": [
          "The organizing principle is that a syllabus already contains the semester, and the work is extracting it once instead of re-reading a PDF eleven times. There are four ways in: a camera photo of up to five pages per scan, held to a 10 MB budget checked as each page is added, a PDF upload, and — on the web app specifically — drag-and-drop or pasted text between 20 and 60,000 characters. That last path matters more than it sounds, because it is how you get a Canvas assignments page into the app on a free account: open the web app, select the text on your assignments page, paste it into the scanner, done. Just know it is web-only; there is no paste entry point on iPhone or iPad.",
          "One scan extracts the course name and code, the instructor, the meeting blocks, office hours, the semester start and end, the letter-grade scale, and every assignment, quiz, exam, project, and reading it can find with a due date, a due time, a percentage weight, and a confidence score. Then it splits what happens next. The course, its meeting times, and its grading scale are written immediately. Only the deadlines wait for you, on a review screen that badges anything under 0.8 confidence, flags anything dated outside the term, and drops undated items into a deselected \"Needs a date\" group. You are checking a machine's work on the twelve rows that are ambiguous, not retyping forty.",
          "Because the weights arrive with the deadlines, grade math works from the first score you enter. Semora computes a weighted average per course and a semester GPA on the standard 4.0 scale, weighting by credit hours that default to 3 and clamp to a half-credit minimum. A course with no letter grade yet is excluded from the GPA rather than counted as a zero, which is the difference between a number you can act on and a number that scares you in September for no reason.",
          "Two more mechanics decide whether the app survives contact with a real semester. Re-scanning a revised syllabus merges the new deadlines into the course you already have, without overwriting meeting times you edited and without replacing a grading scale you customized — your corrections outrank a fresh guess. Connecting a learning platform is a Pro feature. Semora's current Canvas connector uses a personal access token generated in Canvas, so availability and permitted use depend on your institution's token policy; Blackboard and Moodle setup also varies by school. If token use is unavailable or not permitted, use the paste route above on the web app. StudyFetch's Canvas support, by contrast, is documented as an institution-deployed LTI 1.3 integration with roster sync, which is a genuinely deeper hookup when your school has it and unavailable to you when it does not."
        ]
      },
      {
        "heading": "The parts that only start mattering in week nine",
        "paragraphs": [
          "Setup features sell apps. Week-nine features decide whether you keep one. Free covers knowing what is due and where you stand: full deadline and task tracking, weighted grades, semester GPA, same-day reminders, one AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand within one semester, one semester total, and joining a Course Space a classmate hosts. Pro, at $3.99 a month or $19.99 a year, is the layer that decides what to do about it.",
          "The Workload dashboard scores every dated task as its grade weight multiplied by a prep-effort factor (an exam counts triple, a project 2.5, a quiz 1.5, an assignment 1.2, a reading 1) so a week holding two exams reads as heavy even when the syllabus never printed a percentage beside them. Smart Plan lays study sessions across a fourteen-day horizon and works around the class times the scan already knows. Academic Risk watches three specific things: a grade trending down, work that has gone missing, and a week that is overloaded.",
          "The rest is connective tissue, and all of it sits on the Pro side of the line. Canvas, Blackboard, and Moodle import is subject to school policy and platform configuration. The current Canvas connector uses a personal access token you generate in Canvas; if your institution disables or prohibits third-party token use, scan the syllabus or paste the assignment list into the web scanner instead. Calendar sync writes deadlines into your device's calendar on iPhone and iPad, and the .ics export downloads from the web app as well, so the dates can leave either way. Custom reminder timing adds one-day and three-day advance notice with quiet hours, so a 3 a.m. push does not train you to swipe notifications away. Grade Scale and Forecasting answers what you need on the final. Flashcards generate from your syllabus and any notes you attach and come back on a spaced-repetition schedule, and the AI tutor answers from what it knows about that course rather than the open internet. Course Spaces lets one person host a shared course and invite classmates, with joining free for everyone invited, which means a study group needs exactly one Pro subscription between them. A focus timer runs 15, 25, 45, or 50 minute blocks with 5, 10, or 15 minute breaks."
        ]
      },
      {
        "heading": "Switching without losing a semester in the process",
        "paragraphs": [
          "Do the boring parts first. Cancel the old subscription in whichever store billed it, before the next renewal date rather than after, and screenshot or export anything you want to keep. Deleting an app never cancels a subscription. This is worth doing carefully in this category: third-party reports on StudyFetch's ratings vary by source and by when they were sampled — around 4.8 on the App Store from roughly 8,200 ratings and around 4.5 on Google Play, against Trustpilot snapshots ranging from about 3.9 across 241 reviews to about 4.1 across roughly 255, with the negative share concentrated on surprise charges and difficulty cancelling. Some reports also note the Android app is buggier than iOS. None of that is confirmed first-hand here, and it is the sort of thing worth checking current, for any subscription you are about to start or stop.",
          "Then budget the AI action. A free account gets exactly one, for the life of the account, so spend it on the syllabus you least want to retype rather than the tidiest one, and know that nothing refills it. Five photographed pages submitted in one pass counts as that one scan, not five — the constraint on that pass is the 10 MB budget, not the page count alone. Courses and AI actions are separate limits: re-scanning a syllabus into a course you already have spends an action but not a course slot. Watch your one hand-added course slot if a classmate invites you to a Course Space, because the course it imports takes one of the four.",
          "Then run a real test instead of a browse. Scan every syllabus in one sitting, in one evening, before the term gets loud. Enter every score you already have, including the ones you would rather not look at. Then leave it alone until week three and ask one question: did it tell you something you did not already know? A converged week you had not spotted, a percentage you had misremembered, an assignment that never made it onto your list. If the answer is yes, it is doing the coordination job. If the answer is no, your semester may be simple enough that you did not need software, and that is a legitimate finding.",
          "One last thing worth saying out loud: these two tools are not mutually exclusive, and for some students the honest answer is both. A materials-first platform for the two courses where the reading is genuinely hard, and a syllabus-first planner holding the semester-wide picture. If you can only justify one subscription, pick the one that matches the failure that costs you more, and do the other job manually for a term."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is Semora a direct replacement for StudyFetch?",
        "answer": "Not feature for feature, and it would be dishonest to say otherwise. They are organized around different jobs. If you are leaving because deadlines across five courses were scattered, because you wanted a running weighted gradebook, or because the price outgrew your use, Semora covers that. If you relied on lecture recording, exam simulations, or flashcards generated from uploaded slides and video, Semora does not do those things at all — its flashcards, a Pro feature, build from your syllabus and the notes you attach to a course."
      },
      {
        "question": "Can I use Semora alongside StudyFetch instead of switching?",
        "answer": "Yes, and for some students that is the better answer. The split is clean: a materials-first platform handles the courses where understanding the content is the bottleneck, while Semora holds the semester-wide picture of what is due, what it weighs, and where your grade stands. If you can only justify one subscription, choose based on which failure cost you more points last term, and handle the other job by hand."
      },
      {
        "question": "Does Semora work on Android?",
        "answer": "No native Android app. Semora runs on iPhone, iPad, and the web, sharing one account with near real-time sync. The web app opens in an Android browser and covers scanning, deadlines, grades, and the .ics export, which downloads straight from the browser. What does not run in a browser is device calendar sync, the part that writes your deadlines into the phone's own calendar app. Pro itself can be bought with a card on the web or inside the iOS app, and covers the whole account either way. StudyFetch, by its published information, is available on web, iOS, and Android."
      },
      {
        "question": "Does my school need to set anything up for Canvas sync?",
        "answer": "Possibly. Importing from Blackboard or Moodle is part of Pro, while Canvas is free. Semora's current Canvas connector uses a personal access token and should be used only where your institution permits third-party token connections. If it is unavailable or not permitted, copy the assignment list and paste it into the scanner on the web, or scan the syllabus instead. StudyFetch documents an LTI 1.3 integration with Canvas, Blackboard, Schoology, D2L Brightspace, and Google Classroom including roster sync, but it is deployed at the institution level rather than connected by an individual student."
      },
      {
        "question": "What does Semora cost compared with StudyFetch?",
        "answer": "Semora Pro is $3.99 a month or $19.99 a year, about $1.67 a month annually, bought with a card on the web or inside the iOS app and applied account-wide either way. StudyFetch's tiers are reported by third-party review sites rather than confirmed on its own pricing page: roughly $7.99 a month for Base, around $11.99 for Premium, about $49.99 for a semester bundle, and around $99.99 annually. Check its current pricing page before deciding."
      },
      {
        "question": "How much can I do on Semora's free tier before committing?",
        "answer": "Enough to judge it on your own courses. Free gives you one AI action for the life of the account, which is enough to put a real syllabus through, plus unlimited classes synced free from Canvas plus one course you add by hand, full deadline and task tracking, weighted grade tracking, your semester GPA, same-day reminders, and joining a Course Space a classmate hosts. What free does not include is LMS import — Canvas, Blackboard, and Moodle connections are Pro and subject to school policy and platform configuration, though you can paste an assignments page into the scanner on the web app instead. The one hard edge is that free covers one semester total, enforced at the database level, so it is a full term of use rather than a rolling allowance."
      },
      {
        "question": "What should I check before subscribing to anything in this category?",
        "answer": "Two things. Read the vendor's current pricing page rather than a review roundup, since reported figures drift. And find out where the subscription is billed so you know how to cancel it. Ratings are worth sampling from more than one source: third-party reports put StudyFetch around 4.8 on the App Store from roughly 8,200 ratings, while Trustpilot snapshots range from about 3.9 to 4.1, sampled at different times."
      }
    ]
  },
  "dormway-alternative": {
    "metaTitle": "DormWay Alternative: How to Pick a Syllabus Planner",
    "metaDescription": "Looking for a DormWay alternative? Compare what each planner is actually for, where Semora fits, where it doesn't, and how to test one in an afternoon.",
    "h1": "DormWay alternative: how to choose your next syllabus planner",
    "lede": "If you are searching for a DormWay alternative, you have probably already decided something and just want to know what else exists. This page covers the whole decision: the job you are actually hiring a planner to do, the kinds of student Semora suits badly, and what Semora does differently when it does fit.",
    "intro": [
      "Nobody searches for an alternative while everything is working. Something specific happened, or something specific never started happening. The useful version of this page is not a ranked list of ten apps; it is a way to name the gap you hit, so that whatever you switch to closes it instead of trading it for a different one.",
      "One ground rule about the comparison itself. Everything stated here about DormWay is restated from its own publicly available materials as of 2026, and where a product's exact behavior is not confirmed on its own site, treat it as unconfirmed rather than as fact. Check DormWay's own site directly before you decide anything on the strength of a feature list, including this one."
    ],
    "sections": [
      {
        "heading": "Start with the job you are actually hiring for",
        "paragraphs": [
          "A syllabus planner looks like one product and is really four jobs stacked on top of each other. Most bad switches happen when someone trades a tool that was strong at the first job for a tool that is strong at a third job they were never going to use. Naming the gap takes two minutes and it is the highest-leverage thing you can do before comparing anything.",
          "The four jobs, in the order they happen. Capture: getting a semester of dates out of a PDF and into software without typing them. List: keeping every course in one timeline you trust more than your memory. Schedule: turning that list into hours on specific evenings. Grade: knowing what average you are carrying right now, and what you need on what is left. Nearly every product in this category does capture. They diverge hard after that.",
          "There is a fifth job that does not fit the sequence and still decides plenty of switches: other people. A group project, a lab partner, three friends in the same section comparing what is due Thursday. If that is your reason for looking, it outranks everything above it, because a planner nobody else can see is a private to-do list."
        ],
        "bullets": [
          "Capture — can it read your messiest syllabus, the one with the reading schedule in a table and the exam dates buried in a paragraph?",
          "List — does every course land in one timeline, on the device you check first in the morning?",
          "Schedule — does it put study hours on specific days, or hand you dates and leave the planning to you?",
          "Grade — does it compute your running average from your professor's real weights, or just store the scores you type in?",
          "Forecast — can it tell you what you need on the work that is left to land the letter you want?",
          "Share — can you hand one course to a group without everyone re-entering it?",
          "Exit — can you get the semester back out as a file if you leave again?"
        ]
      },
      {
        "heading": "Your devices decide this before features do",
        "paragraphs": [
          "This is the least interesting criterion and the one that most often ends the conversation, so take it first. Semora is one universal iOS app for iPhone and iPad, plus a web app, sharing a single account with near real-time sync between them. There is no Mac app and no Android app. That is the entire list, and it is worth checking against your own hardware before you read another paragraph.",
          "DormWay's own materials state availability on web, iPhone, iPad, and Mac, with no Android app — the Android point is stated on DormWay's own blog. That reflects publicly stated features as of 2026, and anything not confirmed on its own site should be treated as unconfirmed.",
          "If your phone runs Android, neither of these gives you a native app, and that should settle the question before any feature comparison starts. Semora's web app does run in any modern browser on the same account, so an Android student is not shut out of the product. Two things do not survive the browser, though. Notifications fire only while a tab is open, so there is no closed-tab push. And device calendar sync does not run in a browser at all; the .ics export is the substitute, and it does work on the web — the export downloads the file straight from the browser.",
          "If you work primarily on a Mac, DormWay states availability on Mac and Semora has no Mac app at all. Semora's answer on a Mac is the web app, and it is a real answer (the scanner takes drag-and-drop and pasted text there, and the printable grade report is a Pro feature that exists only on the web) but a browser tab is not a dock icon. If that distinction matters to you, let it count."
        ]
      },
      {
        "heading": "A timeline is not a plan",
        "paragraphs": [
          "The most common version of this search goes like this: the app worked, every date is in there, and on a Tuesday night you still do not know what to start. That is not a capture failure. That is the gap between a list and a schedule, and it is the biggest fork in this category.",
          "A list answers what is due. A schedule answers what you are doing for the next ninety minutes. Getting from one to the other requires the software to know three things it is usually never told: how much each item is worth, how much effort its type demands, and how many hours you actually have this week. Weight is the one that goes missing most often, because it lives in the syllabus rather than in an assignment feed. An LMS entry tells you the paper is due Thursday. The syllabus is what tells you it is 25 percent of your grade.",
          "So when you evaluate any alternative, ask what it does with weight. If the answer is nothing, every deadline in your list is the same size, and no amount of AI layered on top will rank your week correctly.",
          "There is a related job worth naming separately, because it splits these two products more than the timeline does: asking software a question about a course's rules. DormWay states an \"Ace\" AI assistant that answers policy questions with citations back to the syllabus, plus a per-course \"Intelligence\" tab covering a difficulty rating, a weekly hour estimate, grading policy, and late-work rules. Semora's AI tutor is scoped to a course you have already scanned and is aimed at the material rather than at policy lookup. If \"what is the late penalty\" is the question you ask most often, that difference in emphasis belongs in your decision."
        ],
        "bullets": [
          "Does the parser pull percentage weights, or only dates and titles?",
          "Can you see and correct what the AI extracted before it becomes your calendar?",
          "Does it treat an exam differently from a reading when it estimates effort?",
          "When a professor moves a date, do you edit once, or re-import and clean up duplicates?",
          "Are the free limits published as numbers you can check against your own course load?",
          "If you pay on a phone, does the subscription apply on a laptop?"
        ]
      },
      {
        "heading": "Where Semora is the wrong answer",
        "paragraphs": [
          "A page like this is worth less if it cannot say who should skip. Here is the honest list, and none of it is hedged.",
          "One item on that list — the never-paying one — deserves a straight pointer rather than a dodge. DormWay states on its own site and App Store listing that it is currently free with no paid tier, using the phrasing \"no paywalls\" and \"no credit card.\" If never paying is a hard requirement rather than a preference, that statement is the thing to verify on DormWay's own site, and it is a legitimate reason to stay exactly where you are."
        ],
        "bullets": [
          "Android is your primary phone. There is no Android app, and the web app cannot push to a closed tab or write to your system calendar.",
          "You want a dedicated Mac app. Semora does not have one, and the web app is the only answer on offer.",
          "Your school runs Brightspace, D2L, Sakai, or anything outside Canvas, Blackboard, and Moodle. Semora's Pro LMS import covers those three subject to school policy and platform configuration. The fallback is real (paste your assignment list into the scanner on web, anywhere from 20 to 60,000 characters) but a paste is not a sync.",
          "Your professors post every assignment into the LMS in full and keep the dates current. Then syllabus scanning is solving a problem you do not have, and an LMS-first tool is less work.",
          "You want a long public track record before committing. Semora launched recently and does not have one.",
          "\"I will never pay for this\" is a hard requirement. Semora's free tier is genuinely usable, but it covers one semester per account, enforced by a database trigger rather than a client-side nudge. A second term is a paid decision."
        ]
      },
      {
        "heading": "What Semora does with a syllabus that a date list cannot",
        "paragraphs": [
          "Semora treats the syllabus as the record rather than as a seed for a task list. One pass pulls the course name and code, the instructor, the class meeting blocks with days, start and end times, kind and room, office hours, the semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading it can find, each with a due date, a due time, a percentage weight, and a confidence score. There are four ways in: a camera photo of up to five pages per scan on roughly a 10 MB budget, a PDF upload, drag-and-drop on the web, or pasted raw text.",
          "The weight is what everything above the list runs on. The workload dashboard scores each dated item as its extracted grade weight multiplied by a prep-effort factor for its type (an exam counts three times a reading at equal weight, a project 2.5 times, a quiz 1.5, an assignment 1.2) then buckets them into weeks. A week is called a crunch week only when it is a statistical outlier for your own semester: at or above your mean plus one standard deviation, and holding at least two items, so one big exam does not get labeled a crunch week on its own. Smart Plan lays study sessions across a rolling horizon and works around your class meetings rather than on top of them. Both are Pro.",
          "The free tier gives you capture and list without the analysis layer: one AI action to capture with, then full deadline and task tracking, your class schedule, grade tracking with weighted averages, semester GPA, and same-day reminders. Smart Plan, the workload dashboard, flashcards, the focus timer (15, 25, 45, or 50-minute blocks with 5, 10, or 15-minute breaks), the AI tutor, device calendar sync, and custom 1-day and 3-day reminder timing with quiet hours sit behind Pro."
        ]
      },
      {
        "heading": "Every extraction gets a review screen",
        "paragraphs": [
          "Any tool that reads a scanned PDF with AI is guessing some of the time. The question worth asking of every candidate is not whether it guesses; it is whether it shows you where. A planner that hides that fact and hands you forty confidently wrong dates is worse than no planner, because you will trust it and stop reading the syllabus.",
          "In Semora only deadlines wait for approval. On a course's first scan the course record, its meeting times, and its grading scale are written straight away, because those are stable facts you would have typed identically. The deadlines come up as a list you edit in place. Anything the model scored under 0.8 confidence is badged for verification. Anything dated well outside the term the scan extracted is badged as out of term. Anything the scan found but could not date drops into a separate \"Needs a date\" group, deselected, so an undated reading never quietly becomes a deadline for today.",
          "Re-scanning is more conservative still. A revised syllabus merges into the course you already have, matched by course code at a word boundary, CS 101 matches CS 101 and not CS 10, and it brings only deadlines through. Your meeting times and office hours are not rewritten, and an extracted letter scale is applied only if you never touched the default. It costs an AI action, not one of your course slots."
        ]
      },
      {
        "heading": "Grades, forecasting, and studying with other people",
        "paragraphs": [
          "Grade tracking is on Semora's free tier, and it runs on the weights the scan lifted off your syllabus rather than an average of whatever you typed in. The GPA math is the standard four-point scale — A and A+ at 4.0, A- at 3.7, B+ at 3.3, down to F at 0 — weighted by credit hours, which default to three and clamp at a half-hour minimum. A course with no letter yet is excluded from the GPA rather than counted as a zero, which is the behavior you want in week four.",
          "Pro adds the layer above that: grade scale customization and forecasting against the weight still in play, Progress Insights with trend charts and a CSV semester report, and Academic Risk alerts that watch for falling grades and missing work. For its part, DormWay states a GPA and grade calculator supporting weighted categories, letting you adjust weights and test grade scenarios. That is the piece where these two overlap most directly, so if scenario math is your main job, check it firsthand on DormWay's own site rather than taking either summary's word for it.",
          "The other-people job works like this. A Course Space in Semora is a shared course, with deadlines and group assignments syncing in real time between everyone in it. Joining one that a classmate invites you to is free. Hosting one is Pro. The split is deliberate: the person organizing the group pays, and the people they invite do not."
        ]
      },
      {
        "heading": "Free, paid, and what you are actually betting on",
        "paragraphs": [
          "Semora's free tier is three numbers: 1 AI action per account, unlimited classes synced free from Canvas plus one course you add by hand, and one semester per account. The AI action is granted once for the life of the account and never refills, so there is no monthly reset to wait for. The course cap is counted separately from it. The semester cap is the one people miss, and it is enforced in the database rather than only in the app. Pro is $3.99 a month or $19.99 a year, about $1.67 a month annually, and it removes the course and semester limits, replaces the single free AI action with a fair-use daily ceiling, and adds LMS import subject to school policy and platform configuration, Course Space hosting, Smart Plan, the workload dashboard, flashcards, the focus timer, the AI tutor, grade forecasting, device calendar sync with .ics export, custom reminder timing, Academic Risk alerts, and Progress Insights. It is bought with a card on the web or inside the iOS app, and applies account-wide either way.",
          "DormWay states that it is currently free with no paid tier, per its own pricing page and App Store listing. Its site also describes the product as built by students for students, highlights use by student-athletes and students with ADHD, and cites a figure of 6,134+ schools across the U.S. and Canada. Those figures come from DormWay's own site and have not been independently verified, so weigh them as marketing claims rather than confirmed statistics. Semora has nothing to put in that column either. It launched recently, and there is no usage history to point you at.",
          "A permanently free product and a free tier under a paid product are different bets, and it is fair to weigh them as bets. A free tier tells you how the paid version is funded and what happens when the developer needs revenue. A free product tells you neither of those things, favorably or unfavorably. With Semora the shape is at least unambiguous: free is one real term with your real courses, and everything after that first semester is a decision you make with a semester of evidence in hand."
        ]
      },
      {
        "heading": "How to test an alternative in one afternoon",
        "paragraphs": [
          "Switching planners costs you a lost afternoon in week two and a lost month in week ten. Do it early, during add/drop, and do it with your worst syllabus rather than your cleanest one. A tool that survives the ugly PDF will survive the rest of them.",
          "Be open to the result being stay. If the tool you already have captures every course and your real gap is that you never scheduled the hours, the fix may be a habit rather than a download. The reason to switch is a job your current tool does not do, named specifically, not a feature list that happens to look longer."
        ],
        "bullets": [
          "Scan the messiest syllabus you own, the one with the reading schedule in a table, and read the extracted output line by line. Count the corrections you have to make.",
          "Move a due date and watch what follows it. Reminders, calendar event, study plan, workload view — do they update, or do you now have two of everything?",
          "Enter three real scores and check the running average against your own arithmetic.",
          "Open it on the device you actually check first thing in the morning, not the one you like best.",
          "Export the semester before you commit to it. In Semora that is an .ics file of deadlines and weekly class meetings plus a CSV semester report, both Pro, with account deletion available in the app. Ask every candidate the same question.",
          "Set a date to decide. Two weeks is enough. If you are still maintaining the app instead of the app maintaining your semester, that is your answer."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is Semora free the way DormWay is?",
        "answer": "Not the same shape. DormWay states it is currently free with no paid tier, per its own pricing page and App Store listing. Semora has a free tier (one AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand, full deadline and task tracking, grade tracking with weighted averages, semester GPA, and same-day reminders) but it covers one semester per account, enforced in the database. A second term needs Pro, at $3.99 a month or $19.99 a year."
      },
      {
        "question": "I use an Android phone. Which one should I pick?",
        "answer": "Neither gives you a native Android app. DormWay states this on its own blog, and Semora has no Android build either. Semora's web app does run in any modern browser on the same account, so you can scan, track, and plan from an Android phone. One thing does not carry over: notifications fire only while a tab is open. Device calendar sync is iOS-only, but the .ics export works in the browser, so you can still push a semester into Google Calendar or Outlook."
      },
      {
        "question": "Can I move a whole semester over without retyping it?",
        "answer": "Yes, and there are four manual ways in: photograph up to five pages per scan, upload a PDF, drag it onto the web app, or paste raw text. Canvas, Blackboard, and Moodle import is a Pro feature. The current Canvas connector uses a personal access token and should be used only where your institution permits it; otherwise, use one of the manual routes."
      },
      {
        "question": "How does Semora's Canvas connection differ from DormWay's?",
        "answer": "Semora supports Canvas, Blackboard, and Moodle import on Pro. Its current Canvas connector uses a personal access token and may be disabled or prohibited by your institution. DormWay states read-only sync with those platforms, merged with parsed syllabi into one semester timeline and week view. Check both products against your school because connection availability can differ by institution."
      },
      {
        "question": "What stops the AI from putting a wrong date on my calendar?",
        "answer": "A review screen you have to pass through. Deadlines wait for your approval, while the course, its meeting times, and its grading scale are written immediately. Items scored under 0.8 confidence are badged for verification, items dated outside your term are badged as out of term, and anything the scan could not date sits deselected in a \"Needs a date\" group. You edit every item in place before a single deadline is saved."
      },
      {
        "question": "What if my school does not use Canvas, Blackboard, or Moodle?",
        "answer": "Then Semora's LMS import will not help you, and that is worth knowing before you start. The workaround is real but manual: open the assignments page in whatever system your school runs, select the list, and paste it into the scanner on the web app. You get the same extraction and the same review screen, having done the fetching yourself. The syllabus scan path works the same regardless of your LMS."
      },
      {
        "question": "Can I get my data back out if I switch again later?",
        "answer": "Yes. Semora exports a semester of deadlines and weekly class meetings as a standard .ics file for Google Calendar, Outlook, or Apple Calendar (on iPhone, iPad, and in the browser) and Progress Insights produces a CSV semester report plus a printable grade report on the web. Both are Pro features, and account deletion is available in the app. Ask any planner that question before you commit a term to it, rather than after."
      }
    ]
  },
  "mindgrasp-alternative": {
    "metaTitle": "Mindgrasp Alternative: How to Pick the Right One",
    "metaDescription": "Looking for a Mindgrasp alternative? The five kinds of tool that compete for the job, how to choose between them, and where Semora fits and where it does not.",
    "h1": "Mindgrasp alternatives: choose the tool that matches the job",
    "lede": "Most people searching for a Mindgrasp alternative are not unhappy with AI notes. The job changed underneath them. One dense reading became five courses, sixty due dates, and a grade nobody can calculate from memory. This page maps the kinds of alternative that exist, gives you a way to choose between them in an evening, and is direct about who Semora is wrong for.",
    "intro": [
      "There is a version of this page that just says \"switch to us.\" That version wastes your time, because the category people search out of and the category they need are often two different things, and a higher tier of the wrong shape of tool never fixes it. So the first half of this page is about the decision itself, including the cases where the answer is to keep what you have.",
      "One ground rule before anything else. Everything said here about Mindgrasp is restated from its own publicly available materials as of this writing, with the same hedging, and anything reported by third parties rather than the company is labeled that way. Where something could not be confirmed, this page says it could not be confirmed rather than filling the gap. Check both products at the source before you pay for either."
    ],
    "sections": [
      {
        "heading": "Why students start looking for an alternative",
        "paragraphs": [
          "The trigger is rarely that the AI was bad. It is usually that the unit of work moved. In week two you had one artifact (a lecture recording, a chapter, a slide deck) and you needed to understand it. By week seven you have five courses, a midterm stack, and no single place that knows what is due on Thursday. A tool built to work one file at a time is genuinely good at the first problem and structurally silent about the second. That is a scope, not a flaw.",
          "It is worth being precise about the scope in question. Mindgrasp takes an uploaded or linked piece of content (a PDF, DOCX, PowerPoint, MP3 or MP4, a YouTube video, a web article, or a lecture you record live) and generates a linked bundle of AI notes, a summary, flashcards, a quiz, and an AI Tutor chat about that content. A higher Scholar or Premium tier adds an AI math expert for step-by-step math help, and there is a Chrome extension for capturing content from the browser. Its marketing targets a broad range of learners: high school through graduate students, self-learners, professionals, and exam-prep candidates.",
          "What is not described in its publicly available materials is the semester layer. No dedicated syllabus-parsing or deadline-extraction feature was found in those materials, no grade-tracking feature is described in them, and no dedicated study-schedule or deadline-planning feature was found. It does state compatibility with Canvas, Blackboard, and Panopto, though that appears to be for importing or processing files from those platforms rather than parsing a syllabus for deadlines. If the thing you now need is a calendar with weights attached, that gap is the whole reason you are reading this.",
          "Three other triggers show up constantly, and none of them is really about output quality. The first is price and cadence: Mindgrasp's official plan picker, with Yearly selected on August 9, 2026, showed Basic at $5.99/month billed $71.88 once per year, Scholar at $8.99/month billed $107.88 once per year, and Premium at $10.99/month billed $131.88 once per year. The official site advertises a free trial; confirm the offer and any monthly-billing prices at checkout. The second is rhythm: a content-to-notes tool may get used in bursts around exams while a Yearly plan bills for a full year at once. The third is device. Mindgrasp ships an iOS app on the App Store published by Apricot AI, plus a web app and a Chrome extension; Android availability is unclear, and no dedicated Android app was found in the sources reviewed."
        ],
        "bullets": [
          "Your workload outgrew the file. One artifact at a time stopped being the unit you manage.",
          "You want the dates and the weights in one place, not a folder of separate outputs.",
          "The published Yearly prices may not match how often you use the tool, so compare the full billed amount rather than only the monthly equivalent.",
          "You use it hard for two weeks a term and pay for twelve months.",
          "The device you actually study on is not one the tool serves well."
        ]
      },
      {
        "heading": "Name the job you are hiring a tool to do",
        "paragraphs": [
          "Three different jobs get sold under the same phrase. The first is comprehension: take one hard artifact and make it understandable — notes, a summary, a quiz you can fail privately. The second is operations: run a term. What is due, what is it worth, what does that make your grade, and what should you do tonight. The third is retention: get facts to stick until the exam. These are not tiers of the same product. They are different shapes.",
          "Diagnose yours the boring way. Write down the last three assignments you turned in late, half-finished, or at three in the morning, and name the cause of each one. If the cause was that you did not understand the material, you have a comprehension problem and a file-first tool is the right shape — switching apps will not help you and you should stop shopping. If the cause was that you did not know it existed, or you knew and three other things landed the same week, you have an operations problem, and no amount of better summaries touches it.",
          "Most students who go looking for an alternative have quietly crossed from the first job to the second without noticing, because the crossing happens gradually and the symptom looks like dissatisfaction with a tool. Naming which job broke is the entire decision. Everything after it is detail."
        ]
      },
      {
        "heading": "The five kinds of alternative you will actually find",
        "paragraphs": [
          "Search results in this category flatten five very different products into one list. Knowing which one you are looking at saves more time than any feature table.",
          "Almost nobody is well served by one of these alone for a whole degree. The common ending is two tools, one per problem, which is usually cheaper than hunting for a single app that claims all three jobs and does the one you need worst."
        ],
        "bullets": [
          "Content-to-study-material generators. You feed in a file, a recording, or a link and get notes, flashcards, a quiz, and a chat about that content. Best when you have one hard artifact and a deadline tomorrow. Weakest when the thing you manage is a term rather than a document.",
          "Flashcard and spaced-repetition apps. Excellent for anatomy, languages, and anything with thousands of discrete facts. They will never tell you what is due, and they assume someone else decided what to study.",
          "LMS-connected planners. They mirror what your instructors publish in Canvas, Blackboard, or Moodle. Genuinely useful for work added mid-semester, and they inherit every gap in how your instructors use the platform — weight percentages, exam dates set in week one, reading schedules, and the letter-grade scale often never become an entry there.",
          "General task managers and note apps. Infinitely flexible, and the flexibility is the cost: you become the parser, typing forty dates by hand, and the system survives exactly as long as your discipline does.",
          "Syllabus-first planners. They read the authoritative document your professor handed out and build the term from it. Strongest when you have four or five courses with real syllabi. Weakest when your material is audio and video, or when there is no course document at all."
        ]
      },
      {
        "heading": "How to choose without a three-week trial marathon",
        "paragraphs": [
          "Four questions settle it faster than testing everything. How many courses are you running, one hard class and a job is a different problem from five courses and a lab. What format does your material arrive in — if most of what you study is a recorded lecture or a video, a scanner that reads text and images cannot help you, and that fact alone eliminates a category. Where do reminders have to fire — a scheduled notification on a phone is fired by the operating system whether the app is open or not, while a browser tab cannot make that promise, and browser notifications only fire while the tab is open. And is the free tier a count or a clock — a quota you can check against your own course load before you commit tells you far more than a countdown.",
          "Then run one evening of testing on the shortlist, using your own worst syllabus rather than your cleanest one. Any tool handles a well-formatted PDF from a large department. What you are measuring is what happens with the photocopy of a photocopy where the reading schedule is buried in a table, and whether the app admits when it is unsure.",
          "Do it in week one, while switching still costs you nothing but an hour."
        ],
        "bullets": [
          "Feed it your messiest course document first and check every extracted date against the source once.",
          "Move a due date and watch whether the item updates in place or quietly duplicates.",
          "Enter two scores in two differently weighted categories and check the running average against your own arithmetic.",
          "Sign in from a second device and confirm the edit you just made is already there.",
          "Find the export and the delete-account path before you commit four months to anything."
        ]
      },
      {
        "heading": "Who Semora is genuinely the wrong answer for",
        "paragraphs": [
          "This section exists because the alternative that fits you may not be this one, and finding that out in week nine is expensive. Semora is a syllabus-first planner for college coursework. Outside that shape it is either partial or useless, and here is where.",
          "The hardest case to argue with is the last one. Semora launched recently, so there is no long public rating history to point you at and none is going to be invented here. If you want a track record before you trust a semester to something, that is a reasonable thing to want and Semora does not have one yet. The free tier is the answer to that: it costs nothing, expires on no date, and lets you judge the extraction on your own syllabus before deciding anything."
        ],
        "bullets": [
          "Android is your only device. There is no Android app and no Mac app. The web app runs in a browser on one shared account, but scheduled reminders and device calendar sync are the iPhone and iPad app's job, and browser notifications only fire while a tab is open.",
          "Your material is audio and video. The scanner takes four inputs, and two of them exist only on the web app — a camera photo of up to five pages per scan on a roughly 10 MB budget, a PDF upload, and, on the web app specifically, drag-and-drop or pasted text between 20 and 60,000 characters. It cannot ingest an MP3, an MP4, a YouTube link, or a lecture recorded live, and there is no browser extension for capturing pages.",
          "There is no syllabus. Self-directed learners, professionals, and people preparing for a standardized or certification exam have no course document for the scanner to read. A tool that markets to that broader audience is a better fit than this one.",
          "You need more than one term without paying. A free account gets one semester, total (enforced by a database trigger, not a client-side nudge) so it will not roll over into spring.",
          "You are counting on Google Classroom or Google Calendar sync. Both exist in the codebase and neither is shipped. Do not plan around them."
        ]
      },
      {
        "heading": "What Semora actually does with a syllabus",
        "paragraphs": [
          "If the job you named was operations, here is the mechanic, because the difference between these tools is not AI quality. It is what the AI is pointed at and what it leaves behind. Semora reads one specific document and writes durable structure out of it: the course name and code, the instructor, class meeting blocks with days, start and end times, kind and room, office hours, the semester start and end dates, the letter-grade scale, and every assignment, quiz, exam, project, and reading it can find, each with a due date, a due time, a percentage weight, and a confidence score. That structure is the thing you keep and edit for four months.",
          "The write happens in two stages on purpose. The course, its meeting times, and its grading scale are saved as soon as the scan finishes, because those are rarely contested and you want them on your schedule immediately. Only deadlines wait for approval. The review screen lists every extracted item with per-item editing, badges anything the model scored under 0.8 confidence as low confidence to verify, badges anything dated outside your term as a date to double-check, and parks undated items like a final exam marked TBA in their own \"Needs a date\" group, deselected, so an invented date never reaches your calendar.",
          "Re-scanning behaves differently from a first scan, which is worth knowing before your professor posts version two. A revised syllabus merges into the course you already have (matched by course code, or by exact name when there is no code) and brings the deadlines with it. It will not overwrite the schedule you have already corrected: meeting and office-hour rows are written on first creation only, and the grading scale is replaced only if you have left it on the default. The version that gets saved is the one you edited, not the one the model guessed."
        ]
      },
      {
        "heading": "What becomes possible once the dates exist",
        "paragraphs": [
          "Every deadline carries a task type and a percentage weight read off the syllabus, and those two fields are what let one scan drive several views instead of one flat list. Grades come first. The running course grade is a weighted average computed against your professor's actual rules (grade categories, drop-lowest policies, an extra-credit setting) and converted to a letter using the scale the scan lifted from the page. Weighted course grades and a semester GPA are both on the free tier. Pro adds forecasting: for each letter on your scale, the average you would need across the weight still in play, labeled from locked in through out of reach, plus a final-exam what-if that projects a course grade without saving anything.",
          "Planning reads the same fields. The Pro Workload dashboard buckets incomplete dated work into ISO weeks and scores each week by weight times a prep multiplier (exams count triple, projects 2.5x, quizzes 1.5x, assignments 1.2x, readings 1x) then flags a week as crunch only when it is a genuine outlier: a full standard deviation above your own semester mean, holding at least two items. Smart Plan, also Pro, lays study sessions across a rolling 14-day horizon using a daily budget of 60, 90, 120, or 180 minutes and sessions of 25, 45, or 50, working around your class meetings rather than on top of them. Missed sessions are rescheduled and labeled with the date they moved from, and when the work genuinely will not fit your budget the plan reports those minutes as at risk instead of quietly overbooking you.",
          "Then a date moves, which is where a planner earns its place or becomes another thing to maintain. You change it once, on whichever device is in your hand. Reminders for that task are cancelled and rebuilt — same-day on free, plus 1-day and 3-day advance notices with quiet hours on Pro. The device calendar event refreshes if calendar sync is on, which is Pro and writes to the calendar on your iPhone or iPad rather than inside a browser tab, though the .ics export downloads on web perfectly well. The week scoring recomputes and can clear a crunch week or create one. Academic Risk alerts, also Pro, watch three specific signals: overdue work; a course whose last three graded items average seven or more points below the three before them or sits under 70 percent; and an overloaded week, which means five or more deadlines inside the next seven days, or three or more when their combined weighted load is high enough. Each arrives with a first step rather than a red badge."
        ]
      },
      {
        "heading": "The study layer, and exactly where it stops",
        "paragraphs": [
          "Semora is not only a calendar, and pretending otherwise would misrepresent the overlap. Pro includes AI-generated flashcards built from your syllabus and any notes you attach, reviewed on a spaced-repetition schedule; an AI tutor chat grounded in that same syllabus, those notes, and your deadlines; and a focus timer with 15, 25, 45, and 50-minute work blocks and 5, 10, or 15-minute breaks. Course Spaces let a classmate share a course so shared deadlines sync in real time — hosting a space is Pro, joining one someone invites you to is free, and the course it brings in counts against your four.",
          "Now the stop. All of that is scoped to a course you have already scanned. There is no path for a two-hour lecture recording, a YouTube link, an MP3, or a page captured from your browser, because the scanner reads documents, images, and pasted text and nothing else. If your central need is turning recordings and videos into study material, a content-to-study-material tool is doing something Semora does not attempt, and no tier changes that.",
          "Which is why the honest recommendation for a lot of people is both, not either. Run the semester in a syllabus-first planner and keep a file-first generator for the individual lectures and readings that need unpacking. Nothing about the two is mutually exclusive, and the combined monthly cost is often lower than people assume."
        ]
      },
      {
        "heading": "What it costs, and what free actually holds",
        "paragraphs": [
          "Semora's free tier is three numbers you can check against your own course load: 1 AI action per account, unlimited classes synced free from Canvas plus one course you add by hand, and 1 semester per account. With that you get full deadline and task tracking, grade tracking with weighted averages, a semester GPA, same-day reminders, and joining a Course Space. Nothing expires on a date, and nothing refills either: the AI action is granted once for the life of the account rather than once a month, so spend it on the syllabus you least want to retype. Everything you add or correct by hand afterwards is unlimited. A second scan, or a fifth course, is where Pro starts.",
          "Pro is $3.99 a month or $19.99 a year, about $1.67 a month on the annual plan. It lifts the course and semester ceilings, replaces the single free AI action with unlimited scans, a fair-use daily ceiling of 20 scans remains, and adds Canvas, Blackboard, and Moodle import subject to school policy and platform configuration, Smart Plan, the Workload dashboard, flashcards, the focus timer, the AI tutor, Grade Scale and Forecasting, calendar sync with .ics export, custom reminder timing, Academic Risk alerts, Progress Insights, hosting Course Spaces, and Share and Streaks. The purchase happens once — with a card on the web, processed by Stripe, or inside the iOS app — and applies to your whole account, the iPhone, iPad and web app all reading and refreshing the same entitlement rather than charging you a second time.",
          "Canvas import is a Pro feature. The current connector uses a personal access token and should be used only where your institution permits third-party token connections. If it is unavailable or not permitted, scan the syllabus or use the manual assignment-list route. That fallback lives on the web app because pasting text is a web-only entry point: open your Canvas assignments page in a browser, select the list, and paste it into the scanner. You get the same extraction and the same review screen, having simply done the fetching yourself. On an iPhone or iPad there is no paste path, so save or print the Canvas page to a PDF and upload the file.",
          "Set that against the other side carefully. Mindgrasp's official plan picker, with Yearly selected on August 9, 2026, showed Basic at $5.99/month billed $71.88 once per year, Scholar at $8.99/month billed $107.88 once per year, and Premium at $10.99/month billed $131.88 once per year. The official site advertises a free trial; confirm the offer, checkout total, and any monthly-billing prices before deciding on cost."
        ]
      }
    ],
    "faq": [
      {
        "question": "Is Semora a drop-in replacement for Mindgrasp?",
        "answer": "No, and it would be misleading to say otherwise. Mindgrasp turns an uploaded document, video, or recording into notes, flashcards, a quiz, and a chat about that content. Semora reads a syllabus and builds a term out of it — deadlines with weights, a class schedule, a weighted grade, and planning on top. If the job you need done is comprehension of one artifact, switching to Semora will not help you."
      },
      {
        "question": "Can Semora turn a lecture recording or a YouTube video into notes?",
        "answer": "No. The scanner accepts four inputs: a camera photo of up to five pages per scan, a PDF upload, and — on the web app only — drag-and-drop and pasted text between 20 and 60,000 characters. There is no audio or video ingestion, no YouTube link handling, and no browser extension. If most of your material arrives as recordings, keep a content-to-study-material tool for that job — the two are not mutually exclusive."
      },
      {
        "question": "What do I get without paying, and what is the catch?",
        "answer": "One AI action for the life of the account, unlimited classes synced free from Canvas plus one course you add by hand, full deadline and task tracking, grade tracking with weighted averages, a semester GPA, same-day reminders, and joining a Course Space a classmate shares. Nothing expires on a date, and nothing refills either. The catch is stated plainly: that one action is not per month, it is per account, and a free account gets one semester total, enforced by a database trigger, so the one hand-added course does not refresh in January. Canvas classes sit outside all of it — free and uncapped. Pro lifts the rest."
      },
      {
        "question": "Does Semora run on Android or a Mac?",
        "answer": "There is no Android app and no Mac app. Semora is one universal iOS app covering iPhone and iPad, plus a web app, sharing one account with near real-time sync. You can use the web app in a browser on any device, but scheduled reminders and device calendar sync belong to the iOS app — a browser cannot write to your system calendar, and web notifications only fire while the tab is open. It works the other way too: drag-and-drop and pasted-text scanning are web-only, and the .ics export downloads in the browser."
      },
      {
        "question": "How do I know the scanner read my dates correctly?",
        "answer": "You check them once, on a review screen, before anything is saved. Every extracted deadline is listed and individually editable. Anything scored under 0.8 confidence is badged for verification, anything dated outside your semester window is flagged as a date to double-check, and undated items sit deselected in a separate \"Needs a date\" group so nothing dateless slips through. Verify against the source document in week one, not week nine."
      },
      {
        "question": "Which one is cheaper?",
        "answer": "Semora's price is confirmed directly: free, or Pro at $3.99 a month or $19.99 a year. Mindgrasp's official plan picker, with Yearly selected on August 9, 2026, showed Basic at $5.99/month billed $71.88 once per year, Scholar at $8.99/month billed $107.88 once per year, and Premium at $10.99/month billed $131.88 once per year. Semora's listed monthly and annual prices are lower, but confirm Mindgrasp's current offer and billing cadence at checkout."
      },
      {
        "question": "Can I use both instead of choosing?",
        "answer": "Yes, and for a lot of students that is the better answer. A syllabus-first planner handles the semester — what is due, what it is worth, what your grade is, what to do tonight. A file-first generator handles the individual lecture or reading that needs unpacking. They solve different problems and neither blocks the other. Decide by which failure is actually costing you marks right now."
      }
    ]
  },
  "about": {
    "metaTitle": "About Semora: Who Builds It and How It Works",
    "metaDescription": "Semora is an independently built syllabus scanner and academic planner for college students. How it works, how your data is handled, and who to email.",
    "h1": "About Semora",
    "lede": "Semora is an independently built syllabus scanner and academic planner for college students. This page covers what it does, why it starts with the syllabus, how it is built, how it is paid for, and the standard every claim on this website is held to.",
    "intro": [
      "Semora turns a course syllabus into a working semester. You photograph it, upload the PDF, or paste the text on the web app, and you get back the course, the instructor, the class meeting blocks, the term dates, the letter-grade cutoffs, and every assignment, quiz, exam, project and reading it can find, each with a due date and its weight toward your final grade. You review that list, approve it, and the rest of the app — the calendar, the grade math, the planning tools — reads what the scan produced. It runs as one universal iOS app on iPhone and iPad plus a web app in any browser, on one account, syncing in near real time.",
      "That is the whole product in three sentences. This page is about everything around it: the specific problem it was built for, why it starts with a syllabus rather than a learning management system, where your data physically sits and who can read it, how the free limits are enforced, how the subscription pays for the parts that cost money, and how this website is written.",
      "One thing to state up front, because it changes how you should read the rest. Semora is new and it is small. It went live on the App Store in spring 2026. There are no user numbers, no press coverage and no awards to cite here, and this site does not quote reviews or testimonials. What follows is a description of a product and a method, not a track record."
    ],
    "sections": [
      {
        "heading": "The problem it was built for",
        "paragraphs": [
          "Every date you need for the next four months is already written down before the term starts. That is the strange thing about a college semester. The midterm date, the final project weight, whether Friday is a lecture or a lab, what percentage the participation grade is worth — all of it is printed in a document your professor handed you in week one. The information problem is solved. The transcription problem is not.",
          "Because that is what standing between you and an organized semester actually is: transcription. Four or five syllabi, eight to twenty pages each, and the dates you need are scattered between the attendance policy and the academic-integrity statement. Copying them into a calendar by hand takes an evening you do not have in the first week of term, so almost nobody does it. The PDFs stay in the email attachment. The dates live in your head.",
          "The failure that follows is not forgetfulness, and it does not happen in week one. It happens in week six, when two exams land in the same 48 hours and a project you half-remembered turns out to be worth 25 percent. By then the problem is not that you did not know — it is that you never saw the shape of the term, so you could not have started earlier even if you had wanted to.",
          "So Semora is built around deleting the transcription step and nothing else. You handle each syllabus once, in about the time it takes to photograph five pages. What comes out is not a summary or a chat window: it is structured rows (dated deadlines with weights, meeting blocks with days and rooms, letter-grade cutoffs) because rows are what a calendar, a weighted average and a workload calculation can actually be built on. Everything else the app does is downstream of that one step."
        ],
        "bullets": [
          "The input is whatever you have, and it differs by surface: on iPhone and iPad, a photo of up to five pages or a PDF picked from Files; on the web app, a drag-and-dropped file or text pasted straight into the scanner, between 20 and 60,000 characters. The paste path is web-only, because that is the surface with a keyboard and a clipboard rather than a camera.",
          "A photo scan carries a size budget of 10 MB across all its pages, checked in the app as each page is added, so you find out one page early rather than after capturing everything.",
          "The output is structured: course and instructor, meeting and office-hour blocks, term start and end, the grading scale, and every dated item with a type, a weight and a confidence score.",
          "Nothing about your deadlines saves silently. The course, its meeting times and its grading scale are written for you; the deadlines wait on a review screen where you edit, deselect and approve them.",
          "Anything the model was unsure about is badged rather than hidden — items scored under 0.8 confidence, and dates that fall outside the term.",
          "Undated items are not thrown away and not given an invented date. They sit deselected in a group called \"Needs a date.\""
        ]
      },
      {
        "heading": "Why syllabus-first rather than LMS-first",
        "paragraphs": [
          "The obvious alternative is to read Canvas. Plenty of planners do exactly that, and it is a reasonable design — the assignments are already there, already dated, already tied to a course. Semora starts somewhere else on purpose, and the reason is worth stating precisely rather than as a slogan.",
          "A learning management system tells you what has been posted. A syllabus tells you what is coming. In week one, a Canvas course page is frequently close to empty; the term is real but the assignments have not been created yet. The syllabus, on the other hand, is complete on day one by definition, because a professor has to publish the whole term's plan before it starts. If the point is to see the shape of the semester before it happens, the syllabus is the only document that contains it.",
          "The syllabus also carries things a course page usually does not. Percentage weights per item, which is what makes a weighted average possible at all — a grade tracker that does not know the midterm is worth 30 percent is just a list of scores. The letter-grade cutoffs your specific professor uses, which is what turns 87.4 into a B+ rather than a guess. The meeting blocks with days, times and rooms, and the office hours, including the by-appointment ones with a location and no fixed days. Term start and end dates, which is how a date that parses to next February gets flagged as suspicious instead of quietly filed.",
          "There is a second reason, and it is structural rather than editorial. Building on someone else's platform means availability depends on that platform and the institution running it. Semora supports Canvas, Blackboard, and Moodle import as a Pro feature. Its current Canvas connector uses a personal access token and should be used only where the institution permits third-party token connections. If it is unavailable or not permitted, scan the syllabus or paste the assignment list into the web scanner. An LMS connection is a useful second input; it is a poor foundation for the product.",
          "If you are on the free tier and your deadlines live in Canvas anyway, there is a path that costs nothing: sign in to the web app on a laptop, open your Canvas assignments page, select the text, and paste it into the scanner there. Same extraction, same review screen, and on free it spends your one AI action. It is the web app specifically, because pasting text is not an entry point on iPhone or iPad."
        ]
      },
      {
        "heading": "How it is built",
        "paragraphs": [
          "The apps are one codebase. React Native through Expo compiles to a universal iOS app that runs on iPhone and iPad, and the same source builds the web app you sign in to in a browser. That is why the surfaces do not drift apart: a fix to the grade math is a fix everywhere, not three separate implementations that disagree in the third decimal place. The surfaces differ only where the hardware differs — the camera and device calendar sync on iOS, drag-and-drop and pasted text on the web.",
          "Data sits in Postgres on Supabase, with authentication handled by the same service. Anything that costs money or must not be trusted to the device runs server-side in an edge function: the syllabus parse, the tutor, flashcard generation, LMS import, receipt validation. The client asks; the server decides.",
          "The extraction itself uses OpenAI GPT-5.6 Luna through the Responses API. The model is not asked for prose. It is asked for one structured JSON object with named fields, and every field is validated on the server before it reaches your account, so an unparseable date becomes a null you can fix on the review screen rather than a corrupt row inside your course. Each call is logged with its outcome, which is also how the scan quota is counted.",
          "None of that is exotic. It is worth writing down because the architecture is the reason for two things you can actually observe: the free limits behave identically on iPhone, iPad and web, and a Pro-only feature cannot be turned on by a client that decides to skip a check."
        ]
      },
      {
        "heading": "Where your data lives and who can read it",
        "paragraphs": [
          "Your account data — semesters, courses, deadlines, grades, notes — lives in a Postgres database with row-level security switched on for every personal table. In practice that means each table carries a policy comparing your authenticated user id to the row's owner, so a request for somebody else's rows does not return a permission error to work around; it returns nothing at all. That check happens in the database, underneath the API, so it holds regardless of what a client sends.",
          "Files you upload are handled the same way. Syllabi and course notes go into private storage buckets where the path begins with your own user id, and the read policy requires that folder to match the account making the request. Syllabus documents routinely contain names, emails, office locations and schedules, which is exactly the kind of content that should never sit behind a guessable public URL.",
          "Syllabus content and any notes you attach are sent to the OpenAI API for processing by GPT-5.6 Luna. OpenAI states that API data is not used to train its models unless a customer explicitly opts in. Semora disables response storage, while OpenAI may still retain abuse-monitoring logs for up to 30 days unless a stricter retention control applies.",
          "Product analytics are deliberately blunt. Events are app-level (a scan completed, a paywall viewed) and they are tagged with a random identifier generated on first install. There is no user id on those rows, so usage data is not tied to your account, your name or your email. It is enough to know which screens are used and where people get stuck, and not enough to reconstruct a person.",
          "Deleting is self-serve and permanent. Settings has a Delete Account screen that requires a hardware identity check (Face ID, Touch ID or your passcode) and a fresh sign-in before anything happens, because an irreversible action should not be reachable by anyone with thirty seconds of physical access to your phone. It then removes your uploaded files, deletes your rows, and deletes the auth user itself. Nothing is archived and nothing is recoverable afterward, which is the point."
        ],
        "bullets": [
          "Row-level security on every personal table, scoped to your authenticated user id.",
          "Private storage buckets for syllabi and course notes, path-scoped to your account folder.",
          "Syllabus and note content sent to OpenAI for processing with response storage disabled; API data is not used for training unless explicitly opted in.",
          "Semora session tokens use the device's secure storage on iOS.",
          "Anonymous, device-scoped analytics with no user id attached.",
          "In-app account deletion behind a biometric or passcode check plus a fresh sign-in. Files, rows and the account itself, all removed."
        ]
      },
      {
        "heading": "The limits are enforced in the database, not just in the interface",
        "paragraphs": [
          "This belongs on an About page rather than a pricing page, because it is a statement about how the product treats you rather than what it costs. The free tier's limits are not screens that hide buttons. They are database triggers.",
          "A free account gets 1 AI action for the life of the account — a syllabus scan, a lecture recording, or a document turned into notes, whichever you reach for first — unlimited classes synced free from Canvas plus one course you add by hand, and one semester in total. That one action is checked in three separate places: in the app, in the parsing function on the server before any paid extraction runs, and again by a trigger on insert. The course limit and the semester limit are checked in two: in the app, and by a BEFORE INSERT trigger that refuses the row outright. Pro replaces the single action with one fair-use ceiling, around 20 scans in any rolling 24 hours, which exists to stop scripted abuse of a paid endpoint and which a normal term does not approach.",
          "This cuts in both directions, and that is why it is worth telling you. It means nobody gets Pro features by patching a client, which is the part that keeps the price at $3.99 a month. It also means the limits are exactly what this site says they are, with no quiet grace period and no soft edge, including the one that is genuinely unflattering. One semester means one, for the life of the account, not one at a time. A free account cannot start a second term in January. The only way to free that slot is to delete the finished semester, which cascades through its courses, deadlines and grades and archives nothing.",
          "We would rather you read that sentence here than discover it in January. A limit you find out about at the moment it blocks you is a bad experience regardless of how reasonable the limit is."
        ]
      },
      {
        "heading": "The editorial standard for this website",
        "paragraphs": [
          "Marketing pages drift from products. It happens honestly — a feature moves behind a paywall, a limit changes, and the page describing it was written six months earlier by someone reading a different page. So this site is written against the shipping source instead of against other marketing copy. When a page here says a feature is Pro, that claim was checked against the actual gate: the server-side entitlement check, the database migration, the constant in the file. When it states a number, the number came from the code that enforces it.",
          "That method is not decoration, and the proof is that it caught real errors. On the first pass, four separate tier claims on this site were wrong, all four in the flattering direction, and all four were corrected against the app: whether Canvas import is free, whether hosting a Course Space is free, whether device calendar sync is free, and the one-semester cap on free accounts. Each of those would have been a student installing the app on a promise and hitting a paywall at the first tap.",
          "The same standard requires disclosing limits that do not help us. That free is one semester in total. That the fifth course stops you whether it arrives by scan, by hand, or by joining a classmate's Course Space. That hosting a Course Space is Pro, while joining one is free. That device calendar sync writes to your phone's calendar and does not run in a browser, where the equivalent is downloading an .ics file, which the web app does do. That Pro is sold two ways — with a card on the web through Stripe, or inside the iOS app — with no free trial on the web checkout, and that you cancel wherever you bought it: from Settings inside Semora for a card subscription, through your Apple ID settings for an App Store one.",
          "Comparison pages carry an extra rule, because they describe products we do not build. Every factual claim about a named competitor comes from that company's own site or store listing, is attributed as such, and is hedged where the behavior is not publicly confirmed — those rows say so in the table rather than guessing. Nothing about a competitor is inferred, and nothing is invented to make a column look worse. Where a competitor is genuinely better on a point, including on price, the page says so.",
          "And there is a rule about what this site will never contain. No testimonials, no star ratings, no user counts, no university logos, no awards, no press quotes. Not as a stylistic choice — those things simply do not exist yet, and inventing them is the single most common way a new product lies. If you find an error anywhere on this site, email it and it gets fixed."
        ]
      },
      {
        "heading": "How Semora is paid for",
        "paragraphs": [
          "One subscription, two prices, two ways to buy it. Pro is $3.99 a month or $19.99 a year, which works out to about $1.67 a month. You can pay by card on the web at app.semoraai.com, where Stripe processes the payment, or buy it inside the iOS app through Apple's StoreKit. Either way the entitlement attaches to your account rather than your device, so signing in on iPhone, iPad or the web with the same account turns Pro on there with no second charge and nothing to activate. Cancelling follows the same split: a card subscription is managed from Manage Semora Plan in Settings, which opens Stripe's billing portal, and an App Store subscription is cancelled through your Apple ID settings, at least 24 hours before the period ends.",
          "That is the entire business model. There are no ads anywhere in the app or on this site, and no advertising SDK in the build. Your data is not sold, brokered or shared with data partners — the third parties involved are the ones required to run the thing, and they are listed in the privacy policy: the database and auth provider, the AI processing API, the speech-to-text API used only if you record a lecture, Apple and Stripe for purchases, and the push delivery service.",
          "It is also worth being straightforward about why the free tier is metered the way it is. Every scan is a paid model call, and so is every tutor answer and every generated flashcard deck. Those costs are per use, not per user, which is why the free limit lands on the AI actions rather than on the parts that cost nothing to run. Deadlines, tasks and subtasks are unlimited on free and always have been. Grade tracking, weighted averages and semester GPA are free. Same-day reminders are free. Joining a Course Space a classmate hosts is free, permanently.",
          "The free tier has no expiry date, either. The one AI action is granted once for the life of the account rather than refilled on the 1st of the month, and the free features around it do not degrade if you never subscribe. If you subscribe and then stop, nothing is deleted. Your courses, deadlines, grades and notes stay readable and editable, and the free limits reapply only when you add something new. What does change is access to the Pro surfaces: flashcard decks, the Workload dashboard, Smart Plan, Progress Insights, the AI tutor and device calendar sync go back behind the paywall until you resubscribe. The data behind them is still sitting there (a lapsed subscription pauses an active calendar sync rather than unwriting it, and a deck you built is locked, not erased) but you cannot open those screens again until Pro is back on the account."
        ]
      },
      {
        "heading": "New, small, and how to reach the person who builds it",
        "paragraphs": [
          "Semora is independent. It is not the product of a company you have heard of, it has no outside funding to point at, and it launched recently enough that there is no track record to point at either. Every claim on this site is about the product, because the product is the only thing there is evidence for.",
          "There is a real upside to that, and it is the one thing worth selling here. A bug report goes to the person who wrote the code, not to a queue. Feature requests genuinely move the order of what gets built, because the roadmap is not defending a quarterly plan. The fact-checking method described above exists precisely because a small product cannot afford a reputation for overstating what it does.",
          "The honest downsides belong in the same paragraph. There is no Android app and no Mac app; the platforms are iPhone, iPad and any browser. Google Calendar and Google Classroom sync are not shipped, and the device calendar sync that does exist is iOS-only — in a browser the equivalent is exporting an .ics file, which the web app downloads directly. Pasting syllabus text into the scanner is likewise web-only. There is no phone support, no live chat and no enterprise agreement. Response times are a person's response times.",
          "Email is semora365@gmail.com, and it is the same address for support, bug reports, privacy questions, data export requests and corrections to this website. If you are reporting something broken, the three things that make it fixable fastest are which surface you were on (iPhone, iPad or browser), what you tapped immediately before it happened, and what you expected instead. Deleting your account does not require emailing anyone — it is in Settings, and it is immediate."
        ]
      }
    ],
    "faq": [
      {
        "question": "Who makes Semora?",
        "answer": "Semora is built independently, without outside funding or a company behind it, and the address on the support page reaches the person who writes the code. There is no team size, headcount or investor list to publish here, because publishing one would mean inventing it. What is verifiable is the product: an iOS app on the App Store, a web app, a privacy policy, and this site's claims checked against the shipping source. Email semora365@gmail.com and a person reads it."
      },
      {
        "question": "Is my syllabus used to train an AI model?",
        "answer": "No. Syllabus content and any lecture notes you attach are sent to the OpenAI API for processing by GPT-5.6 Luna. OpenAI states that API data is not used to train its models unless a customer explicitly opts in. Semora disables response storage, although OpenAI may retain abuse-monitoring logs for up to 30 days unless a stricter retention control applies. The files themselves are stored in a private bucket scoped to your account folder, not at a public URL, and are deleted with the rest of your data if you delete your account."
      },
      {
        "question": "Does Semora sell my data or show ads?",
        "answer": "No to both. There is no advertising anywhere in the app or on this site, no ad SDK in the build, and no arrangement to sell, broker or share your data with data partners. The revenue is the $3.99 a month or $19.99 a year subscription, and that is the whole model. Product analytics do exist, but they are app-level events tagged with a random per-install identifier and carry no user id, so they cannot be tied back to your account, your name or your email."
      },
      {
        "question": "How do I delete my account and everything in it?",
        "answer": "In the app, under Settings, there is a Delete Account screen. It requires a hardware identity check (Face ID, Touch ID or your device passcode) and a fresh sign-in before it will proceed, so it cannot be triggered by somebody with brief physical access to your phone. It then removes your uploaded syllabi and notes, deletes your semesters, courses, deadlines and grades, and deletes the account itself. It is immediate and irreversible; nothing is archived and nothing can be restored afterward. If you want a copy of your data first, email before you delete."
      },
      {
        "question": "What happens to my data if I subscribe to Pro and then cancel?",
        "answer": "Nothing is deleted. The free-tier limits are enforced by triggers that fire when a new row is created, so your existing semesters, courses, deadlines, grades and notes stay readable and editable no matter how many of them you accumulated on Pro — the limits only bite again the next time you try to add something new. The Pro-only screens do close: flashcard decks, the Workload dashboard, Smart Plan, Progress Insights and the AI tutor show the locked view again, and an active device calendar sync is paused rather than left silently broken. Everything behind those screens is preserved and comes straight back if you resubscribe."
      },
      {
        "question": "How do I know the feature and pricing claims on this site are accurate?",
        "answer": "Because they are written against the code that enforces them rather than against other marketing pages, and because the method has already caught its own mistakes: four tier claims on this site were wrong on the first pass, all four flattering, and all four were corrected against the app. The same standard is why the unflattering limits are stated plainly here, including that free accounts get one semester in total, that hosting a Course Space is Pro while joining one is free, and that the web checkout carries no free trial. If you find something that does not match the app you are using, email it and it gets corrected."
      },
      {
        "question": "Is Semora available on Android, or as a Mac app?",
        "answer": "Not currently. Semora runs as one universal iOS app on iPhone and iPad, plus a web app that works in any browser, including on an Android phone or a Mac. It is the same account and the same data across all of them, syncing in near real time. The practical gaps on the web are the ones tied to hardware: no camera capture path (drag-and-drop a file or paste the text instead), no home-screen widgets, and no device calendar sync, though the .ics export does work in the browser. Buying Pro is not one of those gaps: you can pay by card on the web or subscribe in the iOS app, and it covers the whole account either way."
      }
    ]
  }
};

export function getNewPage(key: NewPageKey): NewPage | undefined {
  return NEW_PAGES[key];
}

/** Slugs of the alternative pages, for the sitemap and internal linking. */
export const ALTERNATIVE_SLUGS = [
  'myhomework-alternative',
  'shovel-alternative',
  'studyfetch-alternative',
  'dormway-alternative',
  'mindgrasp-alternative',
] as const;
