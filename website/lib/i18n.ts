export type SiteLocale = 'en' | 'es';

export interface LocaleRoutePair {
  en: string;
  es: string;
}

/**
 * One canonical translation map for navigation and locale routing. SEO
 * consumers use the indexable subset exported below: a translated route can
 * remain useful to readers and the language switcher without being advertised
 * as an indexable hreflang alternate before its content is ready.
 */
export const LOCALE_ROUTE_PAIRS: LocaleRoutePair[] = [
  { en: '/', es: '/es' },
  { en: '/about', es: '/es/acerca-de' },
  { en: '/download', es: '/es/descargar' },
  { en: '/features', es: '/es/funciones' },
  { en: '/pricing', es: '/es/precios' },
  { en: '/support', es: '/es/ayuda' },
  { en: '/privacy', es: '/es/privacidad' },
  { en: '/terms', es: '/es/terminos' },
  { en: '/blog', es: '/es/blog' },
  { en: '/compare', es: '/es/comparar' },
  { en: '/gpa-calculator', es: '/es/calculadora-gpa' },
  { en: '/pomodoro-timer', es: '/es/temporizador-pomodoro' },
  { en: '/ai-syllabus-scanner', es: '/es/escaner-de-programa-de-estudios' },
  { en: '/ai-study-planner-for-college', es: '/es/planificador-de-estudio-con-ia' },
  { en: '/canvas-deadline-tracker', es: '/es/seguimiento-de-fechas-de-canvas' },
  { en: '/assignment-tracker-app', es: '/es/app-para-seguir-tareas' },
  { en: '/blackboard-assignment-tracker', es: '/es/seguimiento-de-tareas-de-blackboard' },
  { en: '/ai-flashcard-generator', es: '/es/generador-de-tarjetas-con-ia' },
  { en: '/ai-tutor-for-college-students', es: '/es/tutor-con-ia-para-universitarios' },

  { en: '/features/syllabus-scanner', es: '/es/funciones/escaner-de-programas' },
  { en: '/features/grade-tracking', es: '/es/funciones/calificaciones' },
  { en: '/features/smart-plan', es: '/es/funciones/plan-inteligente' },
  { en: '/features/flashcards', es: '/es/funciones/tarjetas-de-estudio' },
  { en: '/features/focus-timer', es: '/es/funciones/temporizador-de-enfoque' },
  { en: '/features/ai-tutor', es: '/es/funciones/tutor-con-ia' },
  { en: '/features/collaboration', es: '/es/funciones/espacios-de-curso' },
  { en: '/features/canvas-sync', es: '/es/funciones/sincronizacion-canvas' },
  { en: '/features/lecture-recording', es: '/es/funciones/grabacion-de-clases' },
  { en: '/features/apple-watch', es: '/es/funciones/apple-watch' },

  { en: '/blog/syllabus-to-semester-calendar', es: '/es/blog/convertir-programa-en-calendario' },
  { en: '/blog/best-college-deadline-tracking-apps-2026', es: '/es/blog/mejores-apps-fechas-universidad-2026' },
  { en: '/blog/canvas-deadline-reminders', es: '/es/blog/recordatorios-fechas-canvas' },
  { en: '/blog/pomodoro-technique-between-classes', es: '/es/blog/tecnica-pomodoro-entre-clases' },
  { en: '/blog/finals-week-study-plan', es: '/es/blog/plan-de-estudio-para-finales' },
  { en: '/blog/best-ai-study-apps-for-college-2026', es: '/es/blog/mejores-apps-de-estudio-con-ia-2026' },
  { en: '/blog/ai-flashcards-from-lecture-notes', es: '/es/blog/tarjetas-de-estudio-con-ia' },
  { en: '/blog/grade-needed-on-final-exam', es: '/es/blog/que-nota-necesito-en-el-examen-final' },
  { en: '/blog/what-assignment-weights-mean', es: '/es/blog/que-significa-que-valga-20-por-ciento' },
  { en: '/blog/first-two-weeks-of-semester', es: '/es/blog/primeras-dos-semanas-del-semestre' },
  { en: '/blog/how-to-study-for-midterms', es: '/es/blog/como-estudiar-para-los-parciales' },

  { en: '/compare/dormway', es: '/es/comparar/dormway' },
  { en: '/compare/shovel', es: '/es/comparar/shovel' },
  { en: '/compare/studyfetch', es: '/es/comparar/studyfetch' },
  { en: '/compare/mindgrasp', es: '/es/comparar/mindgrasp' },
  { en: '/compare/taskade', es: '/es/comparar/taskade' },
  { en: '/compare/studley-ai', es: '/es/comparar/studley-ai' },
  { en: '/compare/myhomework', es: '/es/comparar/myhomework' },

  { en: '/dormway-alternative', es: '/es/alternativa-a-dormway' },
  { en: '/shovel-alternative', es: '/es/alternativa-a-shovel' },
  { en: '/studyfetch-alternative', es: '/es/alternativa-a-studyfetch' },
  { en: '/mindgrasp-alternative', es: '/es/alternativa-a-mindgrasp' },
  { en: '/myhomework-alternative', es: '/es/alternativa-a-myhomework' },
];

