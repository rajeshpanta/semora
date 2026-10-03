import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import styles from '@/components/Prose.module.css';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { OG_IMAGE } from '@/lib/og';
import { ArticleShell } from '@/components/ArticleShell';

// Google Play requires every app that creates accounts to publish a web page
// where deletion can be REQUESTED without opening the app — someone who has
// already uninstalled, or who cannot sign in, still has to have a route. The
// in-app path (Me → Delete Account) satisfies the other half of the same rule.
// This URL is the one entered in the Play Console Data safety form.
export const metadata: Metadata = {
  title: 'Delete Your Semora Account',
  description:
    'How to delete your Semora account and every piece of data attached to it — in the app in under a minute, or by email if you no longer have the app installed.',
  alternates: enAlternates('/delete-account'),
  openGraph: { url: '/delete-account', ...OG_IMAGE },
};

export default function DeleteAccountPage() {
  return (
    <ArticleShell
      ctaHeading="Changed your mind?"
      ctaSubheading="Semora is free to use, and your courses are waiting where you left them."
    >
      <article className={`${styles.prose} article-body`}>
        <h1>Delete Your Semora Account</h1>
        <p className={styles.updated}>Last updated: October 3, 2026</p>

        <p>
          You can delete your Semora account and everything stored with it at any time. There are
          two ways to do it: inside the app, which is immediate, or by email, which is for people
          who have already uninstalled Semora or cannot sign in.
        </p>

        <h2>Option 1 — In the app (immediate)</h2>
        <p>If you still have Semora installed and can sign in, this is the fastest route:</p>
        <ol>
          <li>Open Semora and sign in.</li>
          <li>
            Go to the <strong>Me</strong> tab.
          </li>
          <li>
            Scroll down and tap <strong>Delete Account</strong>.
          </li>
          <li>Confirm. You will be asked to sign in again first, so an unattended phone cannot do this.</li>
        </ol>
        <p>
          Deletion happens straight away and cannot be undone. Your uploaded files are removed
          first, then the account itself.
        </p>

        <h2>Option 2 — By email (no app needed)</h2>
        <p>
          If you have already uninstalled Semora, lost access to your sign-in method, or simply
          prefer not to reinstall, email us and we will delete the account for you:
        </p>
        <p>
          <strong>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`}>
              {SUPPORT_EMAIL}
            </a>
          </strong>
        </p>
        <p>
          Send the request from the email address on the account, and put{' '}
          <em>Account deletion request</em> in the subject line. If you signed up with Apple and
          used Hide My Email, send it from the relay address Apple gave you, or tell us the name on
          the account so we can find it.
        </p>
        <p>
          We confirm the request first, then delete within <strong>30 days</strong>, and email you
          when it is done. In practice it is usually the same week.
        </p>

        <h2>What gets deleted</h2>
        <p>Everything tied to your account is removed:</p>
        <ul>
          <li>Your account and sign-in details</li>
          <li>Semesters, courses, assignments, exams, grades and study plans</li>
          <li>Syllabus files you uploaded, and everything extracted from them</li>
          <li>Lecture recordings, transcripts, generated notes and quizzes</li>
          <li>Flashcard decks and cards</li>
          <li>AI tutor conversations</li>
          <li>Connections to Canvas, Blackboard, Moodle and Google Classroom, and their stored access details</li>
          <li>Google Calendar sync links and the reminder settings attached to your account</li>
          <li>Push notification tokens for your devices</li>
        </ul>

        <h2>What is kept, and why</h2>
        <ul>
          <li>
            <strong>Purchase records.</strong> If you subscribed, the record of the transaction is
            held by Apple or Google, not by us, and tax law requires both of us to keep it. We keep
            the minimum needed to match a payment to a refund request.
          </li>
          <li>
            <strong>Anonymous usage counts.</strong> Semora records which screens are opened, with
            no name or email attached. These rows cannot be traced back to you once the account is
            gone, so they stay as part of aggregate totals.
          </li>
          <li>
            <strong>Support emails.</strong> If you have written to us, that thread stays in our
            mailbox unless you ask for it to be removed as well — just say so in the same email.
          </li>
        </ul>

        <h2>Cancelling a subscription is separate</h2>
        <p>
          Deleting your account does <strong>not</strong> cancel a paid subscription, because the
          subscription lives with the app store, not with us. Cancel it first:
        </p>
        <ul>
          <li>
            <strong>Google Play:</strong> Play Store → profile icon → Payments &amp; subscriptions →
            Subscriptions → Semora → Cancel
          </li>
          <li>
            <strong>Apple:</strong> Settings → your name → Subscriptions → Semora → Cancel
          </li>
        </ul>

        <h2>Questions</h2>
        <p>
          Anything unclear, write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Our{' '}
          <a href="/privacy">Privacy Policy</a> covers what we collect and how long we hold it.
        </p>
      </article>
    </ArticleShell>
  );
}
