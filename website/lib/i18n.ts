export type SiteLocale = 'en' | 'es';

export interface LocaleRoutePair {
  en: string;
  es: string;
}

/**
 * One canonical translation map for navigation, hreflang metadata, the
 * sitemap, and the language switcher. Keeping those four consumers on the
 * same list prevents a translated page from being indexable but unreachable
 * (or reachable but missing its English counterpart).
 */
export const LOCALE_ROUTE_PAIRS: LocaleRoutePair[] = [
  { en: '/', es: '/es' },
  { en: '/about', es: '/es/acerca-de' },
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

  { en: '/features/syllabus-scanner', es: '/es/funciones/escaner-de-programas' },
  { en: '/features/grade-tracking', es: '/es/funciones/calificaciones' },
  { en: '/features/smart-plan', es: '/es/funciones/plan-inteligente' },
  { en: '/features/flashcards', es: '/es/funciones/tarjetas-de-estudio' },
  { en: '/features/focus-timer', es: '/es/funciones/temporizador-de-enfoque' },
  { en: '/features/ai-tutor', es: '/es/funciones/tutor-con-ia' },
  { en: '/features/collaboration', es: '/es/funciones/espacios-de-curso' },
  { en: '/features/canvas-sync', es: '/es/funciones/sincronizacion-canvas' },

  { en: '/blog/syllabus-to-semester-calendar', es: '/es/blog/convertir-programa-en-calendario' },
  { en: '/blog/weighted-gpa-calculator', es: '/es/blog/calcular-gpa-ponderado' },
  { en: '/blog/best-college-deadline-tracking-apps-2026', es: '/es/blog/mejores-apps-fechas-universidad-2026' },
  { en: '/blog/canvas-deadline-reminders', es: '/es/blog/recordatorios-fechas-canvas' },
  { en: '/blog/pomodoro-technique-between-classes', es: '/es/blog/tecnica-pomodoro-entre-clases' },
  { en: '/blog/finals-week-study-plan', es: '/es/blog/plan-de-estudio-para-finales' },

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

const EN_TO_ES = new Map(LOCALE_ROUTE_PAIRS.map((pair) => [pair.en, pair.es]));
const ES_TO_EN = new Map(LOCALE_ROUTE_PAIRS.map((pair) => [pair.es, pair.en]));

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
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
