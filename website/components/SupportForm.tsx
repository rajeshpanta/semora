'use client';

import { FormEvent, useState } from 'react';
import styles from '@/app/support/support.module.css';

interface SupportFormProps {
  supportEmail: string;
}

export function SupportForm({ supportEmail }: SupportFormProps) {
  const [status, setStatus] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get('name') ?? '').trim();
    const email = String(values.get('email') ?? '').trim();
    const topic = String(values.get('topic') ?? '').trim();
    const message = String(values.get('message') ?? '').trim();
    const subject = topic ? `Semora support — ${topic}` : 'Semora support request';
    const body = [`Name: ${name}`, `Email: ${email}`, '', message].join('\n');

    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus('Your email app is ready with your message. Send it there to reach us.');
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formHeading}>
        <h2>Send us a message</h2>
        <p>Include as much detail as you can, and we&apos;ll help you from there.</p>
      </div>

      <div className={styles.twoColumns}>
        <label>
          Name
          <input name="name" autoComplete="name" placeholder="Your name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
      </div>
      <label>
        Topic
        <select name="topic" defaultValue="">
          <option value="" disabled>Select a topic</option>
          <option>Account or sign-in</option>
          <option>Syllabus scan</option>
          <option>Subscription or billing</option>
          <option>Canvas or LMS sync</option>
          <option>Bug report</option>
          <option>Something else</option>
        </select>
      </label>
      <label>
        Message
        <textarea name="message" placeholder="Describe your issue or question…" required rows={3} />
      </label>
      <button type="submit">Send message <span aria-hidden="true">→</span></button>
      <p className={styles.formNote} aria-live="polite">{status || 'Sending opens your email app with this message addressed to us.'}</p>
    </form>
  );
}
