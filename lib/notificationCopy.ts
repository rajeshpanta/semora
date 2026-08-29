/**
 * What Semora's reminders actually say.
 *
 * Everything here is copy and selection. Nothing in this file decides WHETHER a
 * reminder exists, WHEN it fires, or HOW MANY there are — lib/reminderPlan.ts
 * and lib/notifications.ts own that, and this module is deliberately unable to
 * influence it. It is handed a moment that has already been scheduled and
 * returns the words for it.
 *
 * Three ideas hold it together.
 *
 * **Tone follows the clock, not the ladder.** Stages are derived from the real
 * distance between the trigger and the deadline, not from which rung of the
 * ladder produced the reminder. That matters because quiet hours can push a
 * trigger hours later than the rung intended: a "one day before" reminder
 * deferred out of a 23:00 quiet window fires ten hours before the deadline, and
 * a cheerful "Tomorrow's mission" on top of "due in 10 hours" reads as a bug.
 * Deriving both from the same number makes the two halves incapable of
 * disagreeing.
 *
 * **Variety must be stable.** rescheduleAllTaskReminders cancels and rebuilds
 * every reminder on app open, timezone change and Pro activation. Picking copy
 * at random would rewrite the wording of every pending notification several
 * times a day, so a student who glanced at a notification would find it saying
 * something else an hour later. Selection is therefore a pure hash of the task
 * id and the stage: the same task at the same stage returns the same sentence
 * forever, while two different tasks at the same stage almost always differ.
 *
 * **The facts are never the joke.** Every body is `{task} · {course} · {when}`,
 * built by the same code path for every stage. Personality lives in the title,
 * where it cannot displace what the student needs to read. As urgency rises the
 * titles get plainer on purpose, and by the time something is due the title is
 * simply that it is due.
 *
 * Copy is stored as {en, es} pairs rather than routed through translate() in
 * lib/i18n. That follows what the notification layer already does —
 * classReminderBody and the existing reminder bodies both branch on locale
 * inline — and it keeps a hundred-odd playful strings out of a phrase map whose
 * job is matching UI text exactly. It also means one file holds every word
 * Semora says in a notification, which is what makes this safe to change over
 * the air.
 */

export type CopyLocale = 'en' | 'es';

/** A single piece of copy in both supported languages. */
interface Phrase {
  en: string;
  es: string;
}

/**
 * How close the deadline is, measured from the moment the reminder actually
 * fires. Ordered most urgent first, which is the order the classifier walks.
 */
export type ReminderStage =
  | 'dueNow'
  | 'finalStretch'
  | 'today'
  | 'tomorrow'
  | 'thisWeek'
  | 'earlyHeadsUp';

/** What kind of work it is. Drives which flavour of encouragement fits. */
export type ReminderKind = 'exam' | 'quiz' | 'project' | 'reading' | 'assignment';

/**
 * Thresholds in minutes, expressed against the real lead time.
 *
 * Deliberately generous at the bottom: anything inside a quarter of an hour is
 * "now" as far as a student is concerned, and a notification that says "due in
 * 12 minutes" while the title jokes about the final stretch is worse than one
 * that just says it is due.
 */
const DUE_NOW_MINUTES = 15;
const FINAL_STRETCH_MINUTES = 3 * 60;
const TODAY_MINUTES = 12 * 60;
const TOMORROW_MINUTES = 30 * 60;
const THIS_WEEK_MINUTES = 4 * 24 * 60;

/** A day with at least this many open tasks is treated as a heavy one. */
export const BUSY_DAY_THRESHOLD = 3;

export function classifyStage(leadMinutes: number): ReminderStage {
  if (leadMinutes <= DUE_NOW_MINUTES) return 'dueNow';
  if (leadMinutes <= FINAL_STRETCH_MINUTES) return 'finalStretch';
  if (leadMinutes <= TODAY_MINUTES) return 'today';
  if (leadMinutes <= TOMORROW_MINUTES) return 'tomorrow';
  if (leadMinutes <= THIS_WEEK_MINUTES) return 'thisWeek';
  return 'earlyHeadsUp';
}

