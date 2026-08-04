import Link from 'next/link';
import styles from './ShareLanding.module.css';
import { APP_STORE_URL, APP_URL, SITE_NAME } from '@/lib/semora-facts';

/**
 * The public landing page behind every link a Semora user shares.
 *
 * Before this existed, sharing emitted a bare `semora://` URL. That opens the
 * app if it is already installed and does nothing at all otherwise — which is
 * every recipient worth having, since the whole point of a share is reaching
 * someone who does not have Semora yet. Pasted into a group chat it rendered
 * as unclickable grey text with no preview.
 *
 * So the shared URL is now an https page here, and it does three things a
 * custom scheme cannot: it renders a link preview in iMessage/Discord/Slack,
 * it works on a laptop, and it can explain what Semora is to someone who has
 * never heard of it. The `semora://` handoff still happens — it is just one
 * of the buttons on this page instead of the whole mechanism.
 *
 * Deliberately no automatic redirect. Bouncing straight to `semora://` shows
 * an OS error dialog to everyone without the app installed, which is the
 * majority of this page's traffic and the worst possible first impression.
 */

export type ShareKind = 'join' | 'invite' | 'collaborate';

const COPY: Record<
  ShareKind,
  { eyebrow: string; heading: string; body: string; deepLinkParam: string; appPath: string }
> = {
  join: {
    eyebrow: 'Shared course',
    heading: 'A classmate shared their course with you',
    body: `Open it in ${SITE_NAME} and every deadline, exam, and grading weight from their syllabus lands in your own semester — as your private copy, which you can edit however you like.`,
    deepLinkParam: 'token',
    appPath: 'join',
  },
  invite: {
    eyebrow: 'Invitation',
    heading: `You've been invited to ${SITE_NAME}`,
    body: `Join with this link and you both get a free month of Pro. ${SITE_NAME} turns a syllabus photo into a semester of tracked deadlines, grades, and study time.`,
    deepLinkParam: 'code',
    appPath: 'invite',
  },
  collaborate: {
    eyebrow: 'Course space',
    heading: 'Join your classmates in a course space',
    body: `A course space keeps one shared set of deadlines and group assignments in sync for everyone in the class, so when one person adds the exam date, everybody has it.`,
    deepLinkParam: 'token',
    appPath: 'collaborate',
  },
};

export function ShareLanding({ kind, value }: { kind: ShareKind; value: string }) {
  const copy = COPY[kind];
  const encoded = encodeURIComponent(value);
  const deepLink = `semora://${copy.appPath}?${copy.deepLinkParam}=${encoded}`;
  const webLink = `${APP_URL}/${copy.appPath}?${copy.deepLinkParam}=${encoded}`;

  return (
    <div className={styles.wrap}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.heading}>{copy.heading}</h1>
        <p className={styles.body}>{copy.body}</p>

        <div className={styles.actions}>
          {/* Order matters: most recipients do not have the app, so the store
              link is primary and the app handoff sits just under it for the
              ones who do. */}
          <a href={APP_STORE_URL} className={styles.primary}>
            Get {SITE_NAME} — free
          </a>
          <a href={deepLink} className={styles.secondary}>
            Already have the app? Open it
          </a>
        </div>

        <p className={styles.fallback}>
          On a laptop?{' '}
          <a href={webLink} className={styles.textLink}>
            Open it in your browser
          </a>{' '}
          instead — no install needed.
        </p>
      </section>

      <section className={styles.explainer}>
        <h2 className={styles.explainerHeading}>What is {SITE_NAME}?</h2>
        <p className={styles.explainerBody}>
          {SITE_NAME} reads your syllabus and builds your semester for you. Take a photo or upload
          the PDF, and every assignment, quiz, exam, and grading weight comes out organized, with
          reminders before things are due and a grade that updates itself as scores come in.
        </p>
        <div className={styles.explainerLinks}>
          <Link href="/" className={styles.textLink}>
            See how it works
          </Link>
          <Link href="/pricing" className={styles.textLink}>
            Pricing
          </Link>
          <Link href="/features" className={styles.textLink}>
            All features
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * Share values are opaque tokens/codes from our own backend. Anything wildly
 * outside that shape is a mangled paste or someone poking at the route — the
 * page still renders (there is nothing to leak), but a cap keeps absurd input
 * out of the generated links.
 */
export function isPlausibleShareValue(value: string | undefined): value is string {
  return !!value && value.length > 0 && value.length <= 256;
}
