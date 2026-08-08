import type { FeatureSlug } from './semora-facts';

export const TAGLINE_ES = 'Organiza el programa de tus materias y ten cada entrega bajo control.';

export const SITE_DESCRIPTION_ES =
  'Semora convierte una foto o PDF del programa de tu materia en un calendario con tareas, exámenes y criterios de evaluación organizados.';

export const FREE_FEATURES_ES = [
  '5 análisis de programas al mes',
  'Hasta 4 cursos por semestre',
  'Seguimiento de tareas y fechas de entrega',
  'Calificaciones con promedios ponderados',
  'Recordatorios el mismo día',
  'Espacios de curso: únete gratis al espacio que comparta un compañero',
] as const;

export const PRO_FEATURES_ES = [
  'Cursos y semestres ilimitados, sin límite mensual de análisis',
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
  description: string;
}

export const FEATURES_ES: SpanishFeatureFact[] = [
  {
    slug: 'escaner-de-programas',
    englishSlug: 'syllabus-scanner',
    name: 'Análisis de programas con IA',
    shortDescription: 'Convierte una foto o un PDF en fechas de entrega, horarios y criterios de evaluación organizados.',
    tier: 'free',
    description: 'Toma una foto, sube un PDF o pega el texto. Semora identifica tareas, exámenes, horarios y criterios de evaluación para que los revises antes de guardar.',
  },
  {
    slug: 'calificaciones',
    englishSlug: 'grade-tracking',
    name: 'Seguimiento de calificaciones',
    shortDescription: 'Conoce tu promedio ponderado y qué calificación necesitas en lo que queda del semestre.',
    tier: 'free',
    description: 'Registra cada calificación y su peso. Registra cada calificación y su peso. Semora calcula tu promedio con lo que ya está calificado y Pro añade pronósticos para explorar distintos escenarios.',
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
    slug: 'tarjetas-de-estudio',
    englishSlug: 'flashcards',
    name: 'Tarjetas de estudio',
    shortDescription: 'Genera tarjetas a partir de tus apuntes y repásalas con repetición espaciada.',
    tier: 'pro',
    description: 'Crea un mazo para todo el curso o para un examen específico usando el programa y los apuntes que hayas seleccionado.',
  },
  {
    slug: 'temporizador-de-enfoque',
    englishSlug: 'focus-timer',
    name: 'Temporizador de concentración',
    shortDescription: 'Sesiones Pomodoro que se adaptan a los espacios entre clases.',
    tier: 'pro',
    description: 'Elige sesiones de 15, 25, 45 o 50 minutos y descansos cortos para aprovechar los huecos que de verdad tienes en tu horario.',
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
    slug: 'espacios-de-curso',
    englishSlug: 'collaboration',
    name: 'Espacios de curso',
    shortDescription: 'Comparte fechas y trabajos de grupo con tus compañeros en tiempo real.',
    tier: 'pro',
    description: 'El anfitrión comparte un enlace del curso y todos ven las mismas fechas actualizadas. Crear un espacio requiere Pro; unirse es gratis.',
  },
  {
    slug: 'sincronizacion-canvas',
    englishSlug: 'canvas-sync',
    name: 'Sincronización con Canvas',
    shortDescription: 'Importa tus tareas de Canvas, Blackboard o Moodle y mantenlas al día cuando cambien.',
    tier: 'pro',
    description: 'Conecta Semora mediante el método que permita tu institución, consulta el historial de sincronización y resuelve errores sin duplicar tareas.',
  },
];

export function getSpanishFeature(slug: string): SpanishFeatureFact | undefined {
  return FEATURES_ES.find((feature) => feature.slug === slug);
}
