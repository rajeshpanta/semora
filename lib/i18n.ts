import { getLocales } from 'expo-localization';
import { ES } from '@/lib/i18n/es';
import { useAppStore, type AppLanguagePreference } from '@/store/appStore';

export type AppLocale = 'en' | 'es';

function lookupKey(value: string) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLocaleLowerCase('en-US');
}

const ES_BY_LOWER = new Map(Object.entries(ES).map(([english, spanish]) => [lookupKey(english), spanish]));

function systemLocale(): AppLocale {
  try {
    return getLocales()[0]?.languageCode?.toLowerCase() === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function resolveLocale(preference: AppLanguagePreference): AppLocale {
  return preference === 'system' ? systemLocale() : preference;
}

export function getAppLocale(): AppLocale {
  return resolveLocale(useAppStore.getState().languagePreference);
}

function spanishPattern(input: string): string | null {
  let match: RegExpMatchArray | null;

  match = input.match(/^(\d+) (task|tasks)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'tarea' : 'tareas'}`;
  match = input.match(/^(\d+) (course|courses)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'curso' : 'cursos'}`;
  match = input.match(/^(\d+) (card|cards)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'tarjeta' : 'tarjetas'}`;
  match = input.match(/^(\d+) (day|days)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'día' : 'días'}`;
  match = input.match(/^(\d+) (hour|hours)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'hora' : 'horas'}`;
  match = input.match(/^(\d+) (minute|minutes|min)$/i);
  if (match) return `${match[1]} min`;
  match = input.match(/^(\d+) (conflict|conflicts)$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'conflicto' : 'conflictos'}`;
  match = input.match(/^(\d+) waiting$/i);
  if (match) return `${match[1]} en espera`;
  match = input.match(/^due in (\d+) days?$/i);
  if (match) return `vence en ${match[1]} ${match[1] === '1' ? 'día' : 'días'}`;
  match = input.match(/^overdue by (\d+) days?$/i);
  if (match) return `atrasada por ${match[1]} ${match[1] === '1' ? 'día' : 'días'}`;
  match = input.match(/^(.+) due (.+)$/i);
  if (match) return `${match[1]} · entrega ${match[2]}`;
  match = input.match(/^Ask about (.+)…$/);
  if (match) return `Pregunta sobre ${match[1]}…`;
  match = input.match(/^Remove reminder (.+)$/);
  if (match) return `Quitar recordatorio ${match[1]}`;
  match = input.match(/^Clear (date|time)$/i);
  if (match) return match[1].toLowerCase() === 'date' ? 'Borrar fecha' : 'Borrar hora';
  match = input.match(/^Create a new (task|course|semester)$/i);
  if (match) return `Crear ${match[1].toLowerCase() === 'task' ? 'una tarea' : match[1].toLowerCase() === 'course' ? 'un curso' : 'un semestre'}`;
  match = input.match(/^(.+) · Semora$/);
  if (match) return `${translate(match[1], 'es')} · Semora`;
  match = input.match(/^(\d+) missing assignments?$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'tarea pendiente' : 'tareas pendientes'}`;
  match = input.match(/^(.+) is the first recovery target(?: in (.+))?\.$/);
  if (match) return `${match[1]} es la primera tarea que conviene recuperar${match[2] ? ` en ${match[2]}` : ''}.`;
  match = input.match(/^Finish (.+)$/);
  if (match) return `Completar ${match[1]}`;
  match = input.match(/^Highest-impact missing work at (.+)% of the grade\.$/);
  if (match) return `Es el trabajo pendiente de mayor impacto: ${match[1]} % de la calificación.`;
  match = input.match(/^(.+) needs attention$/);
  if (match) return `${match[1]} requiere atención`;
  match = input.match(/^Recent grades are down (\d+) points(?:; current estimate (.+)%)?\.$/);
  if (match) return `Las calificaciones recientes bajaron ${match[1]} puntos${match[2] ? `; la estimación actual es ${match[2]} %` : ''}.`;
  match = input.match(/^Current grade estimate is (.+)%\.$/);
  if (match) return `La calificación estimada actual es ${match[1]} %.`;
  match = input.match(/^Review (.+)$/);
  if (match) return `Revisar ${match[1]}`;
  match = input.match(/^(\d+) deadlines are competing for time\. Build the study plan before the week gets away from you\.$/);
  if (match) return `${match[1]} entregas compiten por tu tiempo. Crea el plan de estudio antes de que avance la semana.`;
  match = input.match(/^(\d+) missed sessions? was carried into the next available study slots\.$/);
  if (match) return `${match[1] === '1' ? 'Una sesión omitida se reprogramó' : `${match[1]} sesiones omitidas se reprogramaron`} en los próximos espacios disponibles.`;
  match = input.match(/^Recent completions cluster around (.+), so sessions now respect that rhythm without overriding your selected start time\.$/);
  if (match) return `Tus sesiones completadas se concentran cerca de las ${match[1]}; el plan respeta ese ritmo sin cambiar la hora que elegiste.`;
  match = input.match(/^Recent completions suggest you follow through best on (.+)\. Sessions now begin no earlier than your preferences and learned rhythm\.$/);
  if (match) return `Tus avances recientes indican que rindes mejor los ${match[1].replace(' and ', ' y ')}. Las sesiones respetan tus preferencias y el ritmo aprendido.`;
  match = input.match(/^(\d+) class or calendar conflicts? was kept clear, including a 10-minute transition buffer\.$/);
  if (match) return `Se evitaron ${match[1]} ${match[1] === '1' ? 'conflicto' : 'conflictos'} de clases o calendario, con 10 minutos de transición.`;
  match = input.match(/^(.+) is within a week, so its review time is spread across earlier available sessions\.$/);
  if (match) return `${match[1]} es dentro de una semana, por lo que el repaso se distribuyó entre sesiones anteriores.`;
  match = input.match(/^(\d+) minutes due in the planning window did not fit\. The plan prioritized the closest and highest-impact work first\.$/);
  if (match) return `No fue posible programar ${match[1]} minutos dentro del periodo. El plan dio prioridad a las entregas más cercanas y de mayor impacto.`;
  match = input.match(/^Learning from (\d+) completed sessions? · usually around (.+)$/);
  if (match) return `Aprendiendo de ${match[1]} ${match[1] === '1' ? 'sesión completada' : 'sesiones completadas'} · normalmente cerca de las ${match[2]}`;
  match = input.match(/^You['’]ve reached today['’]s tutor limit of (\d+) messages\. Please try again in 24 hours\.$/);
  if (match) return `Alcanzaste el límite diario de ${match[1]} mensajes del tutor. Inténtalo de nuevo en 24 horas.`;
  return null;
}

export function translate(input: unknown, locale: AppLocale = getAppLocale()): string {
  if (typeof input !== 'string' || locale === 'en' || input.length === 0) return String(input ?? '');
  const exact = ES[input];
  if (exact) return exact;
  const trimmed = input.trim();
  const suffixMatch = trimmed.match(/^(.+?)(\s*[:*])$/);
  const bare = suffixMatch?.[1] ?? trimmed;
  let translated = ES[trimmed] ?? ES[bare] ?? ES_BY_LOWER.get(lookupKey(bare)) ?? spanishPattern(trimmed);
  if (!translated) return input;
  if (bare === bare.toLocaleUpperCase('en-US') && /[A-Z]/.test(bare)) translated = translated.toLocaleUpperCase('es-US');
  if (suffixMatch && !ES[trimmed]) translated += suffixMatch[2];
  if (trimmed === input) return translated;
  return input.replace(trimmed, translated);
}

export function languageName(preference: AppLanguagePreference, locale = getAppLocale()): string {
  if (preference === 'system') return translate('Use device language', locale);
  if (preference === 'es') return 'Español';
  return translate('English', locale);
}

export function localeTag(locale: AppLocale = getAppLocale()): string {
  return locale === 'es' ? 'es-US' : 'en-US';
}

export function useI18n() {
  const preference = useAppStore((state) => state.languagePreference);
  const locale = resolveLocale(preference);
  return {
    locale,
    preference,
    t: (input: unknown) => translate(input, locale),
    localeTag: localeTag(locale),
    setPreference: useAppStore.getState().setLanguagePreference,
  };
}
