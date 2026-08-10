import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from '@/app/(en)/page.module.css';
import { SignupButton } from '@/components/SignupButton';
import { HeroDemo } from '@/components/HeroDemo';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { APP_STORE_URL } from '@/lib/semora-facts';
import { OG_IMAGE_ES } from '@/lib/og';

export const metadata: Metadata = {
  title: 'Organiza tu semestre con IA',
  description:
    'Convierte una foto o PDF del programa de tu materia en tareas, exámenes, horarios y calificaciones organizadas. Empieza gratis con Semora.',
  alternates: {
    canonical: '/es',
    languages: { 'en-US': '/', es: '/es', 'x-default': '/' },
  },
  openGraph: {
    url: '/es',
    title: 'Semora — Tu semestre, organizado desde el primer día',
    description: 'Organiza todo el semestre a partir de una foto o PDF del programa de tu materia.',
    locale: 'es_US',
    ...OG_IMAGE_ES,
  },
};

const CHIPS = [
  '5 escaneos gratis al mes',
  'App completa en español',
  'Tus datos al día en iPhone, iPad y la web',
];

const STEPS = [
  {
    n: '01',
    title: 'Añádelo',
    body: 'Toma una foto, sube un PDF, arrastra el archivo en la web o pega el texto.',
  },
  {
    n: '02',
    title: 'Revísalo',
    body: 'Confirma las fechas, los horarios y las ponderaciones antes de guardar cualquier dato.',
  },
  {
    n: '03',
    title: 'Organízate',
    body: 'Controla fechas, calificaciones y tiempo de estudio desde una sola vista.',
  },
];

const CAPABILITIES = [
  {
    n: '01',
    eyebrow: 'Materias al día',
    title: 'Tus cursos cambian. Semora se actualiza contigo.',
    body: 'Importa el programa o, si tu institución lo permite, conecta Canvas, Blackboard o Moodle. El historial y la hora de la última actualización dejan claro qué cambió.',
    href: '/es/funciones/sincronizacion-canvas',
    linkLabel: 'Conocer la sincronización LMS',
  },
  {
    n: '02',
    eyebrow: 'Plan adaptable',
    title: 'Ocúpate primero de lo que más puede cambiar tu resultado.',
    body: 'El Plan inteligente tiene en cuenta cambios de fecha, sesiones pendientes, exámenes cercanos y riesgo académico, y te explica cada ajuste.',
    href: '/es/funciones/plan-inteligente',
    linkLabel: 'Conocer el Plan inteligente',
  },
  {
    n: '03',
    eyebrow: 'Tu materia, con contexto',
    title: 'Estudia con el contenido que realmente usa tu clase.',
    body: 'El Tutor cita las fuentes de tu curso, y los ejercicios, cuestionarios y tarjetas convierten apuntes y tareas en repaso activo.',
    href: '/es/funciones/tutor-con-ia',
    linkLabel: 'Conocer el Tutor con IA',
  },
  {
    n: '04',
    eyebrow: 'Una cuenta, en todas partes',
    title: 'Continúa en iPhone, iPad o la web.',
    body: 'Los cambios sin conexión quedan guardados y se sincronizan al volver. Toda la app está disponible en español y en inglés.',
    href: '/es/funciones',
    linkLabel: 'Ver todas las funciones',
  },
] as const;

type SpanishHomeDetail = {
  key: string;
  eyebrow: string;
  heading: string;
  lead: string;
  bullets: readonly string[];
  image: string;
  alt: string;
  flip?: boolean;
};

const DETAILS: SpanishHomeDetail[] = [
  {
    key: 'scanner',
    eyebrow: 'Análisis del programa',
    heading: 'Empieza el semestre con un plan claro.',
    lead: 'La IA de Semora convierte el programa de la materia en tareas, exámenes y horarios que puedes revisar en pocos minutos.',
    bullets: [
      'Usa una foto, un PDF, un archivo o texto copiado.',
      'Comprueba cada fecha, horario y categoría antes de guardar.',
    ],
    image: '/screenshots/es/scan-syllabus.png',
    alt: 'Pantalla de Semora con opciones para añadir el programa de una materia mediante foto, PDF o archivo',
  },
  {
    key: 'grades',
    eyebrow: 'Calificaciones y pronósticos',
    heading: 'Averigua qué calificación necesitas antes del examen final.',
    lead: 'Consulta tu promedio actual y descubre cuánto puede influir la próxima entrega.',
    bullets: [
      'Calcula promedios ponderados por curso y categoría.',
      'Usa pronósticos y alertas para concentrarte en lo que más importa.',
    ],
    image: '/screenshots/es/track-grades.png',
    alt: 'Pantalla de un curso en Semora con promedio actual y pronóstico de calificaciones',
    flip: true,
  },
  {
    key: 'plan',
    eyebrow: 'Pro · Planificación',
    heading: 'Un horario de estudio que cambia contigo.',
    lead: 'El plan se adapta cuando cambia una fecha o dejas una sesión sin completar.',
    bullets: [
      'Reserva bloques de estudio que se adapten a tus clases, exámenes y entregas.',
      'Semora reprograma las sesiones pendientes y te explica por qué cambió el plan.',
    ],
    image: '/screenshots/es/plan-semester.png',
    alt: 'Calendario de Semora con fechas de varios cursos durante todo el mes',
  },
];

