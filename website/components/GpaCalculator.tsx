'use client';

import { useMemo, useState } from 'react';
import styles from './GpaCalculator.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Working GPA calculator, not a mock.
 *
 * The scale and the arithmetic are copied from the shipping app
 * (DEFAULT_GPA_SCALE and calculateSemesterGpaWithScale in lib/grades.ts) so
 * this page and the product can never disagree: quality points are
 * grade points x credit hours, GPA is quality points over total credits, and
 * a course with no letter selected is excluded rather than counted as zero.
 */
const GPA_SCALE: { letter: string; points: number }[] = [
  { letter: 'A+', points: 4 },
  { letter: 'A', points: 4 },
  { letter: 'A-', points: 3.7 },
  { letter: 'B+', points: 3.3 },
  { letter: 'B', points: 3 },
  { letter: 'B-', points: 2.7 },
  { letter: 'C+', points: 2.3 },
  { letter: 'C', points: 2 },
  { letter: 'C-', points: 1.7 },
  { letter: 'D+', points: 1.3 },
  { letter: 'D', points: 1 },
  { letter: 'D-', points: 0.7 },
  { letter: 'F', points: 0 },
];

interface Row {
  id: number;
  name: string;
  letter: string;
  credits: string;
}

const START: Row[] = [
  { id: 1, name: '', letter: 'A', credits: '3' },
  { id: 2, name: '', letter: 'B+', credits: '3' },
  { id: 3, name: '', letter: 'A-', credits: '4' },
  { id: 4, name: '', letter: '', credits: '3' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function GpaCalculator({ locale = 'en' }: { locale?: SiteLocale }) {
  const [rows, setRows] = useState<Row[]>(START);
  const [nextId, setNextId] = useState(5);
  const es = locale === 'es';

  const result = useMemo(() => {
    const counted = rows
      .map((r) => {
        const entry = GPA_SCALE.find((g) => g.letter === r.letter);
        if (!entry) return null;
        const parsed = Number.parseFloat(r.credits);
        // Mirrors the app: a missing or nonsensical credit value falls back to
        // 3, and anything below half a credit is clamped up to 0.5.
        const credits = Math.max(0.5, Number.isFinite(parsed) ? parsed : 3);
        return { points: entry.points, credits };
      })
      .filter((x): x is { points: number; credits: number } => x !== null);

    const credits = counted.reduce((s, c) => s + c.credits, 0);
    const quality = counted.reduce((s, c) => s + c.points * c.credits, 0);
    return {
      gpa: credits > 0 ? round2(quality / credits) : null,
      courses: counted.length,
      credits: Math.round(credits * 10) / 10,
      quality: round2(quality),
      skipped: rows.length - counted.length,
    };
  }, [rows]);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} role="group" aria-label={es ? 'Cursos' : 'Courses'}>
        <div className={styles.headRow} aria-hidden="true">
          <span>{es ? 'Curso' : 'Course'}</span>
          <span>{es ? 'Nota' : 'Grade'}</span>
          <span>{es ? 'Créditos' : 'Credits'}</span>
          <span />
        </div>

        {rows.map((r, i) => (
          <div className={styles.row} key={r.id}>
            <input
              className={styles.input}
              value={r.name}
              placeholder={`${es ? 'Curso' : 'Course'} ${i + 1}`}
              aria-label={es ? `Nombre del curso ${i + 1}` : `Course ${i + 1} name`}
              onChange={(e) => update(r.id, { name: e.target.value })}
            />
            <select
              className={styles.select}
              value={r.letter}
              aria-label={es ? `Calificación del curso ${i + 1}` : `Course ${i + 1} letter grade`}
              onChange={(e) => update(r.id, { letter: e.target.value })}
            >
              <option value="">—</option>
              {GPA_SCALE.map((g) => (
                <option key={g.letter} value={g.letter}>
                  {g.letter}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              value={r.credits}
              inputMode="decimal"
              aria-label={es ? `Créditos del curso ${i + 1}` : `Course ${i + 1} credit hours`}
              onChange={(e) => update(r.id, { credits: e.target.value })}
            />
            <button
              type="button"
              className={styles.remove}
              aria-label={es ? `Eliminar curso ${i + 1}` : `Remove course ${i + 1}`}
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.add}
          onClick={() => {
            setRows((rs) => [...rs, { id: nextId, name: '', letter: '', credits: '3' }]);
            setNextId((n) => n + 1);
          }}
        >
          {es ? '+ Agregar curso' : '+ Add course'}
        </button>
        <button type="button" className={styles.reset} onClick={() => setRows(START)}>
          {es ? 'Restablecer' : 'Reset'}
        </button>
      </div>

      <div className={styles.result} aria-live="polite">
        <p className={styles.resultLabel}>{es ? 'GPA del semestre' : 'Semester GPA'}</p>
        <p className={styles.gpa}>{result.gpa === null ? '—' : result.gpa.toFixed(2)}</p>
        <p className={styles.detail}>
          {result.gpa === null
            ? (es ? 'Selecciona una calificación para al menos un curso.' : 'Pick a letter grade for at least one course.')
            : es
              ? `${result.quality} puntos de calidad ÷ ${result.credits} créditos en ${result.courses} ${result.courses === 1 ? 'curso' : 'cursos'}.`
              : `${result.quality} quality points ÷ ${result.credits} credits, across ${result.courses} ${result.courses === 1 ? 'course' : 'courses'}.`}
          {result.skipped > 0 && result.gpa !== null
            ? es
              ? ` ${result.skipped} ${result.skipped === 1 ? 'curso no cuenta' : 'cursos no cuentan'} porque no tienen calificación.`
              : ` ${result.skipped} ${result.skipped === 1 ? 'course is' : 'courses are'} not counted — no grade selected.`
            : ''}
        </p>
      </div>
    </div>
  );
}
