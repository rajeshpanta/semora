import styles from './FeaturePanel.module.css';

/**
 * The product visual that sits beside a feature page's headline.
 *
 * Feature pages used to open straight into prose, which asks a visitor to read
 * several paragraphs before they have any idea what the thing looks like. This
 * shows the feature instead, in the shape it actually takes in the app.
 *
 * Everything here is illustrative UI built from real product behaviour — the
 * same standing rule as HeroDemo. No ratings, no user counts, no claims the
 * product does not make elsewhere on the site.
 */

type Panel =
  | { kind: 'rows'; title: string; rows: { left: string; sub?: string; right: string; tone?: string }[] }
  | { kind: 'card'; title: string; front: string; back: string; grades: string[] }
  | { kind: 'chat'; title: string; ask: string; reply: string; source: string }
  | { kind: 'grades'; title: string; overall: string; letter: string; parts: { name: string; weight: number; score: string }[] }
  | {
      kind: 'schedule';
      title: string;
      // `start` and `span` are half-hour units from the top of the visible day,
      // so blocks land at different times instead of stacking flush to the top.
      days: { label: string; blocks: { text: string; start: number; span: number; tone?: string }[] }[];
    }
  | { kind: 'timer'; title: string; time: string; phase: string; done: number; total: number };

const PANELS: Record<string, Panel> = {
  'syllabus-scanner': {
    kind: 'rows',
    title: 'CHEM 101 Syllabus.pdf — 14 items found',
    rows: [
      { left: 'Problem Set 1', sub: 'Homework · 5%', right: 'Sep 8' },
      { left: 'Lab Report 1', sub: 'Lab · 10%', right: 'Sep 15' },
      { left: 'Midterm Exam', sub: 'Exam · 25%', right: 'Oct 14', tone: 'exam' },
      { left: 'Problem Set 5', sub: 'Homework · 5%', right: 'Oct 27' },
      { left: 'Final Exam', sub: 'Exam · 35%', right: 'Dec 12', tone: 'exam' },
    ],
  },
  'canvas-sync': {
    kind: 'rows',
    title: 'Canvas · last synced 2 minutes ago',
    rows: [
      { left: 'Discussion 4', sub: 'BIO 210 · from Canvas', right: 'Sep 9', tone: 'sync' },
      { left: 'Quiz 3', sub: 'BIO 210 · from Canvas', right: 'Sep 11', tone: 'sync' },
      { left: 'Essay Draft', sub: 'HIST 210 · from syllabus', right: 'Sep 12' },
      { left: 'Reading Response', sub: 'HIST 210 · from Canvas', right: 'Sep 14', tone: 'sync' },
      { left: 'Problem Set 3', sub: 'MATH 152 · added by you', right: 'Sep 16' },
    ],
  },
  collaboration: {
    kind: 'rows',
    title: 'PHYS 141 · Course Space · 4 members',
    rows: [
      { left: 'Lab 3 write-up', sub: 'Shared by Maya', right: 'Sep 10', tone: 'shared' },
      { left: 'Midterm study session', sub: 'Shared by you', right: 'Oct 12', tone: 'shared' },
      { left: 'Problem Set 6', sub: 'Shared by Devin', right: 'Oct 20', tone: 'shared' },
      { left: 'Formula sheet deck', sub: '32 cards · shared', right: 'Deck' },
    ],
  },
  flashcards: {
    kind: 'card',
    title: 'Cell Biology Ch. 7 · card 12 of 34',
    front: 'What is the role of the mitochondria in a cell?',
    back: 'It generates ATP through oxidative phosphorylation, supplying energy for cellular processes.',
    grades: ['Again', 'Hard', 'Good', 'Easy'],
  },
  'ai-tutor': {
    kind: 'chat',
    title: 'AI Tutor · BIO 210',
    ask: 'What do I need to know for the midterm?',
    reply: 'Your midterm on Oct 14 covers chapters 4 through 7. From your uploaded notes, the weakest area is enzyme kinetics — start there.',
    source: 'Grounded in: BIO 210 syllabus, Lecture notes 4–7',
  },
  'grade-tracking': {
    kind: 'grades',
    title: 'MATH 152 · current standing',
    overall: '88.4%',
    letter: 'B+',
    parts: [
      { name: 'Homework', weight: 20, score: '94%' },
      { name: 'Quizzes', weight: 15, score: '86%' },
      { name: 'Midterm', weight: 25, score: '84%' },
      { name: 'Final', weight: 40, score: 'Not graded' },
    ],
  },
  'smart-plan': {
    kind: 'schedule',
    title: 'This week · built from 6 deadlines',
    days: [
      { label: 'Mon', blocks: [{ text: 'Read Ch. 5', start: 1, span: 2 }] },
      {
        label: 'Tue',
        blocks: [
          { text: 'Problem Set 7', start: 0, span: 3, tone: 'due' },
          { text: 'Lab prep', start: 5, span: 2 },
        ],
      },
      { label: 'Wed', blocks: [{ text: 'Read Ch. 6', start: 3, span: 2 }] },
      { label: 'Thu', blocks: [{ text: 'Midterm review', start: 1, span: 5, tone: 'exam' }] },
      {
        label: 'Fri',
        blocks: [
          { text: 'Essay outline', start: 0, span: 2 },
          { text: 'Flashcards', start: 4, span: 2 },
        ],
      },
    ],
  },
  'focus-timer': {
    kind: 'timer',
    title: 'Focus · Problem Set 7',
    time: '18:42',
    phase: 'Focus block',
    done: 3,
    total: 4,
  },
};