/**
 * A high-priority task is treated as an exam for tone as well as for slots.
 * That mirrors what the scheduler already does with taskPriority, so a student
 * cannot see exam-weight scheduling wrapped in assignment-weight wording.
 */
export function classifyKind(
  taskType?: string | null,
  taskPriority?: string | null,
): ReminderKind {
  if (taskPriority === 'high') return 'exam';
  switch ((taskType || '').toLowerCase()) {
    case 'exam': return 'exam';
    case 'quiz': return 'quiz';
    case 'project': return 'project';
    case 'reading': return 'reading';
    default: return 'assignment';
  }
}

// ── Deterministic selection ──────────────────────────────────────────────────

/**
 * FNV-1a, 32-bit. Chosen for being short, dependency-free and stable across
 * engines — the same string must hash identically in Hermes on a phone and in
 * Deno in the test suite, or the tests prove nothing about what students see.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime (16777619) without overflowing into float
    // territory, which is what Math.imul is for.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Pick one entry, always the same one for the same seed. */
export function pickPhrase<T>(pool: readonly T[], seed: string): T {
  return pool[stableHash(seed) % pool.length];
}

// ── Titles ───────────────────────────────────────────────────────────────────
//
// Written to a rule: the further away the deadline, the more personality is
// allowed. Nothing in any pool refers to the student's effort, character,
// history or performance. Where these are funny, the joke is about the
// semester, the calendar or the professors — never about the person reading it.

const EARLY_HEADS_UP: readonly Phrase[] = [
  { en: 'On the radar 👀', es: 'En el radar 👀' },
  { en: 'A little heads-up', es: 'Un aviso con tiempo' },
  { en: 'Future-you will appreciate this 🙌', es: 'Tu yo del futuro te lo agradecerá 🙌' },
  { en: 'Plenty of runway ✈️', es: 'Tiempo de sobra ✈️' },
  { en: 'Worth a look this week', es: 'Vale la pena mirarlo esta semana' },
  { en: 'Filed under: not yet urgent', es: 'Archivado en: aún sin prisa' },
  { en: 'Early warning system 📡', es: 'Sistema de aviso anticipado 📡' },
  { en: 'One for the calendar 🗓️', es: 'Uno para el calendario 🗓️' },
  { en: 'No rush — just so you know', es: 'Sin prisa, solo para que lo sepas' },
  { en: 'Quietly approaching', es: 'Se acerca sin hacer ruido' },
];

const THIS_WEEK: readonly Phrase[] = [
  { en: 'Coming up this week', es: 'Llega esta semana' },
  { en: 'A few days out 🗓️', es: 'A unos días vista 🗓️' },
  { en: 'Still time to plan this one', es: 'Aún hay tiempo de planearlo' },
  { en: 'Getting closer 👣', es: 'Cada vez más cerca 👣' },
  { en: 'This week’s lineup', es: 'En la lista de esta semana' },
  { en: 'Worth starting soon', es: 'Buen momento para empezar' },
  { en: 'On deck 🎯', es: 'En la recta 🎯' },
  { en: 'Pencil this in ✏️', es: 'Apúntalo ✏️' },
];

const TOMORROW: readonly Phrase[] = [
  { en: 'Tomorrow’s mission 🎯', es: 'La misión de mañana 🎯' },
  { en: 'Heads-up for tomorrow 👋', es: 'Aviso para mañana 👋' },
  { en: 'On deck for tomorrow', es: 'Para mañana' },
  { en: 'Due tomorrow — you’ve got time 💪', es: 'Vence mañana: tienes tiempo 💪' },
  { en: 'Tomorrow, not today 🙂', es: 'Mañana, no hoy 🙂' },
  { en: 'Set up for tomorrow', es: 'Prepárate para mañana' },
  { en: 'One sleep to go 😴', es: 'Falta una noche 😴' },
  { en: 'Tomorrow’s the day', es: 'Mañana es el día' },
];

