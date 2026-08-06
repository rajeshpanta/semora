/**
 * Structured-output schemas and server-side validation for Semora's AI data.
 *
 * Two layers, deliberately:
 *   1. `*_SCHEMA` constrains what the model may return (Gemini responseSchema).
 *   2. `validate*` re-checks it here, because schema-conformance is not
 *      correctness — "2026-02-31" is a well-formed string and an impossible
 *      date, and a model can emit a due date for a course it never saw.
 *
 * Anything that fails validation is dropped or flagged for confirmation. We do
 * not silently persist AI output.
 */

// ── Shared enums ────────────────────────────────────────────────────────────

export const ITEM_TYPES = ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const SOURCE_TYPES = ['syllabus_pdf', 'syllabus_image', 'syllabus_text', 'canvas', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Below this, the extraction is shown to the student before it is trusted. */
export const CONFIRMATION_THRESHOLD = 0.75;

// ── Gemini response schemas (OpenAPI subset) ────────────────────────────────

const EXTRACTED_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    type: { type: 'STRING', enum: [...ITEM_TYPES] },
    due_date: { type: 'STRING', description: 'YYYY-MM-DD, or null when the document gives no date' },
    due_time: { type: 'STRING', description: 'HH:MM 24-hour, or null' },
    weight: { type: 'NUMBER', description: 'Percent of final grade, or null' },
    description: { type: 'STRING' },
    confidence: { type: 'NUMBER', description: '0-1' },
    source_page: { type: 'INTEGER', description: '1-based page the item was read from, when known' },
    source_evidence: { type: 'STRING', description: 'The verbatim line the item came from, <=200 chars' },
  },
  required: ['title', 'type', 'confidence'],
} as const;

export const SYLLABUS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_syllabus: { type: 'BOOLEAN' },
    course_name: { type: 'STRING' },
    course_code: { type: 'STRING' },
    instructor: { type: 'STRING' },
    semester_name: { type: 'STRING' },
    semester_start: { type: 'STRING', description: 'YYYY-MM-DD or null' },
    semester_end: { type: 'STRING', description: 'YYYY-MM-DD or null' },
    meetings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          days_of_week: { type: 'ARRAY', items: { type: 'INTEGER' } },
          start_time: { type: 'STRING' },
          end_time: { type: 'STRING' },
          kind: { type: 'STRING', enum: ['lecture', 'lab', 'discussion', 'other'] },
          location: { type: 'STRING' },
        },
        required: ['days_of_week'],
      },
    },
    office_hours_blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          days_of_week: { type: 'ARRAY', items: { type: 'INTEGER' } },
          start_time: { type: 'STRING' },
          end_time: { type: 'STRING' },
          location: { type: 'STRING' },
        },
      },
    },
    grade_scale: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { letter: { type: 'STRING' }, min: { type: 'NUMBER' } },
        required: ['letter', 'min'],
      },
    },
    items: { type: 'ARRAY', items: EXTRACTED_ITEM_SCHEMA },
  },
  required: ['is_syllabus', 'items'],
} as const;

export const FLASHCARDS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
        required: ['front', 'back'],
      },
    },
  },
  required: ['cards'],
} as const;

export const PRACTICE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING' },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['prompt', 'answer'],
      },
    },
  },
  required: ['questions'],
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * A real calendar date in YYYY-MM-DD.
 *
 * Date.parse alone is not enough: it happily rolls "2026-02-31" into March 3,
 * which would silently save a deadline the syllabus never contained. Round-trip
 * comparison is what rejects it.
 */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isRealTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** IANA zone the client sent, validated; falls back to UTC rather than guessing. */
export function normalizeTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz.trim()) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export type ValidatedItem = {
  local_id: string;
  title: string;
  type: ItemType;
  due_date: string | null;
  due_time: string | null;
  timezone: string;
  weight: number | null;
  description: string | null;
  confidence: number;
  source_type: SourceType;
  source_ref: string | null;
  source_page: number | null;
  source_evidence: string | null;
  needs_confirmation: boolean;
};

export type ItemValidation = {
  items: ValidatedItem[];
  /** Rejected entries, with the reason — surfaced in telemetry, not silently dropped. */
  rejected: { title: string; reason: string }[];
};

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Validate model-extracted items into rows we are willing to persist.
 *
 * Rules, in order:
 *  - a title is mandatory (an untitled deadline is unusable)
 *  - an unknown type degrades to 'other' rather than failing the whole batch
 *  - a malformed or impossible date is REJECTED, not coerced
 *  - a date outside the term window is kept but forced to needs_confirmation,
 *    since syllabi legitimately reference prior-year material
 *  - low confidence forces needs_confirmation
 */
