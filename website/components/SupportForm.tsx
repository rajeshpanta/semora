'use client';

import { FormEvent, useState } from 'react';
import styles from '@/app/(en)/support/support.module.css';
import type { SiteLocale } from '@/lib/i18n';

interface SupportFormProps {
  supportEmail: string;
  locale?: SiteLocale;
}

export function SupportForm({ supportEmail, locale = 'en' }: SupportFormProps) {
  const [status, setStatus] = useState('');
  const es = locale === 'es';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get('name') ?? '').trim();
    const email = String(values.get('email') ?? '').trim();
    const topic = String(values.get('topic') ?? '').trim();
    const message = String(values.get('message') ?? '').trim();
    const subject = topic
      ? `${es ? 'Ayuda de Semora' : 'Semora support'} — ${topic}`
      : es ? 'Solicitud de ayuda de Semora' : 'Semora support request';
    const body = [es ? `Nombre: ${name}` : `Name: ${name}`, `Email: ${email}`, '', message].join('\n');

    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus(es
      ? 'Hemos preparado el mensaje en tu aplicación de correo. Solo falta enviarlo.'
      : 'Your email app is ready with your message. Send it there to reach us.');
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formHeading}>
        <h2>{es ? 'Envíanos un mensaje' : 'Send us a message'}</h2>
        <p>{es ? 'Cuéntanos qué ocurrió y añade todos los detalles que puedas.' : <>Include as much detail as you can, and we&apos;ll help you from there.</>}</p>
      </div>

      <div className={styles.twoColumns}>
        <label>
          {es ? 'Nombre' : 'Name'}
          <input name="name" autoComplete="name" placeholder={es ? 'Tu nombre' : 'Your name'} required />
        </label>
        <label>
          {es ? 'Correo electrónico' : 'Email'}
          <input name="email" type="email" autoComplete="email" placeholder={es ? 'tu@ejemplo.com' : 'you@example.com'} required />
        </label>
      </div>
      <label>
        {es ? 'Tema' : 'Topic'}
        <select name="topic" defaultValue="">
          <option value="" disabled>{es ? 'Selecciona un tema' : 'Select a topic'}</option>
          <option>{es ? 'Cuenta o inicio de sesión' : 'Account or sign-in'}</option>
          <option>{es ? 'Análisis del programa de una materia' : 'Syllabus scan'}</option>
          <option>{es ? 'Suscripción o facturación' : 'Subscription or billing'}</option>
          <option>{es ? 'Sincronización con Canvas o LMS' : 'Canvas or LMS sync'}</option>
          <option>{es ? 'Reporte de error' : 'Bug report'}</option>
          <option>{es ? 'Otro tema' : 'Something else'}</option>
        </select>
      </label>
      <label>
        {es ? 'Mensaje' : 'Message'}
        <textarea name="message" placeholder={es ? 'Describe tu problema o pregunta…' : 'Describe your issue or question…'} required rows={3} />
      </label>
      <button type="submit">{es ? 'Enviar mensaje' : 'Send message'} <span aria-hidden="true">→</span></button>
      <p className={styles.formNote} aria-live="polite">{status || (es
        ? 'Al enviar el formulario, se abrirá tu app de correo con el mensaje listo.'
        : 'Sending opens your email app with this message addressed to us.')}</p>
    </form>
  );
}
