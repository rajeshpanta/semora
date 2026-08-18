'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from '@/app/(en)/support/support.module.css';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The support form.
 *
 * It used to hand the visitor off to `mailto:` — which opens nothing at all on
 * a browser with no OS mail handler (Gmail in a tab, which is most students),
 * while the page cheerfully reported "Your email app is ready with your
 * message." Nothing was captured server-side either, so those messages were
 * simply gone.
 *
 * Now it POSTs to /api/support → the `submit-support` Supabase edge function,
 * which stores the request and then emails it on. Sending happens on this
 * screen; nothing navigates away.
 *
 * The failure path still matters: if the request cannot get through, the
 * visitor is told plainly and handed the support address as a mailto fallback
 * — the old behaviour, but only when it is genuinely the last resort and never
 * dressed up as success.
 */

type Status = 'idle' | 'sending' | 'sent' | 'error';
type ErrorCode = 'invalid' | 'rate_limited' | 'unavailable';

interface SupportFormProps {
  supportEmail: string;
  locale?: SiteLocale;
}

const COPY = {
  en: {
    heading: 'Send us a message',
    sub: "Include as much detail as you can, and we'll help you from there.",
    name: 'Name',
    namePlaceholder: 'Your name',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    topic: 'Topic',
    topicPlaceholder: 'Select a topic',
    message: 'Message',
    messagePlaceholder: 'Describe your issue or question…',
    send: 'Send message',
    sending: 'Sending…',
    idleNote: 'We only use your email to reply to this message.',
    sentNote:
      'Your message has been emailed to our support team. Someone will get back to you within 24 hours.',
    errors: {
      invalid: 'Please check your name, email address, and message, then try again. Or email us at',
      rate_limited: 'That is a lot of messages in one hour. Please email us directly at',
      unavailable: 'We could not send that just now. You can email us directly at',
    },
    topics: [
      'Account or sign-in',
      'Syllabus scan',
      'Subscription or billing',
      'Canvas or LMS sync',
      'Bug report',
      'Feature request',
      'Something else',
    ],
    // Named rather than indexed: the ?topic=feature preselect used to reach
    // into topics by position, which breaks silently the moment the list is
    // reordered. Must match one of the strings above exactly.
    featureTopic: 'Feature request',
  },
  es: {
    heading: 'Envíanos un mensaje',
    sub: 'Cuéntanos qué ocurrió y añade todos los detalles que puedas.',
    name: 'Nombre',
    namePlaceholder: 'Tu nombre',
    email: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    topic: 'Tema',
    topicPlaceholder: 'Selecciona un tema',
    message: 'Mensaje',
    messagePlaceholder: 'Describe tu problema o pregunta…',
    send: 'Enviar mensaje',
    sending: 'Enviando…',
    idleNote: 'Solo usamos tu correo para responder a este mensaje.',
    sentNote:
      'Tu mensaje se envió por correo a nuestro equipo de ayuda. Te responderemos en menos de 24 horas.',
    errors: {
      invalid: 'Revisa tu nombre, correo y mensaje, e inténtalo de nuevo. O escríbenos a',
      rate_limited: 'Son muchos mensajes en una hora. Escríbenos directamente a',
      unavailable: 'No pudimos enviarlo en este momento. Puedes escribirnos directamente a',
    },
    topics: [
      'Cuenta o inicio de sesión',
      'Análisis del programa de una materia',
      'Suscripción o facturación',
      'Sincronización con Canvas o LMS',
      'Reporte de error',
      'Sugerencia de función',
      'Otro tema',
    ],
    featureTopic: 'Sugerencia de función',
  },
} as const;

export function SupportForm({ supportEmail, locale = 'en' }: SupportFormProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorCode, setErrorCode] = useState<ErrorCode>('unavailable');
  const copy = COPY[locale];

  // The app links here with ?topic=feature from "Request a feature" in the Me
  // tab. Preselecting saves the one step the link exists to skip; an unknown
  // value falls through to the placeholder rather than breaking.
  //
  // Read from window rather than useSearchParams: that hook opts the whole
  // route out of static prerendering unless it is wrapped in Suspense, and
  // /support and /es/ayuda are static pages. A query string this page reads
  // once is not worth making both of them render on the client.
  //
  // Deferred to a microtask for the same reason Reveal and TableOfContents do
  // it: reading the URL is a measurement of the environment, not a render
  // input, and setting state straight from an effect trips the
  // cascading-render rule. Identical timing, honest about what it is.
  const [topic, setTopic] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('topic') !== 'feature') return;
    queueMicrotask(() => setTopic(copy.featureTopic));
  }, [copy.featureTopic]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;

    const form = event.currentTarget;
    const values = new FormData(form);
    setStatus('sending');

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.get('name'),
          email: values.get('email'),
          topic: values.get('topic'),
          message: values.get('message'),
          company: values.get('company'),
          locale,
          page: window.location.pathname,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { code?: string };
        setErrorCode(
          data.code === 'invalid' || data.code === 'rate_limited' ? data.code : 'unavailable',
        );
        setStatus('error');
        return;
      }

      // Clearing only on success means a failed send never costs anyone the
      // message they just typed — they can retry, or copy it into an email.
      form.reset();
      setTopic('');
      setStatus('sent');
    } catch {
      setErrorCode('unavailable');
      setStatus('error');
    }
  }

  const sending = status === 'sending';

  // Native validation stays on (no noValidate): `required` and type="email"
  // catch an empty or malformed field inline, before the round trip. The server
  // checks again — that is the boundary — but the browser is the faster teacher.
  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formHeading}>
        <h2>{copy.heading}</h2>
        <p>{copy.sub}</p>
      </div>

      <div className={styles.twoColumns}>
        <label>
          {copy.name}
          <input
            name="name"
            autoComplete="name"
            placeholder={copy.namePlaceholder}
            maxLength={120}
            required
          />
        </label>
        <label>
          {copy.email}
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder={copy.emailPlaceholder}
            maxLength={254}
            required
          />
        </label>
      </div>
      <label>
        {copy.topic}
        <select name="topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
          <option value="" disabled>
            {copy.topicPlaceholder}
          </option>
          {copy.topics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <label>
        {copy.message}
        <textarea
          name="message"
          placeholder={copy.messagePlaceholder}
          maxLength={5000}
          required
          rows={3}
        />
      </label>

      {/* Honeypot. Hidden from people, irresistible to form bots; anything that
          fills it in is discarded server-side. aria-hidden + tabIndex keep it
          out of the way of screen readers and keyboard navigation, and
          autoComplete="off" stops a browser helpfully filling it for a human. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Company
          <input name="company" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" disabled={sending}>
        {sending ? copy.sending : copy.send}
        {!sending && <span aria-hidden="true">→</span>}
      </button>

      <p
        className={`${styles.formNote} ${status === 'sent' ? styles.formNoteOk : ''} ${
          status === 'error' ? styles.formNoteError : ''
        }`}
        aria-live="polite"
      >
        {status === 'sent' && copy.sentNote}
        {status === 'error' && (
          <>
            {copy.errors[errorCode]} <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
          </>
        )}
        {(status === 'idle' || sending) && copy.idleNote}
      </p>
    </form>
  );
}
