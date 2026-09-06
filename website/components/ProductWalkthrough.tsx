import Image from 'next/image';
import Link from 'next/link';
import { SignupButton } from './SignupButton';
import styles from './ProductWalkthrough.module.css';
import type { SiteLocale } from '@/lib/i18n';

/** Product previews use illustrative data; the sample is not a customer result. */
export function ProductWalkthrough({ kind = 'scanner', locale = 'en' }: {
  kind?: 'scanner' | 'canvas';
  locale?: SiteLocale;
}) {
  const es = locale === 'es';
  const scanner = kind === 'scanner';
  return (
    <section className={styles.walkthrough} aria-label={es ? 'Cómo empezar' : 'Getting started'}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{es ? 'De la primera fecha a tu plan' : 'From the first deadline to your plan'}</p>
        <h2>{scanner
          ? es ? 'Un programa. Fechas que puedes revisar.' : 'One syllabus. Deadlines you can review.'
          : es ? 'Tus entregas, juntas en un solo lugar.' : 'Your assignments, together in one place.'}</h2>
        <ol className={styles.steps}>
          {scanner ? <>
            <li><strong>{es ? 'Añade tu programa.' : 'Add your syllabus.'}</strong> {es ? 'Usa una foto o un archivo. En la web también puedes pegar el texto.' : 'Use a photo or file. On the web, you can also paste the text.'}</li>
            <li><strong>{es ? 'Revisa las fechas extraídas.' : 'Review the extracted dates.'}</strong> {es ? 'Corrige las fechas dudosas y deja sin fecha lo que aún no se haya anunciado.' : 'Correct uncertain dates and leave unannounced deadlines undated.'}</li>
            <li><strong>{es ? 'Guarda y organiza tu semana.' : 'Save and organize your week.'}</strong> {es ? 'Las entregas que apruebes aparecen en tus tareas y calendario de Semora.' : 'The deadlines you approve appear in your Semora task list and calendar.'}</li>
          </> : <>
            <li><strong>{es ? 'Abre Calendar Feed en Canvas.' : 'Open Calendar Feed in Canvas.'}</strong> {es ? 'Copia el enlace privado desde el calendario de tu cuenta.' : 'Copy the private feed link from your account’s calendar.'}</li>
            <li><strong>{es ? 'Pégalo en Semora.' : 'Paste it into Semora.'}</strong> {es ? 'Conecta tus clases sin crear un token de acceso.' : 'Connect your classes without creating an access token.'}</li>
            <li><strong>{es ? 'Revisa lo que viene.' : 'Check what’s coming up.'}</strong> {es ? 'Organiza las entregas por fecha. Consulta la última sincronización y confirma los cambios urgentes en Canvas.' : 'Organize assignments by due date. Check the last sync time and confirm urgent changes in Canvas.'}</li>
          </>}
        </ol>
        <SignupButton className={styles.button} placement={`${kind}-walkthrough`}>
          {scanner ? es ? 'Probar el escáner' : 'Try the syllabus scanner' : es ? 'Conectar Canvas gratis' : 'Connect Canvas free'}
        </SignupButton>
        <p className={styles.note}>{scanner
          ? es ? 'Una acción de IA gratis por cuenta, para toda la vida de la cuenta. Sin tarjeta.' : 'One free AI action per account, for the life of the account. No credit card.'
          : es ? 'Conexión con Canvas gratis. Un semestre en el plan gratuito; las clases sincronizadas no cuentan para el límite de cursos manuales.' : 'Canvas connection is free. One semester on Free; synced classes do not count toward the manual-course limit.'}</p>
        <Link className={styles.detail} href={scanner
          ? es ? '/es/funciones/escaner-de-programas' : '/features/syllabus-scanner'
          : es ? '/es/funciones/sincronizacion-canvas' : '/features/canvas-sync'}>
          {es ? 'Ver cómo funciona y sus límites →' : 'See how it works and its limits →'}
        </Link>
      </div>
      <figure className={styles.preview}>
        <Image
          src={scanner ? '/screenshots/scan-syllabus.png' : '/screenshots/never-miss-deadline.png'}
          width={296} height={640}
          sizes="(max-width: 640px) 220px, 240px"
          alt={scanner
            ? es ? 'Vista de Semora con opciones para fotografiar o cargar un programa de estudios' : 'Semora preview showing camera and file upload options for a syllabus'
            : es ? 'Vista de Semora con tareas pendientes, atrasadas y completadas' : 'Semora preview showing upcoming, overdue and completed assignments'}
        />
        <figcaption>{es ? 'Vista de la app en inglés. Datos ilustrativos.' : 'App preview. Illustrative data.'}</figcaption>
      </figure>
    </section>
  );
}
