/**
 * "Due Friday" / "exam Oct 3" in a lecture's notes → one tap to a Semora task
 * (Record Lecture plan 4.6).
 *
 * The notes writer ends every lecture's notes with an "Action items" section:
 * deadlines, readings, exam dates and logistics the instructor mentioned. This
 * reads that section and guesses each item's type and date, so the Add Task
 * screen opens already filled in. It only ever PRE-FILLS: the student sees and
 * saves the task themselves, so a wrong guess costs a correction, never a
 * silent wrong deadline.
 *
 * Pure — tested in lectureActionItems.test.ts.
 */

import type { TaskType } from '@/lib/constants';

export interface LectureActionItem {
  text: string;
  type: TaskType;
  /** YYYY-MM-DD, or null when no date could be read. */
  dueDate: string | null;
}

const SECTION = /^#{2,3}\s+(?:\*\*)?(?:Action items|Acciones|Tareas(?: pendientes)?|Pendientes|Elementos de acción)(?:\*\*)?\s*:?\s*$/i;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, ene: 0, enero: 0,
  feb: 1, february: 1, febrero: 1,
  mar: 2, march: 2, marzo: 2,
  apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, junio: 5,
  jul: 6, july: 6, julio: 6,
  aug: 7, august: 7, ago: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8, setiembre: 8,
  oct: 9, october: 9, octubre: 9,
  nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, dic: 11, diciembre: 11,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0,
  monday: 1, mon: 1, lunes: 1,
  tuesday: 2, tue: 2, tues: 2, martes: 2,
  wednesday: 3, wed: 3, miercoles: 3, 'miércoles': 3,
  thursday: 4, thu: 4, thurs: 4, jueves: 4,
  friday: 5, fri: 5, viernes: 5,
  saturday: 6, sat: 6, sabado: 6, 'sábado': 6,
};

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The first date the text names, relative to when the lecture was recorded. */
export function dateFromText(text: string, recordedAt: Date): string | null {
  const lower = text.toLowerCase();
  const base = new Date(recordedAt.getFullYear(), recordedAt.getMonth(), recordedAt.getDate());

  // "Oct 3", "October 3rd", "3 de octubre", "3 October"
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const md = lower.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const dm = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:de\\s+)?(${monthNames})\\b`));
  const pick = md ? { month: MONTHS[md[1]], day: Number(md[2]) } : dm ? { month: MONTHS[dm[2]], day: Number(dm[1]) } : null;
  if (pick && pick.day >= 1 && pick.day <= 31) {
    const candidate = new Date(base.getFullYear(), pick.month, pick.day);
    // A date more than two months before the lecture means next year's.
    if (candidate.getTime() < base.getTime() - 60 * 24 * 3600 * 1000) candidate.setFullYear(base.getFullYear() + 1);
    if (candidate.getMonth() === pick.month) return ymd(candidate);
  }

  // "due 10/3" (US month/day) — only after a word that introduces a date, so
  // "scored 10/10" is not October 10th.
  const slash = lower.match(/\b(?:due|on|by|before|until|for|el|para|hasta|antes del?)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : base.getFullYear();
      const candidate = new Date(year, month, day);
      if (!slash[3] && candidate.getTime() < base.getTime() - 60 * 24 * 3600 * 1000) candidate.setFullYear(year + 1);
      if (candidate.getMonth() === month) return ymd(candidate);
    }
  }

  if (/\b(tomorrow|mañana)\b/.test(lower)) {
    const t = new Date(base);
    t.setDate(t.getDate() + 1);
    return ymd(t);
  }
  if (/\b(next week|la próxima semana|la semana que viene)\b/.test(lower)) {
    const t = new Date(base);
    t.setDate(t.getDate() + 7);
    return ymd(t);
  }

  // "Friday", "next Friday", "el viernes": the next one after the lecture day.
  const dayNames = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
  const wd = lower.match(new RegExp(`\\b(next\\s+|el\\s+|this\\s+|by\\s+|on\\s+|due\\s+)?(${dayNames})\\b`));
  if (wd && (wd[1] || wd[2].length > 3)) {
    const target = WEEKDAYS[wd[2]];
    const t = new Date(base);
    let add = (target - t.getDay() + 7) % 7;
    if (add === 0) add = 7;
    if (/^next\s+/.test(wd[1] ?? '') && add < 7) add += 7;
    t.setDate(t.getDate() + add);
    return ymd(t);
  }
  return null;
}

export function typeFromText(text: string): TaskType {
  const lower = text.toLowerCase();
  if (/\b(midterm|final exam|exam|test|examen|parcial)\b/.test(lower)) return 'exam';
  if (/\b(quiz|prueba corta|cuestionario)\b/.test(lower)) return 'quiz';
  if (/\b(read|reading|chapter|chapters|pages|pp\.|lee|leer|lectura|capítulo)\b/.test(lower)) return 'reading';
  if (/\b(project|proyecto|presentation|presentación)\b/.test(lower)) return 'project';
  if (/\b(homework|assignment|problem set|lab report|essay|paper|submit|due|tarea|entrega|ensayo)\b/.test(lower)) return 'assignment';
  return 'other';
}

/** The action items of a lecture's notes, in order. At most 12. */
export function actionItemsFromNotes(notesMd: string | null | undefined, recordedAt: Date): LectureActionItem[] {
  if (!notesMd) return [];
  const lines = notesMd.split('\n');
  const start = lines.findIndex((l) => SECTION.test(l.trim()));
  if (start < 0) return [];
  const out: LectureActionItem[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line.trim())) break;
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (!m) continue;
    // Top-level bullets only; sub-bullets are detail of the item above.
    if (/^\s{2,}/.test(line)) continue;
    const text = m[1].replace(/\*\*/g, '').replace(/^⭐\s*/, '').trim();
    if (!text || isNothingToDo(text)) continue;
    out.push({ text, type: typeFromText(text), dueDate: dateFromText(text, recordedAt) });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * "No action items were mentioned." is not a task. The notes writer is asked to
 * omit the section when there is nothing, but a model that writes it anyway
 * says so in one of a few ways.
 */
export function isNothingToDo(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(no|none|nothing|n\/a|ninguno|ninguna|nada|no hay|no se)\b/.test(t)
    || /\b(no|any) (action items?|deadlines?|tasks?|assignments?|readings?|logistics)\b.*\b(were|was|are|is)?\b.*\b(mention|recover|identif|found|stated|given|announced)/.test(t)
    || /\bnot (mentioned|identifiable|recoverable|stated|announced)\b/.test(t);
}

/** A short task title from an action item: the first clause, at most 80 characters. */
export function taskTitleFromItem(text: string): string {
  const first = text.split(/(?<=[.;])\s|\s[—–]\s/)[0].trim().replace(/[.;:]$/, '');
  return first.length <= 80 ? first : `${first.slice(0, 77).trimEnd()}…`;
}