export function FeaturePanel({ slug }: { slug: string }) {
  const panel = PANELS[slug];
  if (!panel) return null;

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.window}>
        <div className={styles.chrome}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.title}>{panel.title}</span>
        </div>
        <div className={styles.body}>{renderBody(panel)}</div>
      </div>
    </div>
  );
}

function renderBody(panel: Panel) {
  switch (panel.kind) {
    case 'rows':
      return (
        <div className={styles.rows}>
          {panel.rows.map((r) => (
            <div key={r.left} className={styles.row} data-tone={r.tone}>
              <span className={styles.check} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{r.left}</span>
                {r.sub ? <span className={styles.rowSub}>{r.sub}</span> : null}
              </span>
              <span className={styles.rowRight}>{r.right}</span>
            </div>
          ))}
        </div>
      );

    case 'card':
      return (
        <div className={styles.card}>
          <div className={styles.face}>
            <span className={styles.faceLabel}>Front</span>
            <p className={styles.faceText}>{panel.front}</p>
          </div>
          <div className={styles.face} data-back="true">
            <span className={styles.faceLabel}>Back</span>
            <p className={styles.faceText}>{panel.back}</p>
          </div>
          <div className={styles.grades}>
            {panel.grades.map((g) => (
              <span key={g} className={styles.grade}>
                {g}
              </span>
            ))}
          </div>
        </div>
      );

    case 'chat':
      return (
        <div className={styles.chat}>
          <div className={styles.ask}>{panel.ask}</div>
          <div className={styles.reply}>
            {panel.reply}
            <span className={styles.source}>{panel.source}</span>
          </div>
        </div>
      );

    case 'grades':
      return (
        <div className={styles.grid}>
          <div className={styles.overall}>
            <span className={styles.overallNum}>{panel.overall}</span>
            <span className={styles.overallLetter}>{panel.letter}</span>
          </div>
          {panel.parts.map((p) => (
            <div key={p.name} className={styles.part}>
              <span className={styles.partName}>{p.name}</span>
              <span className={styles.partBar}>
                <span className={styles.partFill} style={{ width: `${p.weight * 2.2}%` }} />
              </span>
              <span className={styles.partScore}>{p.score}</span>
            </div>
          ))}
        </div>
      );

    case 'schedule':
      return (
        <div className={styles.week}>
          {panel.days.map((d) => (
            <div key={d.label} className={styles.day}>
              <span className={styles.dayLabel}>{d.label}</span>
              <span className={styles.track}>
                {d.blocks.map((b) => (
                  <span
                    key={b.text}
                    className={styles.block}
                    data-tone={b.tone}
                    style={{ top: `${b.start * 26}px`, height: `${b.span * 26 - 4}px` }}
                  >
                    {b.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      );

    case 'timer':
      return (
        <div className={styles.timer}>
          <div className={styles.ring}>
            <span className={styles.ringTime}>{panel.time}</span>
          </div>
          <span className={styles.phase}>{panel.phase}</span>
          <div className={styles.pips}>
            {Array.from({ length: panel.total }, (_, i) => (
              <span key={i} className={styles.pip} data-on={i < panel.done} />
            ))}
          </div>
        </div>
      );
  }
}
