import type { Metadata } from 'next';
import Image from 'next/image';
import styles from '@/app/(en)/page.module.css';
import { SignupButton } from '@/components/SignupButton';
import { HeroDemo } from '@/components/HeroDemo';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { APP_STORE_URL } from '@/lib/semora-facts';
import { OG_IMAGE_ES } from '@/lib/og';

export const metadata: Metadata = {
  title: 'Escáner de programas universitarios con IA',
  description:
    'Convierte una foto o PDF de tu programa de estudios en tareas, exámenes, horarios y calificaciones organizadas. Empieza gratis con Semora.',
  alternates: {
    canonical: '/es',
    languages: { 'en-US': '/', es: '/es', 'x-default': '/' },
  },
  openGraph: {
    url: '/es',
    title: 'Semora — Escanea tu programa. No pierdas ninguna fecha.',
    description: 'Organiza todo tu semestre desde una foto o PDF del programa de estudios.',
    locale: 'es_US',
    ...OG_IMAGE_ES,
  },
};

const CHIPS = ['5 escaneos gratis cada mes', 'Sincronizado en iPhone, iPad y web'];

const STEPS = [
  {
    n: '01',
    title: 'Escanéalo',
    body: 'Toma una foto, sube un PDF, arrástralo en la web o pega el texto.',
  },
  {
    n: '02',
    title: 'Revísalo',
    body: 'Confirma las fechas, los horarios y los porcentajes antes de guardar cualquier dato.',
  },
  {
    n: '03',
    title: 'Organízate',
    body: 'Controla fechas, calificaciones y tiempo de estudio desde una sola vista.',
  },
];

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
    eyebrow: 'Escáner de programas',
    heading: 'Convierte la primera semana en un plan claro.',
    lead: 'OpenAI GPT-5.6 Luna transforma un programa en un curso que puedes revisar en minutos.',
    bullets: [
      'Usa una foto, PDF, archivo arrastrado o texto pegado.',
      'Revisa cada fecha, horario y categoría antes de confirmar.',
    ],
    image: '/screenshots/scan-syllabus.png',
    alt: 'Pantalla de Semora con opciones para importar un programa mediante foto, PDF o archivo',
  },
  {
    key: 'grades',
    eyebrow: 'Calificaciones y pronósticos',
    heading: 'Conoce la nota que necesitas antes del examen final.',
    lead: 'Mira dónde estás y cuánto puede cambiar tu próxima entrega.',
    bullets: [
      'Calcula promedios ponderados por curso y categoría.',
      'Usa pronósticos y alertas para concentrarte donde más importa.',
    ],
    image: '/screenshots/track-grades.png',
    alt: 'Pantalla de un curso en Semora con promedio actual y pronóstico de calificaciones',
    flip: true,
  },
  {
    key: 'plan',
    eyebrow: 'Pro · Planificación',
    heading: 'Un horario de estudio que cambia contigo.',
    lead: 'El plan se adapta cuando mueves una fecha o no completas una sesión.',
    bullets: [
      'Crea bloques alrededor de tus clases, exámenes y entregas.',
      'Reorganiza sesiones perdidas y explica por qué cambió el plan.',
    ],
    image: '/screenshots/plan-semester.png',
    alt: 'Calendario de Semora con fechas de varios cursos durante todo el mes',
  },
];

const FAQ = [
  {
    question: '¿Semora es realmente gratis?',
    answer:
      'Sí. El plan gratis incluye cinco escaneos al mes, hasta cuatro cursos en un semestre, seguimiento de fechas, promedios ponderados y recordatorios. No necesitas tarjeta de crédito.',
  },
  {
    question: '¿Cuánto cuesta Pro?',
    answer:
      'Pro cuesta $3.99 al mes o $19.99 al año. Se compra dentro de la app de iOS y se aplica a la misma cuenta en iPhone, iPad y web.',
  },
  {
    question: '¿Qué puedo añadir al escáner?',
    answer:
      'Puedes usar una foto, un PDF, arrastrar un archivo en la web o pegar texto. Siempre revisas el resultado antes de guardarlo.',
  },
  {
    question: '¿Necesito Canvas?',
    answer:
      'No. Semora funciona solamente con tu programa de estudios. Las conexiones con Canvas, Blackboard y Moodle son funciones Pro opcionales.',
  },
  {
    question: '¿Funciona en iPad y en español?',
    answer:
      'El sitio está disponible en español y Semora funciona como app universal en iPhone y iPad. Tus cursos también están disponibles en la web con la misma cuenta.',
  },
];

export default function SpanishHome() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqPageSchema(FAQ)} />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Escáner universitario con IA</span>
            <h1 className={styles.h1}>
              Escanea tu programa.{' '}
              <span className={styles.gradient}>No pierdas ninguna fecha.</span>
            </h1>
            <p className={styles.sub}>
              Toma una foto, sube un PDF o pega el texto. Semora encuentra tareas, exámenes,
              lecturas, horarios y porcentajes. Nada se guarda hasta que tú lo apruebas.
            </p>
            <div className={styles.heroActions}>
              <SignupButton className={styles.primaryBtn}>Probar gratis</SignupButton>
              <a href={APP_STORE_URL} className={styles.secondaryBtn}>Descargar app</a>
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
            <p>De un programa de estudios a un semestre claro en tres pasos.</p>
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
            <span className={styles.label}>Precios</span>
            <h2>El plan gratis cubre un semestre real.</h2>
            <p>Empieza con fechas, calificaciones y recordatorios. Mejora cuando necesites planificación avanzada.</p>
          </div>
        </Reveal>
        <PricingCards locale="es" />
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
          heading="Haz que tu semestre sea más fácil de ver."
          subheading="Empieza gratis en iPhone, iPad o la web."
        />
      </div>
    </>
  );
}