const TODAY: readonly Phrase[] = [
  { en: 'On today’s plate', es: 'En la lista de hoy' },
  { en: 'Still on for today', es: 'Sigue en pie para hoy' },
  { en: 'Today’s list 📋', es: 'La lista de hoy 📋' },
  { en: 'Due today — plenty doable', es: 'Vence hoy, se puede' },
  { en: 'Today’s the day', es: 'Hoy es el día' },
  { en: 'Before the day’s out', es: 'Antes de que acabe el día' },
  { en: 'Sometime today ⏳', es: 'En algún momento de hoy ⏳' },
  { en: 'Today’s one thing', es: 'Lo de hoy' },
];

const FINAL_STRETCH: readonly Phrase[] = [
  { en: 'Final stretch', es: 'Recta final' },
  { en: 'Almost showtime ⏰', es: 'Casi la hora ⏰' },
  { en: 'Coming up soon', es: 'Ya casi' },
  { en: 'Last few hours', es: 'Últimas horas' },
  { en: 'Closing in ⏳', es: 'Se acerca ⏳' },
  { en: 'Nearly there', es: 'Ya falta poco' },
];

/**
 * Due now has the smallest pool and the plainest language on purpose. There is
 * exactly one thing a student needs from this notification and it is not a
 * turn of phrase.
 */
const DUE_NOW: readonly Phrase[] = [
  { en: 'Due now ⏰', es: 'Vence ahora ⏰' },
  { en: 'Due now', es: 'Vence ahora' },
  { en: 'Due now — last call', es: 'Vence ahora: última llamada' },
];

// Exam and quiz flavours for the calmer stages. Close in, exams use the same
// plain titles as everything else — a student walking into an exam does not
// need Semora to be charming.
const EXAM_EARLY: readonly Phrase[] = [
  { en: 'Exam on the horizon 📖', es: 'Examen en el horizonte 📖' },
  { en: 'Worth starting to review', es: 'Buen momento para empezar a repasar' },
  { en: 'Study time starts now-ish 📚', es: 'La hora de estudiar empieza más o menos ya 📚' },
  { en: 'Exam ahead — nice and early', es: 'Examen a la vista, con tiempo' },
  { en: 'Future-you would start today 🙌', es: 'Tu yo del futuro empezaría hoy 🙌' },
];

const EXAM_SOON: readonly Phrase[] = [
  { en: 'Exam coming up 📖', es: 'Examen a la vista 📖' },
  { en: 'Review time 📚', es: 'Hora de repasar 📚' },
  { en: 'Exam day approaching', es: 'Se acerca el día del examen' },
  { en: 'Last good study window', es: 'Última buena ventana para estudiar' },
];

const PROJECT_EARLY: readonly Phrase[] = [
  { en: 'Project on the horizon 🛠️', es: 'Proyecto en el horizonte 🛠️' },
  { en: 'Big one — worth a head start', es: 'Uno grande: mejor empezar pronto' },
  { en: 'Chip away at this one 🧩', es: 'Ve avanzando poco a poco 🧩' },
  { en: 'Projects like an early start', es: 'Los proyectos agradecen empezar pronto' },
];

/**
 * Used when the due date is carrying several open tasks. The rule for this pool
 * is stricter than the others: acknowledge the load, never editorialise about
 * it, and always point at exactly one next action. Nothing here may imply the
 * student let the day get this way.
 */
const BUSY_DAY: readonly Phrase[] = [
  { en: 'Busy day — one thing at a time', es: 'Día cargado: una cosa a la vez' },
  { en: 'Full day ahead. Start here 👇', es: 'Día completo. Empieza por aquí 👇' },
  { en: 'A lot on today — this one first', es: 'Hoy hay mucho: empieza por esto' },
  { en: 'Stacked day. One at a time 💪', es: 'Día apretado. Uno a uno 💪' },
  { en: 'Plenty on. Here’s the next one', es: 'Hay bastante. Aquí va el siguiente' },
  { en: 'The professors coordinated again 😅 One at a time', es: 'Los profes se pusieron de acuerdo otra vez 😅 Uno a uno' },
  { en: 'Lots today. Just this one for now', es: 'Hoy hay mucho. Por ahora solo esto' },
  { en: 'Big day. Take it in order 📋', es: 'Día grande. Ve por orden 📋' },
  { en: 'Several things today — here’s one', es: 'Hoy hay varias cosas: aquí va una' },
  { en: 'Deadlines are clustering. One at a time', es: 'Las entregas se amontonan. Uno a uno' },
];