export function validateExtractedItems(
  raw: unknown,
  opts: {
    timezone: string;
    sourceType: SourceType;
    sourceRef?: string | null;
    termStart?: string | null;
    termEnd?: string | null;
  },
): ItemValidation {
  const out: ValidatedItem[] = [];
  const rejected: { title: string; reason: string }[] = [];
  if (!Array.isArray(raw)) return { items: out, rejected };

  const tz = normalizeTimezone(opts.timezone);

  for (const r of raw) {
    const title = clampStr((r as any)?.title, 200);
    if (!title) { rejected.push({ title: '(untitled)', reason: 'missing title' }); continue; }

    const rawDate = (r as any)?.due_date;
    let due: string | null = null;
    if (rawDate != null && rawDate !== '') {
      if (!isRealDate(rawDate)) { rejected.push({ title, reason: `impossible date: ${String(rawDate).slice(0, 24)}` }); continue; }
      due = rawDate;
    }

    const rawTime = (r as any)?.due_time;
    const time = rawTime != null && rawTime !== '' && isRealTime(rawTime) ? String(rawTime).slice(0, 5) : null;

    const typeRaw = String((r as any)?.type ?? '').toLowerCase();
    const type = (ITEM_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as ItemType) : 'other';

    const wRaw = Number((r as any)?.weight);
    const weight = Number.isFinite(wRaw) && wRaw >= 0 && wRaw <= 100 ? wRaw : null;

    const cRaw = Number((r as any)?.confidence);
    const confidence = Number.isFinite(cRaw) ? Math.min(1, Math.max(0, cRaw)) : 0.5;

    const pRaw = Number((r as any)?.source_page);
    const page = Number.isInteger(pRaw) && pRaw > 0 && pRaw < 1000 ? pRaw : null;

    let outsideTerm = false;
    if (due && opts.termStart && isRealDate(opts.termStart) && due < opts.termStart) outsideTerm = true;
    if (due && opts.termEnd && isRealDate(opts.termEnd) && due > opts.termEnd) outsideTerm = true;

    out.push({
      local_id: crypto.randomUUID(),
      title,
      type,
      due_date: due,
      due_time: time,
      timezone: tz,
      weight,
      description: clampStr((r as any)?.description, 1000),
      confidence,
      source_type: opts.sourceType,
      source_ref: opts.sourceRef ?? null,
      source_page: page,
      source_evidence: clampStr((r as any)?.source_evidence, 200),
      // A missing date always needs the student, and so does anything the model
      // was unsure of or that falls outside the stated term.
      needs_confirmation: due == null || confidence < CONFIRMATION_THRESHOLD || outsideTerm,
    });
  }
  return { items: out, rejected };
}

/** Flashcards: both sides non-empty, deduped, capped. */
export function validateFlashcards(raw: unknown, max: number): { front: string; back: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { front: string; back: string }[] = [];
  for (const c of raw) {
    const front = clampStr((c as any)?.front, 500);
    const back = clampStr((c as any)?.back, 2000);
    if (!front || !back) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
    if (out.length >= max) break;
  }
  return out;
}

/** Practice questions: prompt+answer required, explanation optional, capped. */
export function validatePracticeQuestions(
  raw: unknown,
  max: number,
): { prompt: string; answer: string; explanation: string | null }[] {
  if (!Array.isArray(raw)) return [];
  const out: { prompt: string; answer: string; explanation: string | null }[] = [];
  for (const q of raw) {
    const prompt = clampStr((q as any)?.prompt, 1000);
    const answer = clampStr((q as any)?.answer, 2000);
    if (!prompt || !answer) continue;
    out.push({ prompt, answer, explanation: clampStr((q as any)?.explanation, 2000) });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * SHA-256 of document bytes + the extraction contract.
 *
 * The model id and a prompt version are folded in so a model or prompt change
 * invalidates the cache — otherwise a re-scan after an upgrade would replay a
 * stale extraction and the improvement would never reach the student.
 */
export async function contentHash(parts: { data: string; mimeType: string }[], contract: string): Promise<string> {
  const payload = contract + ' ' + parts.map((p) => `${p.mimeType}:${p.data.length}:${p.data}`).join(' ');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