/**
 * Accessible Spanish translations that are intentionally excluded from search
 * until they have substantive, independently useful Spanish copy.
 *
 * Keep these as exact paths rather than prefix rules: /es/comparar itself is a
 * useful index page, and future comparison pages should not silently inherit
 * noindex without an explicit content review.
 */
export const SPANISH_NOINDEX_PATHS = [
  '/es/comparar/dormway',
  '/es/comparar/shovel',
  '/es/comparar/studyfetch',
  '/es/comparar/mindgrasp',
  '/es/comparar/taskade',
  '/es/comparar/studley-ai',
  '/es/comparar/myhomework',
  '/es/alternativa-a-dormway',
  '/es/alternativa-a-shovel',
  '/es/alternativa-a-studyfetch',
  '/es/alternativa-a-mindgrasp',
  '/es/alternativa-a-myhomework',
] as const;

const SPANISH_NOINDEX_PATH_SET = new Set<string>(SPANISH_NOINDEX_PATHS);

const EN_TO_ES = new Map(LOCALE_ROUTE_PAIRS.map((pair) => [pair.en, pair.es]));
const ES_TO_EN = new Map(LOCALE_ROUTE_PAIRS.map((pair) => [pair.es, pair.en]));

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function isSpanishNoindexPath(pathname: string): boolean {
  return SPANISH_NOINDEX_PATH_SET.has(normalizePath(pathname));
}

/** Route pairs safe to publish in hreflang metadata and the sitemap. */
export const INDEXABLE_LOCALE_ROUTE_PAIRS = LOCALE_ROUTE_PAIRS.filter(
  (pair) => !isSpanishNoindexPath(pair.es),
);

/**
 * Does this exact page exist in the other language?
 *
 * The switcher falls back to the other locale's homepage for anything
 * unmapped, which is right for a stray URL and wrong for the share landings:
 * /join/[token], /invite/[code] and /collaborate/[token] are English-only by
 * design, so switching there silently threw away the token the recipient
 * arrived with and dropped them on a homepage. A control that discards what
 * you came for is worse than no control, so the switcher hides itself instead
 * — see LanguageSwitcher.
 */
export function hasLocalePair(locale: SiteLocale, pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return locale === 'es' ? ES_TO_EN.has(normalized) : EN_TO_ES.has(normalized);
}

export function englishToSpanishPath(pathname: string): string {
  return EN_TO_ES.get(normalizePath(pathname)) ?? '/es';
}

export function spanishToEnglishPath(pathname: string): string {
  return ES_TO_EN.get(normalizePath(pathname)) ?? '/';
}

export function localizedPath(locale: SiteLocale, englishPath: string): string {
  if (!englishPath.startsWith('/')) return englishPath;
  return locale === 'es' ? englishToSpanishPath(englishPath) : englishPath;
}

export function localeAlternates(pair: LocaleRoutePair) {
  return {
    canonical: pair.es,
    languages: {
      'en-US': pair.en,
      es: pair.es,
      'x-default': pair.en,
    },
  } as const;
}

export function getRoutePairBySpanishPath(pathname: string): LocaleRoutePair | undefined {
  const normalized = normalizePath(pathname);
  return LOCALE_ROUTE_PAIRS.find((pair) => pair.es === normalized);
}
