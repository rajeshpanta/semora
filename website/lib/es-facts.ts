import type { FeatureSlug } from './semora-facts';

export const TAGLINE_ES = 'Organiza el programa de tus materias y ten cada entrega bajo control.';

export const SITE_DESCRIPTION_ES =
  'Semora convierte una foto o PDF del programa de tu materia en un calendario con tareas, exámenes y criterios de evaluación organizados.';

// Espejo de FREE_FEATURES en semora-facts.ts. El límite de un semestre ya no
// se repite en estas viñetas: se dice una sola vez, y bien visible, en la
// página de precios. No lo vuelvas a esparcir por aquí.
export const FREE_FEATURES_ES = [
  // Va primero porque es lo más grande que hace el plan Gratis, y lo que un
  // estudiante puede hacer esta misma noche. Los tres proveedores son gratis
  // en todos los planes. El "sin límite" es exacto: las clases del LMS nunca
  // se cuentan para el tope de cursos, ni en Gratis ni en Pro.
  'Todas tus clases, gratis: Canvas, Blackboard y Moodle se sincronizan en el plan Gratis, sin límite de cuántas, y se actualizan si el profesor mueve una fecha',
  // Lo de "un solo paso" vale SOLO para Canvas. Blackboard y Moodle también
  // son gratis, pero usan un token que emite la universidad.
  'Canvas se conecta en un paso: pega el enlace que Canvas ya te da. Sin token y sin permiso de informática',
  'Tu primera acción con IA, gratis: un escaneo, una grabación o un documento en apuntes; tú eliges',
  // Igual que en semora-facts.ts: el límite y la exención van en la misma
  // frase. Lo verifica scripts/check-product-facts.mjs.
  'Además, 1 curso que añades a mano dentro de un semestre: las clases de Canvas, Blackboard y Moodle nunca cuentan para ese límite',
  'Todas tus entregas, tareas y exámenes de todos los cursos en una sola lista',
  'Calificaciones con promedios ponderados, para saber cómo vas de verdad',
  'Recordatorios el mismo día, activados desde el principio',
  'Espacios de curso: únete gratis al espacio que comparta un compañero',
] as const;

// Aquí NO va ninguna línea de LMS. Canvas, Blackboard y Moodle son gratis en
// todos los planes. Esta lista llegó a vender Canvas como función de Pro
// mientras la tarjeta Gratis, en la misma pantalla, lo regalaba. No la
// vuelvas a añadir. Y "sin límite de escaneos" tampoco: en Pro no hay cupo,
// pero sí un tope de uso justo de 20 escaneos por cada 24 horas.
export const PRO_FEATURES_ES = [
  'Cursos y semestres ilimitados: el próximo se arma igual que este',
  'Sin cupo de IA: escanea, graba y genera todo el semestre, con un uso justo de 20 escaneos al día',
  'Graba todas tus clases, no solo una: transcripción, apuntes, cuestionario y tarjetas de cada una',
  'Crea Espacios de curso e invita a tus compañeros',
  'Plan inteligente que se adapta a tus fechas de entrega',
  'Panel de carga académica para detectar semanas pesadas',
  'Tarjetas de estudio generadas a partir del programa y tus apuntes',
  'Temporizador de enfoque estilo Pomodoro',
  'Tutor con IA basado en el programa, tus apuntes y fechas reales',
  'Escala de calificaciones, pronósticos y simulador de escenarios «¿qué pasa si…?»',
  'Sincronización con el calendario del dispositivo y exportación .ics',
  'Recordatorios personalizados con 1 o 3 días de anticipación',
  'Alertas de riesgo académico',
  'Tendencias de progreso, exportación CSV y vista para imprimir',
  'Opciones para compartir y mantener tu racha de estudio',
] as const;

export interface SpanishFeatureFact {
  slug: string;
  englishSlug: FeatureSlug;
  name: string;
  shortDescription: string;
  tier: 'free' | 'pro';
  /**
   * Título para buscadores, cuando el nombre de la función se queda corto.
   *
   * name se ve en pantalla —la cuadrícula, el pie de página, el menú— y ahí
   * lo correcto es que sea corto. Como <title> esos mismos nombres medían
   * 11-29 caracteres frente a los 30-54 de sus equivalentes en inglés: las
   * diez páginas de funciones en español tenían un título más pobre que su
   * gemela inglesa. Esto separa las dos cosas.
   */
  metaTitle?: string;
  /**
   * Descripción para buscadores, cuando la de la tarjeta se queda corta.
   *
   * shortDescription se ve en pantalla: en la cuadrícula de /es/funciones y en
   * el pie de página. Ahí lo bueno es que sea breve. Como meta description,
   * esas mismas frases medían 61-97 caracteres, la mitad de lo útil, así que
   * Google descartaba la nuestra y escribía la suya. Esto separa las dos: la
   * tarjeta sigue siendo corta y el buscador recibe algo completo.
   */
  metaDescription?: string;
  /** Ver FeatureFact.freeNote: gratis para PROBAR, no gratis sin límite. */
  freeNote?: string;
  description: string;
}