const FAQ = [
  {
    question: '¿Semora es realmente gratis?',
    answer:
      'Sí. El plan gratuito incluye cinco escaneos al mes, hasta cuatro cursos por semestre, seguimiento de entregas, promedios ponderados y recordatorios. No necesitas tarjeta de crédito.',
  },
  {
    question: '¿Qué añade Pro?',
    answer:
      'Pro añade cursos y escaneos ilimitados, conexiones LMS, planificación adaptable, herramientas de estudio basadas en tus materias y análisis avanzados de calificaciones. Las opciones vigentes están en la página de Precios y se aplican a la misma cuenta en iPhone, iPad y la web.',
  },
  {
    question: '¿Qué tipos de archivo puedo añadir?',
    answer:
      'Puedes tomar una foto, subir un PDF, arrastrar un archivo en la web o pegar el texto. Siempre puedes revisar el resultado antes de guardarlo.',
  },
  {
    question: '¿Necesito Canvas?',
    answer:
      'No. Puedes usar Semora solo con el programa de tus materias. Las conexiones con Canvas, Blackboard y Moodle son funciones opcionales de Pro.',
  },
  {
    question: '¿La app está en español?',
    answer:
      'Sí, la app completa, no solo este sitio: pantallas, recordatorios, el Tutor y la configuración. Si tu dispositivo está en español, Semora se abre en español. También puedes elegir el idioma en la primera pantalla de bienvenida o cambiarlo cuando quieras en Mi cuenta > Configuración > Idioma, y el cambio se aplica al instante, sin reiniciar.',
  },
  {
    question: '¿Funciona en iPhone y iPad?',
    answer:
      'Sí. Semora es una app universal: la misma compra y la misma cuenta funcionan en iPhone y en iPad, con diseño adaptado a cada pantalla. Tus cursos también están disponibles en la web, y el idioma que elijas se mantiene en las tres plataformas.',
  },
];

export default function SpanishHome() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema({ includeOffers: false })} />
      <JsonLd data={faqPageSchema(FAQ)} />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Organización universitaria con IA</span>
            <h1 className={styles.h1}>
              Sube el programa.{' '}
              <span className={styles.gradient}>Ten todo el semestre bajo control.</span>
            </h1>
            <p className={styles.sub}>
              Convierte una foto o PDF del programa en un plan revisable para todo el semestre:
              fechas, horarios, calificaciones y herramientas de estudio, todo conectado.
            </p>
            <div className={styles.heroActions}>
              <SignupButton className={styles.primaryBtn}>Empezar gratis</SignupButton>
              <a href={APP_STORE_URL} className={styles.secondaryBtn}>Descargar la app</a>
            </div>
            <ul className={styles.chips}>
              {CHIPS.map((chip) => <li key={chip} className={styles.chip}>{chip}</li>)}
            </ul>
          </div>
          <div className={styles.heroVisual}>
            <HeroDemo locale="es" />
          </div>
        </div>
      </section>

      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>Del PDF al plan</span>
            <h2>Cómo funciona</h2>
            <p>Del programa de una materia a un semestre organizado en tres pasos.</p>
          </div>
        </Reveal>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.n} className={styles.stepCell}>
              <Reveal delay={index * 90}>
                <div className={styles.step}>
                  <span className={styles.stepNum}>{step.n}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {DETAILS.map((detail, index) => (
        <section key={detail.key} className={index % 2 === 1 ? styles.band : undefined}>
          <div className={styles.inner}>
            <Reveal>
              <div className={[styles.split, detail.flip ? styles.splitFlip : ''].filter(Boolean).join(' ')}>
                <div className={styles.splitCopy}>
                  <span className={styles.label}>{detail.eyebrow}</span>
                  <h2 className={styles.splitHeading}>{detail.heading}</h2>
                  <p className={styles.lead}>{detail.lead}</p>
                  <ul className={styles.checks}>
                    {detail.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                </div>
                <div className={styles.splitMedia}>
                  <Image src={detail.image} alt={detail.alt} width={296} height={640} className={styles.shot} />
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>Un semestre conectado</span>
            <h2>Tu planificación, tus calificaciones y tu estudio avanzan juntos.</h2>
            <p>Semora conecta el trabajo de tus materias para que cualquier cambio te ayude a decidir qué hacer después.</p>
          </div>
        </Reveal>
        <ol className={styles.capabilityGrid}>
          {CAPABILITIES.map((capability, index) => (
            <li key={capability.n} className={styles.capabilityCell}>
              <Reveal delay={index * 70}>
                <Link href={capability.href} className={styles.capabilityCard}>
                  <div className={styles.capabilityTop}>
                    <span className={styles.capabilityNum}>{capability.n}</span>
                    <span className={styles.capabilityArrow} aria-hidden="true">↗</span>
                  </div>
                  <span className={styles.capabilityEyebrow}>{capability.eyebrow}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.body}</p>
                  <span className={styles.capabilityLink}>{capability.linkLabel} →</span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.band}>
        <div className={styles.inner}>
          <div className={styles.faqLayout}>
            <div className={styles.faqAside}>
              <span className={styles.label}>Preguntas</span>
              <h2>Lo esencial.</h2>
              <p>Lo que debes saber antes de comenzar.</p>
            </div>
            <div className={styles.faqBody}><Faq items={FAQ} /></div>
          </div>
        </div>
      </section>

      <div className={styles.inner}>
        <Cta
          locale="es"
          heading="Ten todo tu semestre bajo control."
          subheading="Empieza gratis desde tu iPhone, iPad o computadora."
        />
      </div>
    </>
  );
}
