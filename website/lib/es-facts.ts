import type { FeatureSlug } from './semora-facts';

export const TAGLINE_ES = 'Escanea tu programa. No vuelvas a perder una fecha de entrega.';

export const SITE_DESCRIPTION_ES =
  'Semora convierte una foto o PDF de tu programa de estudios en un calendario del semestre con tareas, exámenes y porcentajes organizados.';

export const FREE_FEATURES_ES = [
  '5 escaneos de programas por mes calendario',
  'Hasta 4 cursos en un semestre',
  'Seguimiento completo de tareas y fechas de entrega',
  'Calificaciones con promedios ponderados',
  'Recordatorios el mismo día',
  'Espacios de curso: únete gratis al curso que comparta un compañero',
] as const;

export const PRO_FEATURES_ES = [
  'Cursos y semestres ilimitados, sin límite mensual de escaneos',
  'Importación de tareas desde Canvas, Blackboard y Moodle',
  'Crea Espacios de curso e invita a tus compañeros',
  'Plan Inteligente que se adapta a tus fechas de entrega',
  'Panel de carga académica para detectar semanas pesadas',
  'Tarjetas de estudio generadas desde tu programa y tus notas',
  'Temporizador de enfoque estilo Pomodoro',
  'Tutor con IA basado en tu programa, notas y fechas reales',
  'Escala de calificaciones, pronósticos y calculadoras hipotéticas',
  'Sincronización con el calendario del dispositivo y exportación .ics',
  'Recordatorios personalizados con 1 o 3 días de anticipación',
  'Alertas de riesgo académico',
  'Tendencias de progreso, exportación CSV y vista para imprimir',
  'Funciones para compartir y mantener rachas',
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
    name: 'Escáner de programas con IA',
    shortDescription: 'Convierte una foto o PDF en fechas, clases y calificaciones organizadas.',
    tier: 'free',
    description: 'Toma una foto, sube un PDF o pega el texto. Semora extrae las tareas, exámenes, horarios y porcentajes para que los revises antes de guardar.',
  },
  {
    slug: 'calificaciones',
    englishSlug: 'grade-tracking',
    name: 'Seguimiento de calificaciones',
    shortDescription: 'Conoce tu promedio ponderado y qué necesitas en lo que falta.',
    tier: 'free',
    description: 'Registra cada nota y su peso. Semora calcula el promedio del trabajo ya calificado y Pro añade pronósticos para explorar distintos resultados.',
  },
  {
    slug: 'plan-inteligente',
    englishSlug: 'smart-plan',
    name: 'Plan Inteligente',
    shortDescription: 'Un horario de estudio que cambia cuando cambia tu semestre.',
    tier: 'pro',
    description: 'Semora distribuye bloques de estudio según tus fechas, exámenes, carga académica y tiempo disponible, y explica por qué reajustó el plan.',
  },
  {
    slug: 'tarjetas-de-estudio',
    englishSlug: 'flashcards',
    name: 'Tarjetas de estudio',
    shortDescription: 'Genera tarjetas desde tus notas y repásalas con repetición espaciada.',
    tier: 'pro',
    description: 'Crea un mazo para todo el curso o para un examen específico usando el programa y las notas que seleccionaste.',
  },
  {
    slug: 'temporizador-de-enfoque',
    englishSlug: 'focus-timer',
    name: 'Temporizador de enfoque',
    shortDescription: 'Sesiones Pomodoro que caben entre tus clases.',
    tier: 'pro',
    description: 'Elige sesiones de 15, 25, 45 o 50 minutos y descansos cortos para aprovechar espacios reales de tu horario.',
  },
  {
    slug: 'tutor-con-ia',
    englishSlug: 'ai-tutor',
    name: 'Tutor con IA',
    shortDescription: 'Respuestas, práctica y recomendaciones basadas en tus cursos reales.',
    tier: 'pro',
    description: 'Pregunta sobre una tarea, practica con cuestionarios o encuentra temas débiles. El Tutor cita tu programa y tus notas cuando los usa.',
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
    shortDescription: 'Importa tareas de Canvas, Blackboard o Moodle y mantén sus cambios al día.',
    tier: 'pro',
    description: 'Conecta el acceso que ofrece tu institución, revisa el historial de sincronización y recupera errores sin duplicar tareas.',
  },
];

export function getSpanishFeature(slug: string): SpanishFeatureFact | undefined {
  return FEATURES_ES.find((feature) => feature.slug === slug);
}