export const FEATURES_ES: SpanishFeatureFact[] = [
  {
    slug: 'escaner-de-programas',
    metaTitle: 'Escáner de programas con IA: foto, PDF o texto pegado',
    englishSlug: 'syllabus-scanner',
    name: 'Escaneo de programas con IA',
    shortDescription: 'Convierte una foto o un PDF en fechas de entrega, horarios y criterios de evaluación organizados.',
    metaDescription:
      'Convierte una foto o un PDF del programa en el semestre completo: cada entrega, examen y criterio de evaluación, listos para que los revises antes de guardar.',
    tier: 'free',
    freeNote:
      'Gratis para probar. El plan gratuito incluye una acción de IA para toda la vida de la cuenta: gástala en un escaneo. Pro no tiene límite.',
    description: 'Toma una foto, sube un PDF o pega el texto. Semora identifica tareas, exámenes, horarios y criterios de evaluación para que los revises antes de guardar.',
  },
  {
    slug: 'sincronizacion-canvas',
    metaTitle: 'Sincronizar Canvas: cómo conectarlo y qué esperar',
    englishSlug: 'canvas-sync',
    name: 'Sincronización con Canvas',
    shortDescription: 'Importa tus tareas de Canvas, Blackboard o Moodle y mantenlas al día cuando cambien.',
    metaDescription:
      'Conecta Canvas, Blackboard o Moodle gratis en cualquier plan, sin límite de clases: pega el enlace del calendario y tus tareas llegan y se mantienen al día.',
    tier: 'free',
    description: 'Conecta Canvas gratis, trae todas las clases que curses y se mantienen al día solas, sin token ni permiso de informática.',
  },
  {
    slug: 'calificaciones',
    metaTitle: 'Calificaciones ponderadas y tu promedio, gratis',
    englishSlug: 'grade-tracking',
    name: 'Seguimiento de calificaciones',
    shortDescription: 'Conoce tu promedio ponderado y qué calificación necesitas en lo que queda del semestre.',
    metaDescription:
      'Tu promedio ponderado al día con lo ya calificado, gratis. Pro añade los pronósticos que dicen qué nota necesitas en lo que queda para llegar a tu objetivo.',
    tier: 'free',
    description: 'Registra cada calificación y su peso. Semora calcula tu promedio con lo que ya está calificado y Pro añade pronósticos para explorar distintos escenarios.',
  },
  {
    slug: 'grabacion-de-clases',
    metaTitle: 'Grabar clases: transcripción, apuntes y tarjetas',
    englishSlug: 'lecture-recording',
    name: 'Grabación de clases',
    shortDescription: 'Graba una clase y recibe la transcripción, apuntes escritos, un cuestionario de práctica y un mazo de tarjetas.',
    tier: 'free',
    freeNote:
      'Gratis para probar. El plan gratuito incluye una acción de IA para toda la vida de la cuenta: gástala en una clase. Pro no tiene límite.',
    description: 'Graba la clase desde el teléfono y Semora la transcribe, y a partir de esa misma transcripción escribe apuntes ordenados, un cuestionario de opción múltiple con explicaciones y un mazo de tarjetas. La captura se guarda en tramos de cinco minutos, así que un teléfono que se apaga te cuesta los últimos minutos y no la clase entera. El audio se borra en cuanto la transcripción queda guardada.',
  },
  {
    slug: 'apple-watch',
    metaTitle: 'Apple Watch: lo que vence hoy, en tu muñeca',
    englishSlug: 'apple-watch',
    name: 'Apple Watch',
    shortDescription: 'Lo que vence hoy y lo que llevas atrasado, en la muñeca y en la esfera del reloj, y puedes marcar una tarea desde ahí.',
    tier: 'free',
    description: 'La app del reloj muestra los dos números que importan entre clase y clase: lo que vence hoy y lo que ya está atrasado, con la lista debajo. Las complicaciones ponen esas mismas cifras en la esfera, así que la respuesta llega sin abrir nada. Marcar una tarea desde la muñeca ejecuta el mismo código que marcarla en el teléfono, así que los avisos se cancelan y los eventos del calendario se limpian igual. Se instala junto con la app de iPhone, con la misma compra.',
  },
  {
    slug: 'plan-inteligente',
    metaTitle: 'Plan inteligente: tu horario de estudio, hecho solo',
    englishSlug: 'smart-plan',
    name: 'Plan inteligente',
    shortDescription: 'Un horario de estudio que se reajusta cuando cambian tus fechas.',
    metaDescription:
      'Un horario de estudio armado con tus fechas reales que se reajusta solo cuando el profesor mueve un examen o se te acumulan varias entregas la misma semana.',
    tier: 'pro',
    description: 'Semora distribuye bloques de estudio según tus fechas, exámenes, carga académica y tiempo disponible, y explica por qué reajustó el plan.',
  },
  {
    slug: 'tutor-con-ia',
    metaTitle: 'Tutor con IA anclado a tu programa y tus apuntes',
    englishSlug: 'ai-tutor',
    name: 'Tutor con IA',
    shortDescription: 'Respuestas, práctica y recomendaciones basadas en tus cursos reales.',
    metaDescription:
      'Un tutor con IA que responde desde el programa de tu materia, tus apuntes y tus fechas reales, cita lo que usó y nunca se inventa una fecha de entrega.',
    tier: 'pro',
    description: 'Pregunta sobre una tarea, practica con cuestionarios o identifica los temas que necesitas reforzar. El Tutor incluye referencias al programa y a tus apuntes cuando los utiliza.',
  },
  {
    slug: 'tarjetas-de-estudio',
    metaTitle: 'Tarjetas con IA y repetición espaciada',
    englishSlug: 'flashcards',
    name: 'Tarjetas de estudio',
    shortDescription: 'Genera tarjetas a partir de tus apuntes y repásalas con repetición espaciada.',
    metaDescription:
      'Genera un mazo desde el programa y tus apuntes, enfócalo en un examen concreto y repásalo con repetición espaciada. Incluido en Semora Pro.',
    tier: 'pro',
    description: 'Crea un mazo para todo el curso o para un examen específico usando el programa y los apuntes que hayas seleccionado.',
  },
  {
    slug: 'espacios-de-curso',
    metaTitle: 'Espacios de curso: comparte una materia con tu clase',
    englishSlug: 'collaboration',
    name: 'Espacios de curso',
    shortDescription: 'Comparte fechas y trabajos de grupo con tus compañeros en tiempo real.',
    metaDescription:
      'Comparte un curso por enlace y las fechas y trabajos de grupo se sincronizan en tiempo real. Unirte es gratis; crear tu propio espacio es parte de Pro.',
    tier: 'pro',
    description: 'El anfitrión comparte un enlace del curso y todos ven las mismas fechas actualizadas. Crear un espacio requiere Pro; unirse es gratis.',
  },
  {
    slug: 'temporizador-de-enfoque',
    metaTitle: 'Temporizador de enfoque: bloques Pomodoro reales',
    englishSlug: 'focus-timer',
    name: 'Temporizador de enfoque',
    shortDescription: 'Sesiones Pomodoro que se adaptan a los espacios entre clases.',
    metaDescription:
      'Sesiones Pomodoro de 15, 25, 45 o 50 minutos con descansos ajustables, pensadas para los huecos reales entre clases. Incluido en Semora Pro.',
    tier: 'pro',
    description: 'Elige sesiones de 15, 25, 45 o 50 minutos y descansos cortos para aprovechar los huecos que de verdad tienes en tu horario.',
  },
];