const BUSY_TOMORROW: readonly Phrase[] = [
  { en: 'Busy day tomorrow — here’s one', es: 'Mañana viene cargado: aquí va uno' },
  { en: 'Tomorrow’s stacked. One at a time', es: 'Mañana está apretado. Uno a uno' },
  { en: 'A few things land tomorrow', es: 'Mañana caen varias cosas' },
  { en: 'Tomorrow has a lot on it 🗓️', es: 'Mañana tiene bastante 🗓️' },
  { en: 'Tomorrow’s a full one. Start here', es: 'Mañana está lleno. Empieza por aquí' },
  { en: 'Several due tomorrow — this is one', es: 'Mañana vencen varias: esta es una' },
  { en: 'Plenty lands tomorrow 🗓️', es: 'Mañana llega bastante 🗓️' },
];

/**
 * A snoozed reminder that comes back after the deadline has passed.
 *
 * This is the only copy in Semora that speaks to a student about work that is
 * already late, so it is also the copy most able to do harm. No jokes, no
 * "again", no implication that anything was forgotten or neglected — the
 * deadline is described as something that happened, not something the student
 * did, and every line ends by pointing forward.
 */
const PAST_DEADLINE: readonly Phrase[] = [
  { en: 'Still open', es: 'Sigue pendiente' },
  { en: 'Still worth doing', es: 'Todavía vale la pena' },
  { en: 'Still time to hand it in', es: 'Aún se puede entregar' },
  { en: 'This one’s still here', es: 'Este sigue aquí' },
];

const PAST_DEADLINE_BODY: readonly Phrase[] = [
  {
    en: 'This one slipped past the deadline. You can still take care of it.',
    es: 'A este se le pasó la fecha. Todavía puedes ocuparte de él.',
  },
  {
    en: 'The deadline has gone by. Handing it in late still counts for something.',
    es: 'La fecha ya pasó. Entregarlo tarde todavía cuenta.',
  },
  {
    en: 'Past its due time — still worth finishing when you can.',
    es: 'Ya pasó su hora. Sigue valiendo la pena terminarlo cuando puedas.',
  },
];

// ── Class reminders ──────────────────────────────────────────────────────────
//
// Short, because the body already carries the time and the room and those are
// the whole point. Only used when the lead is long enough that a sentence is
// not in the way; inside half an hour the body stands alone.

const CLASS_LEAD_IN: readonly Phrase[] = [
  { en: 'Grab your notes', es: 'Coge tus apuntes' },
  { en: 'Heads-up', es: 'Aviso' },
  { en: 'Coming up', es: 'Ya viene' },
  { en: 'Time to head over', es: 'Hora de ir saliendo' },
  { en: 'On soon', es: 'Empieza pronto' },
];

// ── Facts ────────────────────────────────────────────────────────────────────

