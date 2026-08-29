/**
 * The words the Watch, the complication and the home-screen widget display.
 *
 * All three are native targets with no localisation of their own — no `.lproj`,
 * no `String(localized:)`, nothing in the shipped bundles — while the phone and
 * the App Store listing are both bilingual. A Spanish student got a Spanish
 * phone and an English wrist.
 *
 * The obvious fix is a `.lproj` per target. This does something better, because
 * all three surfaces already receive a payload from the phone: the phone sends
 * its vocabulary along with its data, and the native code looks each label up
 * with a built-in English fallback. That buys two things at once. The Watch and
 * the widget become localised, and their wording becomes changeable over the
 * air — a `.lproj` would have left every future copy edit needing an App Store
 * build.
 *
 * The split is deliberate: **words travel, logic does not.** The Watch still
 * decides for itself whether a task is due today, because it re-derives that
 * from the raw date every time it draws — which is what makes a row that said
 * "Tomorrow" last night say "Today" this morning without the phone having
 * synced. What it can no longer decide is what those two words are.
 *
 * Failure is safe in both directions. A payload from an older phone build
 * carries no `strings` at all and every surface falls back to the English it
 * shipped with; a payload from a newer phone carrying keys a native build has
 * never heard of is ignored. Neither can crash, and neither needs a schema
 * bump — which matters, because bumping the Watch schema would make every
 * already-installed Watch show its "update Semora" warning for no reason.
 */

export type SurfaceLocale = 'en' | 'es';

/**
 * Every label, in both languages.
 *
 * Placeholders are `{n}` and are substituted natively, because the numbers they
 * carry are recomputed on the device — a freshness label that said "2m ago"
 * when the phone sent it would be wrong within the minute.
 */
