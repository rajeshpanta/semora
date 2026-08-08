import { getLocales } from 'expo-localization';
import { ES } from '@/lib/i18n/es';
import { useAppStore, type AppLanguagePreference } from '@/store/appStore';

export type AppLocale = 'en' | 'es';

function lookupKey(value: string) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // ASCII three-dots and the ellipsis character are interchangeable in the
    // codebase ('Restoring...' vs the catalogue's 'Restoring…'); without this
    // the lookup missed and the string stayed English.
    .replace(/\.{3}/g, '…')
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

  // Strings assembled from JSX split by inline expressions, so they never
  // appear in the phrase map as whole sentences. Kept at the top of the chain
  // because each is more specific than the generic count patterns below, and a
  // generic rule matching first is how "Next up:" lost its label once already.
  match = input.match(/^NEXT (\d+) DAYS$/);
  if (match) return `PRÓXIMOS ${match[1]} DÍAS`;
  match = input.match(/^(\d+)m\/day · (\d+)m sessions$/);
  if (match) return `${match[1]} min/día · sesiones de ${match[2]} min`;
  match = input.match(/^Today · (\d+) items?$/i);
  if (match) return `Hoy · ${match[1]} ${match[1] === '1' ? 'elemento' : 'elementos'}`;

  // Scan review + upload — the hero flow, so these are the most-seen strings in
  // the app after the Today tab.
  match = input.match(/^(\d+) items found$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'elemento encontrado' : 'elementos encontrados'}`;
  match = input.match(/^(\d+) selected to save$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'seleccionado' : 'seleccionados'} para guardar`;
  match = input.match(/^Save (\d+) tasks?$/);
  if (match) return `Guardar ${match[1]} ${match[1] === '1' ? 'tarea' : 'tareas'}`;
  match = input.match(/^Found (\d+) deadlines?!$/);
  if (match) return `¡${match[1]} ${match[1] === '1' ? 'fecha de entrega encontrada' : 'fechas de entrega encontradas'}!`;

  // Grade card / dashboard / insights counters.
  // Insights headline. Without this the generic "<x> due <y>" rule turned
  // "12/20 due so far" into "12/20 · entrega so far" — Spanglish on a Pro screen.
  match = input.match(/^(\d+)\/(\d+) due so far$/);
  if (match) return `${match[1]}/${match[2]} vencidas hasta ahora`;
  match = input.match(/^(\d+) of (\d+) graded$/);
  if (match) return `${match[1]} de ${match[2]} ${match[2] === '1' ? 'calificada' : 'calificadas'}`;
  match = input.match(/^(\d+)% still to play for$/);
  if (match) return `Aún queda ${match[1]} % en juego`;
  match = input.match(/^(\d+) missing$/);
  if (match) return `${match[1]} sin entregar`;
  match = input.match(/^(\d+) left$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'pendiente' : 'pendientes'}`;

  // Paywall annual-savings badge.
  match = input.match(/^SAVE (\d+)%$/);
  if (match) return `AHORRA ${match[1]} %`;

  // Task detail — the screen a student opens most often after Today.
  match = input.match(/^(\d+)% of grade( \(extra credit\))?$/);
  if (match) return `${match[1]} % de la nota${match[2] ? ' (crédito extra)' : ''}`;
  match = input.match(/^(High|Low|Normal) priority$/);
  if (match) return `Prioridad ${match[1] === 'High' ? 'alta' : match[1] === 'Low' ? 'baja' : 'normal'}`;
  // (No `… effort` rule here: one already exists further down, and adding a
  // second earlier in the chain would shadow it. The audit only flagged it
  // because the probe rendered the pluralising ternary as a digit.)
  match = input.match(/^(\d+)\/(\d+) done$/);
  if (match) return `${match[1]}/${match[2]} completadas`;
  match = input.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?) points$/);
  if (match) return `${match[1]}/${match[2]} puntos`;
  match = input.match(/^This assignment is worth (\d+)% of your grade$/);
  if (match) return `Esta tarea vale el ${match[1]} % de tu nota`;
  match = input.match(/^Enter your percentage score on this (\d+)% assignment$/);
  if (match) return `Introduce tu porcentaje en esta tarea que vale el ${match[1]} %`;
  match = input.match(/^Estimated maximum: (\d+)% until the final grade is posted$/);
  if (match) return `Máximo estimado: ${match[1]} % hasta que se publique la nota final`;
  match = input.match(/^Estimated maximum before grading: (\d+)%$/);
  if (match) return `Máximo estimado antes de calificar: ${match[1]} %`;

  // Grade projection — the "what do I need?" guidance.
  match = input.match(/^See the exact average you need on your remaining (\d+)% of coursework to land an (.+?) — or any grade\. Computed from this course['’]s real weights\.$/);
  if (match) return `Consulta la nota media exacta que necesitas en el ${match[1]} % de trabajo que te queda para sacar un ${match[2]} — o cualquier otra nota. Calculado con los pesos reales de este curso.`;
  match = input.match(/^If you earn (\d+)% on (.+)$/);
  if (match) return `Si sacas un ${match[1]} % en ${match[2]}`;

  // Seen untranslated on the Spanish simulator build: the Courses card badge,
  // the Scan screen's page-limit note, and the Focus timer's background hint.
  match = input.match(/^(\d+) UP NEXT$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'PENDIENTE' : 'PENDIENTES'}`;
  match = input.match(/^Photo scans support up to (\d+) pages per scan — snap page after page, or multi-select from your library\. Longer syllabus\? Upload a PDF\.$/);
  if (match) return `Los escaneos con foto admiten hasta ${match[1]} páginas por escaneo: fotografía una página tras otra o selecciona varias de tu galería. ¿Programa más largo? Sube un PDF.`;
  match = input.match(/^The timer keeps running in the background\. You['’]ll get a ?notification the moment your (focus block|break) ends\.$/);
  if (match) return `El temporizador sigue funcionando en segundo plano. Recibirás una notificación en cuanto termine tu ${match[1] === 'break' ? 'descanso' : 'bloque de enfoque'}.`;

  // Smart Plan capacity warning. Previously the greedy "<x> due <y>" rule
  // mangled this into half-Spanish; with that rule guarded it needs a real one.
  match = input.match(/^Your current capacity leaves (.+?) due within two weeks unscheduled\. Increase daily time or reduce task estimates\.$/);
  if (match) return `Con tu capacidad actual quedan ${translate(match[1], 'es')} sin programar que vencen en dos semanas. Aumenta el tiempo diario o reduce las estimaciones de tus tareas.`;

  // ── Remaining text-around-a-value strings (audit sweep) ─────────────────
  // Each of these is JSX text interleaved with a value, so it only ever exists
  // as a joined string at runtime and can never be a dictionary entry.
  match = input.match(/^(.+) · (\d+) items?$/);
  if (match) return `${translate(match[1], 'es')} · ${match[2]} ${match[2] === '1' ? 'elemento' : 'elementos'}`;
  match = input.match(/^(\d+) of (\d+) courses · (\d+) graded credits$/);
  if (match) return `${match[1]} de ${match[2]} cursos · ${match[3]} créditos calificados`;
  match = input.match(/^(\d+)-day streak 🔥$/);
  if (match) return `Racha de ${match[1]} ${match[1] === '1' ? 'día' : 'días'} 🔥`;
  match = input.match(/^Today['’]s classes · (\d+)$/);
  if (match) return `Clases de hoy · ${match[1]}`;
  match = input.match(/^Overdue · (\d+)$/);
  if (match) return `Atrasadas · ${match[1]}`;
  match = input.match(/^(\d+)d late$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'día' : 'días'} de retraso`;
  match = input.match(/^Show (\d+) more$/);
  if (match) return `Ver ${match[1]} más`;
  match = input.match(/^(\d+) need grade$/);
  if (match) return `${match[1]} sin calificar`;
  match = input.match(/^Tomorrow · (.+)$/);
  if (match) return `Mañana · ${match[1]}`;
  match = input.match(/^(\d+) (member|members) · Your role: (.+)$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'integrante' : 'integrantes'} · Tu rol: ${translate(match[3], 'es')}`;
  match = input.match(/^View original(?: · (.+))?$/);
  if (match) return `Ver original${match[1] ? ` · ${match[1]}` : ''}`;
  match = input.match(/^(\d+) lowest grades? currently dropped$/);
  if (match) return `Se ${match[1] === '1' ? 'descarta' : 'descartan'} ${match[1] === '1' ? 'la nota más baja' : `las ${match[1]} notas más bajas`}`;
  match = input.match(/^Tasks \((\d+)\)$/);
  if (match) return `Tareas (${match[1]})`;
  match = input.match(/^Cards \((\d+)\)$/);
  if (match) return `Tarjetas (${match[1]})`;
  match = input.match(/^Crunch week: (.+)$/);
  if (match) return `Semana intensa: ${match[1]}`;
  match = input.match(/^(\d+) (?:deadline|deadlines) stack up that week\.? ?(Get ahead now\.)?$/);
  if (match) {
    const body = `${match[1]} ${match[1] === '1' ? 'entrega se acumula' : 'entregas se acumulan'} esa semana`;
    return match[2] ? `${body}. Ponte al día ahora.` : body;
  }
  match = input.match(/^You reviewed (\d+) cards?\.$/);
  if (match) return `Repasaste ${match[1]} ${match[1] === '1' ? 'tarjeta' : 'tarjetas'}.`;
  match = input.match(/^Semora excludes the (\d+) lowest graded items? once enough grades exist\.$/);
  if (match) return `Semora descarta ${match[1] === '1' ? 'el trabajo calificado más bajo' : `los ${match[1]} trabajos calificados más bajos`} cuando haya suficientes notas.`;
  match = input.match(/^You're seeing the next (\d+) days$/);
  if (match) return `Estás viendo los próximos ${match[1]} días`;
  match = input.match(/^Pro plans a full (\d+) days ahead and rolls missed sessions ?forward automatically\.$/);
  if (match) return `Pro planifica ${match[1]} días completos por adelantado y reprograma automáticamente las sesiones omitidas.`;
  match = input.match(/^Moved from (.+)$/);
  if (match) return `Movida desde ${match[1]}`;
  match = input.match(/^Focusing on (.+)$/);
  if (match) return `Enfocado en ${match[1]}`;
  match = input.match(/^Reconnect (.+)$/);
  if (match) return `Volver a conectar ${match[1]}`;
  match = input.match(/^(.+) sync · (.+)$/);
  if (match) return `Sincronización ${translate(match[1], 'es')} · ${translate(match[2], 'es')}`;
  match = input.match(/^Courses \((\d+) selected\)$/);
  if (match) return `Cursos (${match[1]} ${match[1] === '1' ? 'seleccionado' : 'seleccionados'})`;
  match = input.match(/^Start (.+)$/);
  if (match) return `Inicio ${match[1]}`;
  match = input.match(/^(\d+) (risks?|signals?) worth attention — see them with Pro$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'señal que merece' : 'señales que merecen'} atención: míralas con Pro`;
  // The noun comes from the dictionary capitalised ("Sesión"), and Spanish
  // wants an article here, so lowercase it and supply one.
  match = input.match(/^Add a(?:nother)? (.+)$/);
  if (match) {
    const noun = translate(match[1], 'es').toLocaleLowerCase('es');
    return `${input.startsWith('Add another') ? 'Agregar otra' : 'Agregar una'} ${noun}`;
  }
  match = input.match(/^\+(\d+) more$/);
  if (match) return `+${match[1]} más`;
  match = input.match(/^You have (\d+) pending tasks this semester\. Check your courses for upcoming deadlines\.$/);
  if (match) return `Tienes ${match[1]} tareas pendientes este semestre. Revisa tus cursos para ver las próximas entregas.`;

  // Today-tab coaching lines and the delete-account warning. Long, fully
  // interpolated sentences that only exist joined at runtime.
  match = input.match(/^You have (\d+) overdue\. Knock out the oldest first: (.+) \((.+)\) — (\d+)d late\.$/);
  if (match) {
    return `Tienes ${match[1]} ${match[1] === '1' ? 'tarea atrasada' : 'tareas atrasadas'}. Empieza por la más antigua: ${match[2]} (${match[3]}) — ${match[4]} ${match[4] === '1' ? 'día' : 'días'} de retraso.`;
  }
  match = input.match(/^Next exam: (.+) · (.+) — (.+) \((today|\d+ days?)\)\. A good time to start preparing\.$/);
  if (match) {
    const when = match[4] === 'today'
      ? 'hoy'
      : `en ${match[4].replace(/ days?$/, '')} ${match[4].startsWith('1 ') ? 'día' : 'días'}`;
    return `Próximo examen: ${match[1]} · ${match[2]} — ${match[3]} (${when}). Buen momento para empezar a prepararlo.`;
  }
  match = input.match(/^For security, we'll ask you to sign in again with (.+) before deleting your account\. Tap the button below to start\.$/);
  if (match) return `Por seguridad, te pediremos que vuelvas a iniciar sesión con ${match[1]} antes de eliminar tu cuenta. Toca el botón de abajo para empezar.`;
  match = input.match(/^All your semesters, courses, tasks, grades, uploaded syllabi, and course notes will be deleted\. This cannot be undone\.(?: Deleting your account does NOT cancel your Pro subscription — Apple keeps billing until you cancel it in Settings → Apple Account → Subscriptions\.)?$/);
  if (match) {
    const base = 'Se eliminarán todos tus semestres, cursos, tareas, calificaciones, programas subidos y apuntes. Esta acción no se puede deshacer.';
    return input.includes('Pro subscription')
      ? `${base} Eliminar tu cuenta NO cancela tu suscripción Pro: Apple seguirá cobrándote hasta que la canceles en Ajustes → Cuenta de Apple → Suscripciones.`
      : base;
  }

  // Grade card meta, built as template literals inside one expression child —
  // a shape the joined-JSX audit does not inspect, so these shipped in English
  // and were caught only by looking at a Spanish screenshot.
  match = input.match(/^(\d+)% of (\d+)% attempted$/);
  if (match) return `${match[1]} % de ${match[2]} % evaluado`;
  match = input.match(/^(\d+)% of category mix reporting$/);
  if (match) return `${match[1]} % de las categorías con datos`;

  // Tutor. The lookahead matters: a bare /^Explain (.+)$/ here would swallow
  // "Explain the assignment “…” and help me make a plan to complete it.",
  // which has its own rule further down and would never be reached.
  match = input.match(/^Explain (?!the assignment )(.+)$/);
  if (match) return `Explica ${match[1]}`;
  match = input.match(/^Sources: (.+)$/);
  if (match) return `Fuentes: ${match[1]}`;

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
  // Progress Insights / Workload metric fragments (found on-device during
  // pre-release QA — these render as interpolated JSX, so the joined string is
  // what reaches the lookup).
  match = input.match(/^(\d+)\/(\d+) tasks$/i);
  if (match) return `${match[1]}/${match[2]} ${match[2] === '1' ? 'tarea' : 'tareas'}`;
  match = input.match(/^(\d+)% complete$/i);
  if (match) return `${match[1]} % completado`;
  match = input.match(/^(\d+) left$/i);
  if (match) return `${match[1]} ${match[1] === '1' ? 'restante' : 'restantes'}`;
  // translate() trims before matching and re-inserts the surrounding
  // whitespace afterwards, so anchor on the trimmed form, not " · N weeks left".
  match = input.match(/^· (\d+) (week|weeks) left$/i);
  if (match) return `· ${match[1]} ${match[1] === '1' ? 'semana restante' : 'semanas restantes'}`;
  match = input.match(/^Next: (.+) · (.+)$/);
  if (match) return `Siguiente: ${match[1]} · ${match[2]}`;
  match = input.match(/^(\d+)m left$/i);
  if (match) return `quedan ${match[1]} min`;
  match = input.match(/^(\d+)h left$/i);
  if (match) return `quedan ${match[1]} h`;

  // These all MUST precede the generic "<x> due <y>" rule below, which blindly
  // inserts its own "·". Where the source string already carries one — the
  // "{course} · due in N days" shape used by StudySuggestionsCard and the Today
  // list — the generic rule produced "BIO 210 · · entrega in 34 days": a doubled
  // separator AND an untranslated tail, because the date phrase is a second
  // English fragment it never looks at.
  match = input.match(/^(.+?) · due in (\d+) days?$/i);
  if (match) return `${match[1]} · entrega en ${match[2]} ${match[2] === '1' ? 'día' : 'días'}`;
  match = input.match(/^(.+?) · due (today|tomorrow)$/i);
  if (match) return `${match[1]} · entrega ${match[2].toLowerCase() === 'today' ? 'hoy' : 'mañana'}`;
  match = input.match(/^(.+?) · due (.+)$/i);
  if (match) return `${match[1]} · entrega ${match[2]}`;
  match = input.match(/^due in (\d+) days?$/i);
  if (match) return `entrega en ${match[1]} ${match[1] === '1' ? 'día' : 'días'}`;

  // MUST precede the generic "<x> due <y>" rule below. The Today screen renders
  // "Next up: {title} ({course}) — due {date}" as mixed JSX, which the localized
  // Text wrapper joins into ONE string before translating; the generic rule then
  // matched first and returned "Next up: … — · entrega …", leaving the English
  // "Next up:" in place on an otherwise fully Spanish screen.
  match = input.match(/^Next up: (.+) \((.+)\) — due (.+)$/i);
  if (match) return `Lo siguiente: ${match[1]} (${match[2]}) · entrega ${match[3]}`;
  // "<item> due <when>" — a deadline chip, e.g. "Problem Set 1 due Friday".
  // The guard is the point. Without it this fires on ANY prose containing the
  // word "due" and splices "· entrega" into the middle of a sentence: the
  // onboarding line "Reminders before every due date. Deadlines synced to your
  // phone's calendar…" came out as "Reminders before every · entrega date.
  // Deadlines synced…" — mangled, on the second screen a new Spanish user sees.
  // A real chip is one short clause, so refuse anything that runs past a
  // sentence boundary or reads as prose.
  match = input.match(/^(.+) due (.+)$/i);
  if (match && !input.includes('. ') && input.length <= 72) {
    return `${match[1]} · entrega ${match[2]}`;
  }
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

  // Coverage fill (2026-08-06): rendered template strings from the same audit.
  match = input.match(/^due (\d{1,2}:\d{2})$/i);
  if (match) return `entrega ${match[1]}`;
  match = input.match(/^(\d+) shared deadlines and (\d+) group assignments are in your planner\.$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'entrega compartida' : 'entregas compartidas'} y ${match[2]} ${match[2] === '1' ? 'tarea grupal' : 'tareas grupales'} están en tu planificador.`;
  match = input.match(/^(\d+) current course deadlines are shared with classmates\.$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'entrega actual del curso está compartida' : 'entregas actuales del curso están compartidas'} con tus compañeros.`;
  match = input.match(/^Remove (.+?) from this space\? Their synced planner keeps what it already has\.$/);
    if (match) return `¿Quitar a ${match[1]} de este espacio? Su planificador sincronizado conserva lo que ya tiene.`;
  match = input.match(/^Give (.+?) owner control of this space\? They['’]ll be able to manage members, publish deadlines, and delete the space\. You['’]ll stay an owner too — after this you can leave if you want\.$/);
    if (match) return `¿Convertir a ${match[1]} en propietario de este espacio? Podrá administrar miembros, publicar fechas de entrega y eliminar el espacio. Tú también seguirás siendo propietario; después podrás salir si quieres.`;
  match = input.match(/^(\d+) invite links no longer work\.$/i);
    if (match) return `${match[1]} enlaces de invitación ya no funcionan.`;
  match = input.match(/^Archive (.+?)\? It disappears for everyone and outstanding invites stop working\. Already-synced planner items stay put\.$/);
    if (match) return `¿Archivar ${match[1]}? Desaparecerá para todos y las invitaciones pendientes dejarán de funcionar. Los elementos ya sincronizados en el planificador se conservan.`;
  match = input.match(/^Permanently delete (.+?) and all its shared deadlines and group work for everyone\? This can['’]t be undone\.$/);
    if (match) return `¿Eliminar de forma permanente ${match[1]} y todas sus entregas compartidas y su trabajo grupal para todos? Esto no se puede deshacer.`;
  match = input.match(/^Revoke (\d+) outstanding (invite|invites)$/i);
    if (match) return `Anular ${match[1]} ${match[1] === '1' ? 'invitación pendiente' : 'invitaciones pendientes'}`;
  match = input.match(/^Everyone in the space gets their own copy of "(.+?)" to study\. Their review progress stays theirs\.$/);
    if (match) return `Todos en el espacio reciben su propia copia de “${match[1]}” para estudiar. Su progreso de repaso es individual.`;
  match = input.match(/^(\d+) cards published to (.+?)\.$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'tarjeta publicada' : 'tarjetas publicadas'} en ${match[2]}.`;
  match = input.match(/^Study (\d+) due$/i);
    if (match) return `Estudiar ${match[1]} ${match[1] === '1' ? 'pendiente' : 'pendientes'}`;
  match = input.match(/^(\d+) (file|files) added — add another$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'archivo agregado' : 'archivos agregados'} — agrega otro`;
  match = input.match(/^Generate for (.+)$/);
    if (match) return `Generar para ${match[1]}`;
  match = input.match(/^([\s\S]+?)\n\nUpgrade to Pro to add this shared course\.$/);
    if (match) return `${translate(match[1], 'es')}\n\nMejora a Pro para agregar este curso compartido.`;
  match = input.match(/^(.+?) shared a course$/);
    if (match) return `${match[1]} compartió un curso`;
  match = input.match(/^Resend in (\d+)s$/i);
    if (match) return `Reenviar en ${match[1]} s`;
  match = input.match(/^Could not continue with (apple|google)\. Please try again\.$/i);
    if (match) return `No se pudo continuar con ${match[1].toLowerCase() === 'apple' ? 'Apple' : 'Google'}. Inténtalo de nuevo.`;
  match = input.match(/^Save your semester,\n(.+)\.$/);
    if (match) return `Guarda tu semestre,\n${match[1]}.`;
  match = input.match(/^(.+?) — one tap, and (.+?) is saved\.$/);
    if (match) return `${translate(match[1], 'es')}: un toque y ${translate(match[2], 'es')} queda guardado.`;
  match = input.match(/^One tap, and your (.+?) deadlines are saved\.$/);
    if (match) return `Un toque y tus entregas de ${translate(match[1], 'es')} quedan guardadas.`;
  match = input.match(/^Or (.+?)\/month with 7-day free trial$/i);
    if (match) return `O ${match[1]} al mes con 7 días de prueba gratis`;
  match = input.match(/^(\d+) (friend|friends) joined$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'amigo se unió' : 'amigos se unieron'}`;
  match = input.match(/^You['’]ve used your (\d+) free scans this month\. They reset on the 1st — or upgrade to Pro for unlimited syllabus scanning\.$/i);
    if (match) return `Ya usaste tus ${match[1]} escaneos gratis de este mes. Se restablecen el día 1; también puedes mejorar a Pro para escanear programas sin límite.`;
  match = input.match(/^This will use your last of (\d+) free scans this month\. After this you['’]ll need Pro \(or wait for the monthly reset\) for more\.$/i);
    if (match) return `Usarás el último de tus ${match[1]} escaneos gratis de este mes. Después necesitarás Pro (o esperar al restablecimiento mensual) para escanear más.`;
  match = input.match(/^You['’]ve captured (\d+) (page|pages)\. Scan (it|them) now, or discard\?$/i);
    if (match) return match[1] === '1' ? 'Capturaste 1 página. ¿La escaneas ahora o la descartas?' : `Capturaste ${match[1]} páginas. ¿Las escaneas ahora o las descartas?`;
  match = input.match(/^Scan (\d+) (page|pages)$/i);
    if (match) return `Escanear ${match[1]} ${match[1] === '1' ? 'página' : 'páginas'}`;
  match = input.match(/^Photo scans support up to (\d+) pages\. Scanning what you['’]ve captured — for longer syllabi, upload a PDF\.$/i);
    if (match) return `Los escaneos de fotos admiten hasta ${match[1]} páginas. Escanearemos lo que capturaste; para programas más largos, sube un PDF.`;
  match = input.match(/^Page (\d+) captured$/i);
    if (match) return `Página ${match[1]} capturada`;
  match = input.match(/^Add another page, or scan the (\d+) you have\? \(Up to (\d+) pages per scan\.\)$/i);
    if (match) return `¿Agregas otra página o escaneas ${match[1] === '1' ? 'la que tienes' : `las ${match[1]} que tienes`}? (Hasta ${match[2]} páginas por escaneo.)`;
  match = input.match(/^Photo scans support up to (\d+) pages — scanning the first (\d+) you selected\. For longer syllabi, upload a PDF\.$/i);
    if (match) return `Los escaneos de fotos admiten hasta ${match[1]} páginas; escanearemos las primeras ${match[2]} que seleccionaste. Para programas más largos, sube un PDF.`;
  match = input.match(/^(\d+) of (\d+) free scans left this month$/i);
    if (match) return `Te ${match[1] === '1' ? 'queda' : 'quedan'} ${match[1]} de ${match[2]} escaneos gratis este mes`;
  match = input.match(/^You have (\d+) free (scan|scans) left, but you['’]re at the free limit of (\d+) courses this semester\. Re-scan a course you already have, or upgrade to Pro to add a new one\.$/i);
    if (match) return `Te ${match[1] === '1' ? 'queda' : 'quedan'} ${match[1]} ${match[1] === '1' ? 'escaneo gratis' : 'escaneos gratis'}, pero alcanzaste el límite gratuito de ${match[3]} cursos este semestre. Vuelve a escanear un curso que ya tienes o mejora a Pro para agregar uno nuevo.`;
  match = input.match(/^You['’]ve used your free scans and reached the (\d+)-course limit\. Upgrade to Pro for unlimited scans and courses\.$/i);
    if (match) return `Ya usaste tus escaneos gratis y alcanzaste el límite de ${match[1]} cursos. Mejora a Pro para tener escaneos y cursos sin límite.`;
  match = input.match(/^Spring (\d{4})$/i);
    if (match) return `Primavera ${match[1]}`;
  match = input.match(/^Summer (\d{4})$/i);
    if (match) return `Verano ${match[1]}`;
  match = input.match(/^Fall (\d{4})$/i);
    if (match) return `Otoño ${match[1]}`;
  match = input.match(/^You just imported (\d+) (deadline|deadlines) 🎉$/i);
    if (match) return `Acabas de importar ${match[1]} ${match[1] === '1' ? 'fecha de entrega' : 'fechas de entrega'} 🎉`;
  match = input.match(/^Just (.+?)\/month$/i);
    if (match) return `Solo ${match[1]} al mes`;
  match = input.match(/^7-day free trial, then (.+?)\/month\. Cancel anytime\.$/i);
    if (match) return `7 días de prueba gratis y luego ${match[1]} al mes. Cancela cuando quieras.`;
  match = input.match(/^(?!7-day)(.+?)\/month\. Cancel anytime\.$/i);
    if (match) return `${match[1]} al mes. Cancela cuando quieras.`;
  match = input.match(/^(.+?) billed annually\. Cancel anytime\.$/i);
    if (match) return `${match[1]} al año. Cancela cuando quieras.`;
  match = input.match(/^(\d+) (task|tasks) added to your calendar\.$/i);
    if (match) return `${match[1] === '1' ? 'Se agregó 1 tarea' : `Se agregaron ${match[1]} tareas`} a tu calendario.`;
  match = input.match(/^(\d+) (class meeting|class meetings) added as repeating events until the semester ends\.$/i);
    if (match) return `${match[1] === '1' ? 'Se agregó 1 clase como evento repetido' : `Se agregaron ${match[1]} clases como eventos repetidos`} hasta que termine el semestre.`;
  match = input.match(/^(\d+) (task|tasks)(?: and (\d+) (class meeting|class meetings))? synced to calendar\.$/i);
    if (match) return `${match[1] === '1' && !match[3] ? 'Se sincronizó' : 'Se sincronizaron'} ${match[1]} ${match[1] === '1' ? 'tarea' : 'tareas'}${match[3] ? ` y ${match[3]} ${match[3] === '1' ? 'clase' : 'clases'}` : ''} con el calendario.`;
  match = input.match(/^(\d+) (task|tasks) synced to your Google Calendar\.$/i);
    if (match) return `${match[1] === '1' ? 'Se sincronizó 1 tarea' : `Se sincronizaron ${match[1]} tareas`} con tu Google Calendar.`;
  match = input.match(/^(\d+) assignments updated(?: · (\d+) need attention)?\.$/i);
    if (match) return `${match[1] === '1' ? 'Se actualizó 1 tarea' : `Se actualizaron ${match[1]} tareas`}${match[2] ? ` · ${match[2]} ${match[2] === '1' ? 'requiere' : 'requieren'} atención` : ''}.`;
  match = input.match(/^(\d+) (course|courses) and (\d+) assignments imported\.$/i);
    if (match) return `Se importaron ${match[1]} ${match[1] === '1' ? 'curso' : 'cursos'} y ${match[3]} ${match[3] === '1' ? 'tarea' : 'tareas'}.`;
  match = input.match(/^Connect your (.+?) account$/i);
    if (match) return `Conecta tu cuenta de ${match[1]}`;
  match = input.match(/^Updated (\d+)m ago$/i);
    if (match) return `Actualizado hace ${match[1]} min`;
  match = input.match(/^Updated (\d+)h ago$/i);
    if (match) return `Actualizado hace ${match[1]} h`;
  match = input.match(/^Updated (\d+)d ago$/i);
    if (match) return `Actualizado hace ${match[1]} d`;
  match = input.match(/^(\d+) pending · (.+)$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'pendiente' : 'pendientes'} · ${translate(match[2], 'es')}`;
  match = input.match(/^checked (.+)$/i);
    if (match) return `revisado ${match[1]}`;
  match = input.match(/^(?:(.+?) )?· Last synced (.+)$/i);
    if (match) return `${match[1] ? `${translate(match[1], 'es')} ` : ''}· Última sincronización: ${match[2]}`;
  match = input.match(/^(.+?) · (Automatic sync on|Device sync only)$/i);
    if (match) return `${translate(match[1], 'es')} · ${match[2].toLowerCase() === 'automatic sync on' ? 'Sincronización automática activada' : 'Solo sincronización en el dispositivo'}`;
  match = input.match(/^· completed (.+)$/);
    if (match) return `· completada ${match[1]}`;
  match = input.match(/^· ([\d.]+)% expected penalty$/i);
    if (match) return `· ${match[1]} % de penalización estimada`;
  match = input.match(/^(\d+) of (\d+) schedule changes? didn't save\.\n\n([\s\S]+)$/i);
    if (match) return `${match[1] === '1' ? 'No se guardó' : 'No se guardaron'} ${match[1]} de ${match[2]} ${match[2] === '1' ? 'cambio' : 'cambios'} del horario.\n\n${match[3]}`;
  match = input.match(/^This scan has (\d+) pages\.$/i);
    if (match) return `Este escaneo tiene ${match[1]} páginas.`;
  match = input.match(/^Page (\d+)$/i);
    if (match) return `Página ${match[1]}`;
  match = input.match(/^(\d+) categories · (bonus|category|ignore) extra credit$/i);
    if (match) return `${match[1]} categorías · crédito extra: ${match[2].toLowerCase() === 'bonus' ? 'puntos adicionales' : match[2].toLowerCase() === 'category' ? 'dentro de la categoría' : 'ignorado'}`;
  match = input.match(/^Remove grade (.+)$/);
    if (match) return `Quitar la calificación ${match[1]}`;
  match = input.match(/^Color (#[0-9a-fA-F]{3,8})$/);
    if (match) return `Color ${match[1]}`;
  match = input.match(/^Icon ([a-z0-9-]+)$/);
    if (match) return `Ícono ${match[1]}`;
  match = input.match(/^Free accounts support up to (\d+) courses\. Upgrade to Pro for unlimited courses\.$/i);
    if (match) return `Las cuentas gratuitas admiten hasta ${match[1]} cursos. Mejora a Pro para tener cursos ilimitados.`;
  match = input.match(/^(\d+) of (\d+) meetings? didn't save\. Open the course to retry\.\n\n([\s\S]+)$/i);
    if (match) return `${match[1] === '1' ? 'No se guardó' : 'No se guardaron'} ${match[1]} de ${match[2]} ${match[2] === '1' ? 'sesión' : 'sesiones'}. Abre el curso para reintentar.\n\n${match[3]}`;
  match = input.match(/^\((\d+) crunch weeks this term\)$/i);
    if (match) return `(${match[1]} semanas intensas este semestre)`;
  match = input.match(/^Your categories currently total ([\d.]+)%\.$/i);
    if (match) return `Tus categorías actualmente suman ${match[1]} %.`;
  match = input.match(/^Remove (?!this )(.+?)\?$/);
    if (match) return `¿Quitar ${match[1].toLowerCase() === 'category' ? 'esta categoría' : match[1]}?`;
  match = input.match(/^(\d+)-week completion streak$/i);
    if (match) return `Racha de ${match[1]} ${match[1] === '1' ? 'semana' : 'semanas'} completando tareas`;
  match = input.match(/^· Strongest on (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s$/i);
    if (match) return `· Más productivo los ${match[1].toLowerCase() === 'saturday' ? 'sábados' : match[1].toLowerCase() === 'sunday' ? 'domingos' : match[1].toLowerCase() === 'monday' ? 'lunes' : match[1].toLowerCase() === 'tuesday' ? 'martes' : match[1].toLowerCase() === 'wednesday' ? 'miércoles' : match[1].toLowerCase() === 'thursday' ? 'jueves' : 'viernes'}`;
  match = input.match(/^around (.+)$/);
    if (match) return `cerca de las ${match[1]}`;
  match = input.match(/^(\d+) missed sessions? moved forward$/i);
    if (match) return `${match[1] === '1' ? '1 sesión omitida se reprogramó' : `${match[1]} sesiones omitidas se reprogramaron`}`;
  match = input.match(/^(\d+) calendar conflicts? avoided$/i);
    if (match) return `${match[1] === '1' ? 'Se evitó 1 conflicto' : `Se evitaron ${match[1]} conflictos`} de calendario`;
  match = input.match(/^Focus on (.+)$/);
    if (match) return `Centrarse en ${match[1]}`;
  match = input.match(/^(\d+) focus blocks? done$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'bloque de enfoque completado' : 'bloques de enfoque completados'}`;
  match = input.match(/^Free accounts support up to (\d+) semesters?\. Upgrade to Pro for unlimited semesters\.$/i);
    if (match) return `Las cuentas gratuitas admiten hasta ${match[1]} ${match[1] === '1' ? 'semestre' : 'semestres'}. Mejora a Pro para tener semestres ilimitados.`;
  match = input.match(/^At least (\d+) characters$/i);
    if (match) return `Al menos ${match[1]} caracteres`;
  match = input.match(/^([\d.,]+) \/ ([\d.,]+) characters — trim it down a bit$/i);
    if (match) return `${match[1]} / ${match[2]} caracteres; acórtalo un poco`;
  match = input.match(/^(.+?)( and (\d+) more)? (has|have) a missing or invalid date\. Use YYYY-MM-DD\.$/);
    if (match) return `${match[1]}${match[2] ? ` y ${match[3]} más` : ''} ${match[4] === 'has' ? 'tiene' : 'tienen'} una fecha faltante o no válida. Usa el formato AAAA-MM-DD.`;
  match = input.match(/^and (\d+) more$/);
    if (match) return `y ${match[1]} más`;
  match = input.match(/^(One item has|(\d+) items have) no title\. Give each accepted item a title before saving\.$/);
    if (match) return `${match[2] ? `${match[2]} elementos no tienen` : 'Un elemento no tiene'} título. Asigna un título a cada elemento aceptado antes de guardar.`;
  match = input.match(/^(\d+) items have$/);
    if (match) return `${match[1]} elementos tienen`;
  match = input.match(/^Want a heads-up before each of the (\d+) deadlines? you're importing\?$/i);
    if (match) return `${match[1] === '1' ? '¿Quieres recibir un aviso antes de la entrega que estás importando?' : `¿Quieres recibir un aviso antes de cada una de las ${match[1]} entregas que estás importando?`}`;
  match = input.match(/^(\d+) tasks? added to your course\.( \((\d+) failed\))?$/i);
    if (match) return `${match[1] === '1' ? 'Se agregó 1 tarea' : `Se agregaron ${match[1]} tareas`} a tu curso.${match[2] ? ` (${match[3]} ${match[3] === '1' ? 'falló' : 'fallaron'})` : ''}`;
  match = input.match(/^Deselect (.+)$/);
    if (match) return `Deseleccionar ${match[1]}`;
  match = input.match(/^Select (.+)$/);
    if (match) return `Seleccionar ${match[1]}`;
  match = input.match(/^Done editing (.+)$/);
    if (match) return `Terminar de editar ${match[1]}`;
  match = input.match(/^Edit (.+)$/);
    if (match) return `Editar ${match[1]}`;
  match = input.match(/^Free accounts support up to (\d+) courses per semester \(this is separate from your scans\)\. Upgrade to Pro for unlimited courses, or re-scan a course you already have\.$/i);
    if (match) return `Las cuentas gratuitas admiten hasta ${match[1]} cursos por semestre (esto es independiente de tus escaneos). Mejora a Pro para tener cursos ilimitados o vuelve a escanear un curso que ya tienes.`;
  match = input.match(/^"(.+?)" was already added to (.+?)\. Re-importing the same syllabus would duplicate every task\.\n\nOpen the existing course, or create a separate duplicate\?$/);
    if (match) return `"${match[1]}" ya se agregó a ${match[2]}. Volver a importar el mismo programa duplicaría todas las tareas.\n\n¿Quieres abrir el curso existente o crear un duplicado aparte?`;
  match = input.match(/^Explain the assignment “(.+)” and help me make a plan to complete it\.$/);
    if (match) return `Explica la tarea “${match[1]}” y ayúdame a hacer un plan para completarla.`;
  match = input.match(/^“(.+)” will no longer ground the tutor\.$/);
    if (match) return `“${match[1]}” ya no se usará como fuente del tutor.`;
  match = input.match(/^Tutor · (.+)$/);
    if (match) return `Tutor · ${match[1]}`;
  match = input.match(/^Ask about (.+)$/);
    if (match) return `Pregunta sobre ${match[1]}`;
  match = input.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/);
    if (match) return `${translate(match[1], 'es')} ${match[2]}`;
  match = input.match(/^Mark "(.+?)" (complete|incomplete)$/i);
    if (match) return `Marcar "${match[1]}" como ${match[2].toLowerCase() === 'complete' ? 'completada' : 'pendiente'}`;
  match = input.match(/^Mark (.+) (complete|incomplete)$/i);
    if (match) return `Marcar ${match[1]} como ${match[2].toLowerCase() === 'complete' ? 'completada' : 'pendiente'}`;
  match = input.match(/^Delete "(.+)" and all its courses and tasks\? This cannot be undone\.$/i);
    if (match) return `¿Eliminar "${match[1]}" y todos sus cursos y tareas? Esta acción no se puede deshacer.`;
  match = input.match(/^due (\d{1,2}:\d{2})$/i);
    if (match) return `entrega ${match[1]}`;
  match = input.match(/^Manage (.+)$/);
    if (match) return `Administrar ${match[1]}`;
  match = input.match(/^Next exam: (.+?) · (.+?) — (.+?) \((today|\d+d)\) · start preparing$/i);
    if (match) return `Próximo examen: ${match[1]} · ${match[2]} — ${match[3]} (${match[4].toLowerCase() === 'today' ? 'hoy' : match[4]}) · empieza a prepararte`;
  match = input.match(/^(.+?) is busiest — (\d+) tasks due$/i);
    if (match) return `El ${translate(match[1], 'es')} es el día más cargado — ${match[2]} tareas por entregar`;
  match = input.match(/^Show (\d+) more overdue tasks$/i);
    if (match) return `Mostrar ${match[1]} tareas atrasadas más`;
  match = input.match(/^Today · (\d+) of (\d+) done$/i);
    if (match) return `Hoy · ${match[1]} de ${match[2]} completadas`;
  match = input.match(/^Yes, submitted late( · (\d+(?:\.\d+)?)% expected penalty)?$/i);
    if (match) return `Sí, la entregué tarde${match[1] ? ` · ${match[2]} % de penalización estimada` : ''}`;
  match = input.match(/^(\d+) high-risk signals? detected$/i);
    if (match) return match[1] === '1' ? '1 señal de riesgo alto detectada' : `${match[1]} señales de riesgo alto detectadas`;
  match = input.match(/^(\d+(?:\.\d+)?)% of category mix reporting$/i);
    if (match) return `${match[1]} % de las categorías con calificaciones`;
  match = input.match(/^avg (\d+(?:\.\d+)?)% on the rest$/i);
    if (match) return `promedio de ${match[1]} % en lo que falta`;
  match = input.match(/^(\d+) sync conflicts?$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'conflicto' : 'conflictos'} de sincronización`;
  match = input.match(/^(\d+) changes? failed to sync$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'cambio no se pudo sincronizar' : 'cambios no se pudieron sincronizar'}`;
  match = input.match(/^Offline · (\d+) saved$/i);
    if (match) return `Sin conexión · ${match[1]} ${match[1] === '1' ? 'guardado' : 'guardados'}`;
  match = input.match(/^Retrying (\d+) changes?…$/i);
    if (match) return `Reintentando ${match[1]} ${match[1] === '1' ? 'cambio' : 'cambios'}…`;
  match = input.match(/^(\d+) changes? waiting$/i);
    if (match) return `${match[1]} ${match[1] === '1' ? 'cambio en espera' : 'cambios en espera'}`;
  match = input.match(/^(.+)\. Open sync status\.$/i);
    if (match) return `${translate(match[1], 'es')}. Abrir estado de sincronización.`;
  match = input.match(/^Remove this (meeting|office hour block)\?$/i);
    if (match) return match[1].toLowerCase() === 'meeting' ? '¿Quitar esta sesión?' : '¿Quitar este bloque de horario de atención?';
  match = input.match(/^(\d+) days after the deadline$/i);
    if (match) return `${match[1]} días después de la fecha límite`;
  match = input.match(/^about (\d+) hours after the deadline$/i);
    if (match) return `aproximadamente ${match[1]} horas después de la fecha límite`;
  match = input.match(/^(\d+) days late$/i);
    if (match) return `${match[1]} días de atraso`;
  match = input.match(/^Week of (.+?): (\d+) tasks?(, crunch week)?(, current week)?$/i);
    if (match) return `Semana del ${match[1]}: ${match[2]} ${match[2] === '1' ? 'tarea' : 'tareas'}${match[3] ? ', semana intensa' : ''}${match[4] ? ', semana actual' : ''}`;
  match = input.match(/^(.+) · (late|on time)$/);
    if (match) return `${match[1]} · ${match[2] === 'late' ? 'tarde' : 'a tiempo'}`;
  match = input.match(/^(.+) \(OVERDUE\)$/);
    if (match) return `${match[1]} (ATRASADA)`;
  match = input.match(/^(\d+(?:\.\d+)?)% of grade( \(extra credit\))?$/i);
    if (match) return `${match[1]} % de la calificación${match[2] ? ' (crédito extra)' : ''}`;
  match = input.match(/^(.+) effort( · smart estimate)?$/);
    if (match) return `${match[1]} de esfuerzo${match[2] ? ' · estimación inteligente' : ''}`;
  match = input.match(/^“(.+)” is being completed (.+)\. Was it actually submitted on time\?$/);
    if (match) return `“${match[1]}” se está marcando como completada ${translate(match[2], 'es')}. ¿La entregaste a tiempo?`;
  match = input.match(/^Based on (\d+(?:\.\d+)?)% of coursework completed\. (.+)$/i);
    if (match) return `Basado en ${match[1]} % del trabajo del curso completado. ${translate(match[2], 'es')}`;
  match = input.match(/^(Lecture|Lab|Discussion|Meeting) · (.+)$/);
    if (match) return `${translate(match[1], 'es')} · ${match[2]}`;
  match = input.match(/^(Hey|Good morning|Good afternoon|Good evening), (.+)$/);
    if (match) return `${translate(match[1], 'es')}, ${match[2]}`;
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