/** 17:05 → "5:05 PM" in English, "17:05" in Spanish. */
export function formatClock(dueTime: string, locale: CopyLocale): string {
  const [rawHour, rawMinute] = dueTime.split(':');
  const hour = Number(rawHour);
  const minute = rawMinute ?? '00';
  if (!Number.isFinite(hour)) return dueTime;
  if (locale === 'es') return `${String(hour).padStart(2, '0')}:${minute}`;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${minute} ${suffix}`;
}

/**
 * A rounded, readable distance.
 *
 * Deliberately coarser than lib/notifications.ts's formatLeadTime, which
 * renders "2 days 3 hours 15 minutes". That precision is right for a settings
 * screen and wrong on a lock screen, where the student is reading one line at a
 * glance and the difference between three and four days is what they need.
 */
export function humanLead(minutes: number, locale: CopyLocale): string {
  const es = locale === 'es';
  if (minutes < 60) {
    const m = Math.max(1, Math.round(minutes));
    return es ? `${m} min` : `${m} min`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.round(hours);
    if (h <= 1) return es ? '1 hora' : '1 hour';
    return es ? `${h} horas` : `${h} hours`;
  }
  const days = Math.round(hours / 24);
  if (days <= 1) return es ? '1 día' : '1 day';
  return es ? `${days} días` : `${days} days`;
}

/**
 * The "when" clause. Calendar-relative wherever a student would say it that
 * way, and a plain distance otherwise.
 *
 * `daysUntilDue` is counted in calendar days from the day the reminder fires,
 * not by dividing the lead — 30 hours can be either tomorrow or the day after
 * depending on the hour, and getting that wrong is exactly the sort of small
 * lie that makes an app feel careless.
 */
export function describeWhen(
  stage: ReminderStage,
  leadMinutes: number,
  daysUntilDue: number,
  dueTime: string | null | undefined,
  locale: CopyLocale,
): string {
  const es = locale === 'es';
  if (stage === 'dueNow') return es ? 'vence ahora' : 'due now';

  if (daysUntilDue <= 0) {
    if (dueTime) return es ? `vence hoy a las ${formatClock(dueTime, 'es')}` : `due today at ${formatClock(dueTime, 'en')}`;
    return es ? 'vence hoy' : 'due by end of day';
  }
  if (daysUntilDue === 1) {
    if (dueTime) return es ? `vence mañana a las ${formatClock(dueTime, 'es')}` : `due tomorrow at ${formatClock(dueTime, 'en')}`;
    return es ? 'vence mañana' : 'due tomorrow';
  }
  return es ? `vence en ${humanLead(leadMinutes, 'es')}` : `due in ${humanLead(leadMinutes, 'en')}`;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export interface ReminderCopyInput {
  /** Seeds the choice. The same task always reads the same at a given stage. */
  taskId: string;
  taskTitle: string;
  courseName: string;
  /** Real minutes from the moment this fires to the moment the work is due. */
  leadMinutes: number;
  /** Calendar days from the firing day to the due day. 0 means the same day. */
  daysUntilDue: number;
  dueTime?: string | null;
  taskType?: string | null;
  taskPriority?: string | null;
  /** Open tasks sharing this due date, when the caller can see the whole set. */
  dayLoad?: number;
  locale: CopyLocale;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

function titlePool(
  stage: ReminderStage,
  kind: ReminderKind,
  busy: boolean,
): readonly Phrase[] {
  // A heavy day outranks the flavour of any single task on it: what the student
  // needs first is permission to do one thing, not encouragement about this
  // particular essay. Never applied to dueNow, where nothing outranks clarity.
  if (busy && stage === 'today') return BUSY_DAY;
  if (busy && stage === 'tomorrow') return BUSY_TOMORROW;
  if (busy && stage === 'finalStretch') return BUSY_DAY;

  switch (stage) {
    case 'dueNow': return DUE_NOW;
    case 'finalStretch': return kind === 'exam' || kind === 'quiz' ? EXAM_SOON : FINAL_STRETCH;
    case 'today': return TODAY;
    case 'tomorrow': return kind === 'exam' || kind === 'quiz' ? EXAM_SOON : TOMORROW;
    case 'thisWeek':
      if (kind === 'exam') return EXAM_EARLY;
      if (kind === 'project') return PROJECT_EARLY;
      return THIS_WEEK;
    case 'earlyHeadsUp':
      if (kind === 'exam') return EXAM_EARLY;
      if (kind === 'project') return PROJECT_EARLY;
      return EARLY_HEADS_UP;
  }
}

/**
 * The words for one already-scheduled reminder.
 *
 * The body is assembled identically for every stage — task, course, when — so
 * there is no arrangement of inputs that produces a notification a student
 * cannot act on. Only the title varies.
 */
export function buildReminderCopy(input: ReminderCopyInput): NotificationCopy {
  const stage = classifyStage(input.leadMinutes);
  const kind = classifyKind(input.taskType, input.taskPriority);
  const busy = (input.dayLoad ?? 0) >= BUSY_DAY_THRESHOLD;

  const pool = titlePool(stage, kind, busy);
  // The stage is in the seed so the same task reads differently at each rung of
  // its own ladder; the task id is in it so two tasks at the same rung usually
  // differ. Nothing time-varying is in it, which is what stops a reschedule
  // from rewriting anything.
  // Seeded on the task alone, never on what else shares its day. Spreading the
  // picks across a day's tasks would guarantee no two read alike, at the cost of
  // making one task's wording depend on another task's existence — so completing
  // anything would silently rewrite its neighbours. Occasional repetition
  // between two different tasks is the cheaper fault: their bodies still name
  // different work, which is what the student is actually reading for.
  const phrase = pickPhrase(pool, `${input.taskId}|${stage}|${busy ? 'busy' : 'solo'}`);

  const when = describeWhen(stage, input.leadMinutes, input.daysUntilDue, input.dueTime, input.locale);
  const title = input.locale === 'es' ? phrase.es : phrase.en;
  return {
    title,
    body: `${input.taskTitle} · ${input.courseName} · ${when}`,
  };
}

/**
 * Copy for a reminder the student pushed an hour down the road.
 *
 * Recomposed rather than replayed. The previous shape re-used the original
 * title and body verbatim, which was harmless while every body was a bare
 * "due in 2 hours" and is not once titles carry tone: a snooze taken at the
 * deadline would otherwise resurface "Tomorrow's mission 🎯" an hour after the
 * work was due.
 */
export function buildSnoozedCopy(input: ReminderCopyInput): NotificationCopy {
  if (input.leadMinutes > 0) return buildReminderCopy(input);

  const seed = `${input.taskId}|snoozed`;
  const phrase = pickPhrase(PAST_DEADLINE, seed);
  const line = pickPhrase(PAST_DEADLINE_BODY, seed);
  return {
    title: input.locale === 'es' ? phrase.es : phrase.en,
    body: `${input.taskTitle} · ${input.courseName} — ${input.locale === 'es' ? line.es : line.en}`,
  };
}

export interface ClassCopyInput {
  /** Seeds the choice, so one class reads the same way every week. */
  meetingId: string;
  courseName: string;
  /** Already-formatted by lib/classReminders.ts — time and room. */
  factualBody: string;
  leadMinutes: number;
  locale: CopyLocale;
}

/**
 * Copy for a class about to start.
 *
 * The body is passed in untouched: classReminders.ts already renders the start
 * distance and the room, and those are the entire reason the notification
 * exists. A lead-in sentence is added only when there is enough time for it to
 * be useful — inside half an hour the student is walking, and a preamble is
 * just something between them and the room number.
 *
 * The seed is the meeting rather than the moment because the trigger repeats
 * weekly and iOS re-arms it with the content it was given. There is no way to
 * vary this week to week without rescheduling every week, and one class reading
 * consistently is better than churn.
 */
export function buildClassCopy(input: ClassCopyInput): NotificationCopy {
  const title = `🎓 ${input.courseName}`;
  if (input.leadMinutes < 30) return { title, body: input.factualBody };
  const phrase = pickPhrase(CLASS_LEAD_IN, `${input.meetingId}|class`);
  const lead = input.locale === 'es' ? phrase.es : phrase.en;
  return { title, body: `${lead} — ${input.factualBody}` };
}

/**
 * Every pool, exposed for the test that walks all of them looking for language
 * Semora must never use. Keeping that list in the test rather than here means
 * adding a phrase cannot quietly opt out of the check.
 */
export const ALL_PHRASE_POOLS: Readonly<Record<string, readonly Phrase[]>> = {
  EARLY_HEADS_UP, THIS_WEEK, TOMORROW, TODAY, FINAL_STRETCH, DUE_NOW,
  EXAM_EARLY, EXAM_SOON, PROJECT_EARLY, BUSY_DAY, BUSY_TOMORROW,
  PAST_DEADLINE, PAST_DEADLINE_BODY, CLASS_LEAD_IN,
};