export function getSpanishFeature(slug: string): SpanishFeatureFact | undefined {
  return FEATURES_ES.find((feature) => feature.slug === slug);
}

/**
 * The screenshot showcase on /es/funciones.
 *
 * Written in Spanish rather than translated from the English page: the bullets
 * are shorter than their English counterparts because Spanish runs longer and
 * these sit in a narrow column, and the phrasing uses the site's own
 * vocabulary — "escaneo" (the app's word, not "análisis"), "programa de la
 * materia" for the syllabus, "curso" for the record inside Semora.
 */
export const SHOWCASE_ES = [
  {
    image: '/screenshots/es/scan-syllabus.png',
    alt: 'Pantalla de escaneo de Semora con las opciones de tomar una foto, subir un PDF o elegir un archivo',
    tier: 'free' as const,
    title: 'Escanea el programa y ten el semestre listo',
    body: 'Toma una foto, sube un PDF, arrastra el archivo en la web o pega el texto que copiaste del programa o de tu plataforma académica. OpenAI GPT-5.6 Luna lo lee y extrae el nombre del curso, el profesor, los horarios, los criterios de evaluación y cada tarea, examen, cuestionario, proyecto y lectura con su fecha de entrega.',
    bullets: [
      'Foto de hasta 5 páginas por escaneo',
      'PDF, arrastrar y soltar o texto pegado',
      '1 acción con IA gratis por cuenta',
    ],
    href: '/es/funciones/escaner-de-programas',
  },
  {
    image: '/screenshots/es/never-miss-deadline.png',
    alt: 'Pantalla Hoy de Semora con la próxima entrega, las tareas atrasadas y el resumen de la semana',
    tier: 'free' as const,
    title: 'No se te pasa ninguna entrega',
    body: 'Todas las fechas de todos tus cursos llegan a un mismo lugar, y lo que vence primero aparece arriba. Los recordatorios del mismo día vienen activados, y un resumen semanal te muestra tareas, exámenes y cursos de un vistazo, incluido lo que quedó atrasado.',
    bullets: [
      'Una sola lista para todos tus cursos',
      'Recordatorios el mismo día, incluidos gratis',
      'Lo atrasado se marca solo',
    ],
    href: '/es/escaner-de-programa-de-estudios',
  },
  {
    image: '/screenshots/es/track-grades.png',
    alt: 'Pantalla de un curso en Semora con la calificación actual calculada a partir del trabajo ya evaluado',
    tier: 'free' as const,
    title: 'Sabes cómo vas en cada curso',
    body: 'Anota la calificación de cada tarea evaluada y Semora calcula tu promedio ponderado al momento, contando solo lo que ya está calificado. Así siempre sabes en qué punto estás de verdad, no una estimación.',
    bullets: [
      'Promedio ponderado, no un promedio simple',
      'Se actualiza en cuanto anotas una nota',
      'Pro añade tendencias, exportación CSV y vista para imprimir',
    ],
    href: '/es/funciones/calificaciones',
  },
  {
    image: '/screenshots/es/canvas-sync.png',
    alt: 'Pantalla de plataformas educativas de Semora con los cursos conectados y el estado de sincronización',
    // Era 'pro'. La tarjeta mostraba una insignia "Pro" justo encima de un
    // párrafo que empieza diciendo que Canvas es gratis, en la única página
    // de funciones en español. La versión inglesa siempre dijo 'free'.
    tier: 'free' as const,
    title: 'Importa tus clases desde Canvas, Blackboard o Moodle',
    body: 'La sincronización con Canvas es gratis ahora mismo, en todas las cuentas y sin límite de clases: es una oferta por tiempo limitado, y quien lo conecte mientras dure no pierde nunca la importación gratuita de Canvas. Usa el calendario privado que Canvas ya te da, así que no hay ningún token que generar ni nada que aprobar en informática. Una vez conectado se revisa solo cada pocas horas —cada hora si estás en mitad del semestre y usando la app—: si tu profesor mueve una fecha, en Semora aparece cambiada sin que nadie haga nada, y si borra una tarea, esta desaparece de tu lista en vez de seguir dándote la lata. Un límite honesto: el calendario trae fechas, no notas, así que las calificaciones las sigues poniendo tú. La importación de Blackboard y Moodle también es gratis, usa un token que emite tu universidad y depende de cada centro.',
    bullets: [
      'Sin token de acceso y sin permiso de tu universidad',
      'Las tareas con fecha se importan solas y se mantienen al día',
      'Si no está disponible, escanea el programa o pega la lista de tareas',
    ],
    href: '/es/funciones/sincronizacion-canvas',
  },
  {
    image: '/screenshots/es/plan-semester.png',
    alt: 'Calendario mensual de Semora con las entregas de varios cursos marcadas a lo largo del mes',
    tier: 'free' as const,
    title: 'Todo el semestre en una sola vista',
    body: 'Cada clase, entrega y examen del semestre en un mismo calendario: vista de mes o de lista, con un color por curso, para que nada te tome por sorpresa.',
    bullets: [
      'Vista de mes y vista de lista',
      'Un color por curso',
      'Pro añade sincronización con el calendario del dispositivo y exportación .ics',
    ],
    href: '/es/planificador-de-estudio-con-ia',
  },
];
