import type { FeatureSlug } from './semora-facts';

export const TAGLINE_ES = 'Organiza el programa de tus materias y ten cada entrega bajo control.';

export const SITE_DESCRIPTION_ES =
  'Semora convierte una foto o PDF del programa de tu materia en un calendario con tareas, exámenes y criterios de evaluación organizados.';

export const FREE_FEATURES_ES = [
  '1 acción con IA para toda la vida de la cuenta: un escaneo, una grabación o un documento en apuntes',
  'Sincronización con Canvas gratis y sin límite: conéctalo y todas tus clases se importan solas y se mantienen al día, sin Pro, sin token y sin permiso de informática',
  'Hasta 1 curso que añades a mano dentro de un único semestre (las clases que llegan de Canvas no cuentan); una cuenta gratis admite un semestre en total',
  'Seguimiento de tareas y fechas de entrega',
  'Calificaciones con promedios ponderados',
  'Recordatorios el mismo día',
  'Espacios de curso: únete gratis al espacio que comparta un compañero',
] as const;

export const PRO_FEATURES_ES = [
  'Cursos y semestres ilimitados, sin límite de escaneos',
  'Importación de tareas desde Canvas, Blackboard y Moodle',
  'Crea Espacios de curso e invita a tus compañeros',
  'Plan Inteligente que se adapta a tus fechas de entrega',
  'Panel de carga académica para detectar semanas pesadas',
  'Tarjetas de estudio generadas a partir del programa y tus apuntes',
  'Temporizador de concentración estilo Pomodoro',
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
  /** Ver FeatureFact.freeNote: gratis para PROBAR, no gratis sin límite. */
  freeNote?: string;
  description: string;
}

export const FEATURES_ES: SpanishFeatureFact[] = [
  {
    slug: 'escaner-de-programas',
    englishSlug: 'syllabus-scanner',
    name: 'Escaneo de programas con IA',
    shortDescription: 'Convierte una foto o un PDF en fechas de entrega, horarios y criterios de evaluación organizados.',
    tier: 'free',
    freeNote:
      'Gratis para probar. El plan gratuito incluye una acción de IA para toda la vida de la cuenta: gástala en un escaneo. Pro no tiene límite.',
    description: 'Toma una foto, sube un PDF o pega el texto. Semora identifica tareas, exámenes, horarios y criterios de evaluación para que los revises antes de guardar.',
  },
  {
    slug: 'sincronizacion-canvas',
    englishSlug: 'canvas-sync',
    name: 'Sincronización con Canvas',
    shortDescription: 'Importa tus tareas de Canvas, Blackboard o Moodle y mantenlas al día cuando cambien.',
    tier: 'free',
    description: 'Conecta Canvas gratis y todas tus clases se importan solas y se mantienen al día, sin token ni permiso de informática.',
  },
  {
    slug: 'calificaciones',
    englishSlug: 'grade-tracking',
    name: 'Seguimiento de calificaciones',
    shortDescription: 'Conoce tu promedio ponderado y qué calificación necesitas en lo que queda del semestre.',
    tier: 'free',
    description: 'Registra cada calificación y su peso. Semora calcula tu promedio con lo que ya está calificado y Pro añade pronósticos para explorar distintos escenarios.',
  },
  {
    slug: 'grabacion-de-clases',
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
    englishSlug: 'apple-watch',
    name: 'Apple Watch',
    shortDescription: 'Lo que vence hoy y lo que llevas atrasado, en la muñeca y en la esfera del reloj, y puedes marcar una tarea desde ahí.',
    tier: 'free',
    description: 'La app del reloj muestra los dos números que importan entre clase y clase: lo que vence hoy y lo que ya está atrasado, con la lista debajo. Las complicaciones ponen esas mismas cifras en la esfera, así que la respuesta llega sin abrir nada. Marcar una tarea desde la muñeca ejecuta el mismo código que marcarla en el teléfono, así que los avisos se cancelan y los eventos del calendario se limpian igual. Se instala junto con la app de iPhone, con la misma compra.',
  },
  {
    slug: 'plan-inteligente',
    englishSlug: 'smart-plan',
    name: 'Plan Inteligente',
    shortDescription: 'Un horario de estudio que se reajusta cuando cambian tus fechas.',
    tier: 'pro',
    description: 'Semora distribuye bloques de estudio según tus fechas, exámenes, carga académica y tiempo disponible, y explica por qué reajustó el plan.',
  },
  {
    slug: 'tutor-con-ia',
    englishSlug: 'ai-tutor',
    name: 'Tutor con IA',
    shortDescription: 'Respuestas, práctica y recomendaciones basadas en tus cursos reales.',
    tier: 'pro',
    description: 'Pregunta sobre una tarea, practica con cuestionarios o identifica los temas que necesitas reforzar. El Tutor incluye referencias al programa y a tus apuntes cuando los utiliza.',
  },
  {
    slug: 'tarjetas-de-estudio',
    englishSlug: 'flashcards',
    name: 'Tarjetas de estudio',
    shortDescription: 'Genera tarjetas a partir de tus apuntes y repásalas con repetición espaciada.',
    tier: 'pro',
    description: 'Crea un mazo para todo el curso o para un examen específico usando el programa y los apuntes que hayas seleccionado.',
  },
  {
    slug: 'espacios-de-curso',
    englishSlug: 'collaboration',
    name: 'Espacios de curso',
    shortDescription: 'Comparte fechas y trabajos de grupo con tus compañeros en tiempo real.',
    tier: 'pro',
    description: 'El anfitrión comparte un enlace del curso y todos ven las mismas fechas actualizadas. Crear un espacio requiere Pro; unirse es gratis.',
  },
  {
    slug: 'temporizador-de-enfoque',
    englishSlug: 'focus-timer',
    name: 'Temporizador de concentración',
    shortDescription: 'Sesiones Pomodoro que se adaptan a los espacios entre clases.',
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
    tier: 'pro' as const,
    title: 'Importa tareas desde Canvas',
    body: 'La sincronización con Canvas es gratis ahora mismo, en todas las cuentas y sin límite de clases: es una oferta por tiempo limitado, y quien lo conecte mientras dure la conserva gratis para siempre. Usa el calendario privado que Canvas ya te da, así que no hay ningún token que generar ni nada que aprobar en informática. Una vez conectado se revisa solo cada hora: si tu profesor mueve una fecha, en Semora aparece cambiada sin que nadie haga nada, y si borra una tarea, esta desaparece de tu lista en vez de seguir dándote la lata. Un límite honesto: el calendario trae fechas, no notas, así que las calificaciones las sigues poniendo tú. La importación de Blackboard y Moodle también es gratis, usa un token que emite tu universidad y depende de cada centro.',
    bullets: [
      'Uso sujeto a la política de tokens de tu institución',
      'Tareas y calificaciones se importan solas',
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