const STRINGS: Record<string, { en: string; es: string }> = {
  // ── Watch: counts ─────────────────────────────────────────────────────────
  'watch.today': { en: 'Today', es: 'Hoy' },
  'watch.overdue': { en: 'Overdue', es: 'Atrasado' },

  // ── Watch: states ─────────────────────────────────────────────────────────
  'watch.signedOut.title': { en: 'Signed out', es: 'Sesión cerrada' },
  'watch.signedOut.body': {
    en: 'Sign in on your iPhone to see your work here.',
    es: 'Inicia sesión en tu iPhone para ver tus tareas aquí.',
  },
  'watch.noData.title': { en: 'No data yet', es: 'Aún no hay datos' },
  'watch.noData.sync': {
    en: 'Open Semora on your iPhone to sync.',
    es: 'Abre Semora en tu iPhone para sincronizar.',
  },
  'watch.noData.connecting': {
    en: 'Connecting to your iPhone…',
    es: 'Conectando con tu iPhone…',
  },
  'watch.allClear.title': { en: "You're all caught up", es: 'Estás al día' },
  'watch.allClear.body': {
    en: 'Nothing due today or coming up.',
    es: 'No vence nada hoy ni próximamente.',
  },
  'watch.nothingToday.title': { en: 'Nothing due today', es: 'Hoy no vence nada' },
  'watch.nothingToday.body': {
    en: 'Still {n} overdue on your iPhone.',
    es: 'Quedan {n} atrasadas en tu iPhone.',
  },

  // ── Watch: a row being completed from the wrist ───────────────────────────
  'watch.row.sending': { en: 'Sending…', es: 'Enviando…' },
  'watch.row.completed': { en: 'Completed', es: 'Completada' },
  'watch.row.failed': { en: "Didn't send · tap to retry", es: 'No se envió · toca para reintentar' },

  'watch.futureSchema': {
    en: 'Update Semora on your Watch to see everything your iPhone is sending.',
    es: 'Actualiza Semora en tu Apple Watch para ver todo lo que envía tu iPhone.',
  },

  // ── Freshness. {n} is filled in on the device, every redraw. ──────────────
  'watch.updated.never': { en: 'Not synced yet', es: 'Sin sincronizar aún' },
  'watch.updated.now': { en: 'Updated just now', es: 'Actualizado ahora mismo' },
  'watch.updated.minutes': { en: 'Updated {n}m ago', es: 'Actualizado hace {n} min' },
  'watch.updated.hours': { en: 'Updated {n}h ago', es: 'Actualizado hace {n} h' },
  'watch.updated.days': { en: 'Updated {n}d ago', es: 'Actualizado hace {n} d' },

  // ── Due labels. Recomputed natively from the raw date; only the words
  //    travel, so a row crossing midnight still relabels itself offline. ─────
  'due.today': { en: 'Today', es: 'Hoy' },
  'due.tomorrow': { en: 'Tomorrow', es: 'Mañana' },
  'due.yesterday': { en: 'Yesterday', es: 'Ayer' },
  'due.daysLate': { en: '{n}d late', es: '{n} d tarde' },
  'due.inDays': { en: 'In {n} days', es: 'En {n} días' },

  // ── Complication ──────────────────────────────────────────────────────────
  'complication.allCaught': { en: 'All caught up', es: 'Todo al día' },
  'complication.nothingToday': { en: 'Nothing due today', es: 'Hoy no vence nada' },
  'complication.signIn': { en: 'Sign in on iPhone', es: 'Inicia sesión en el iPhone' },
  'complication.late': { en: 'Late', es: 'Tarde' },
  'complication.lateLower': { en: 'late', es: 'tarde' },
  // Singular and plural kept as whole sentences rather than assembled from
  // parts. Spanish agrees the noun AND the adjective, so "{n} tarea atrasada"
  // and "{n} tareas atrasadas" differ in two places — a shared stem plus an "s"
  // produces the wrong sentence in one of the two languages whichever way it is
  // built. Named `count.*` rather than `complication.*` because the widget
  // shows the same sentences.
  'count.overdue.one': { en: '{n} task overdue', es: '{n} tarea atrasada' },
  'count.overdue.many': { en: '{n} tasks overdue', es: '{n} tareas atrasadas' },
  'count.dueToday.one': { en: '{n} task due today', es: '{n} tarea vence hoy' },
  'count.dueToday.many': { en: '{n} tasks due today', es: '{n} tareas vencen hoy' },
  'complication.overdueLower': { en: 'overdue', es: 'atrasadas' },
  'complication.todayLower': { en: 'today', es: 'hoy' },
  'complication.stale': { en: 'Not synced recently', es: 'Sin sincronizar hace rato' },
  'complication.empty': { en: 'Nothing due or overdue', es: 'Nada pendiente ni atrasado' },
  'complication.openPhone': { en: 'Open Semora on iPhone', es: 'Abre Semora en el iPhone' },
  'complication.inlineSignedOut': { en: 'Semora · open on iPhone', es: 'Semora · ábrelo en el iPhone' },

  // ── Home-screen widget ────────────────────────────────────────────────────
  'widget.overdue': { en: 'Overdue', es: 'Atrasado' },
  // The small widget prints just a number and this word beneath it.
  'widget.todayLower': { en: 'today', es: 'hoy' },
  'widget.upNext': { en: 'Up Next', es: 'Lo siguiente' },
  'widget.thisWeek': { en: 'This week', es: 'Esta semana' },
  'widget.dueThisWeek': { en: 'Due This Week', es: 'Vence esta semana' },
  'widget.allClear': { en: 'All clear', es: 'Todo despejado' },
  'widget.weekClear': { en: "Week's clear", es: 'Semana despejada' },
  'widget.nothingToday': { en: 'Nothing due today', es: 'Hoy no vence nada' },
  'widget.nothingThisWeek': {
    en: 'Nothing due in the next 7 days',
    es: 'No vence nada en los próximos 7 días',
  },
  'widget.scanPrompt': {
    en: 'Open Semora to scan a syllabus',
    es: 'Abre Semora para escanear un programa',
  },
};

/** Stable list of the keys, for tests and for anyone auditing coverage. */
export const SURFACE_STRING_KEYS: readonly string[] = Object.freeze(Object.keys(STRINGS).sort());

/**
 * The vocabulary to send with a payload.
 *
 * Flat `Record<string, string>` rather than anything nested, because it has to
 * survive `updateApplicationContext` and a `UserDefaults` round trip — both
 * accept only property-list types, and a flat map of strings is the shape least
 * able to surprise either of them.
 */
export function buildSurfaceStrings(locale: SurfaceLocale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, phrase] of Object.entries(STRINGS)) {
    out[key] = locale === 'es' ? phrase.es : phrase.en;
  }
  return out;
}

/**
 * What a native surface will show for a key when the payload has none.
 *
 * Exported so a test can assert the Swift fallbacks and this table have not
 * drifted apart — a fallback that no longer matches is invisible until the day
 * an old payload arrives, which is exactly when nobody is looking.
 */
export function englishFallback(key: string): string | null {
  return STRINGS[key]?.en ?? null;
}
