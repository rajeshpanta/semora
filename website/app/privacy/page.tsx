import type { Metadata } from 'next';
import styles from '@/components/Prose.module.css';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Semora collects, uses, and safeguards your information.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <article className={styles.prose}>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: July 16, 2026</p>

      <h2>Introduction</h2>
      <p>
        Semora (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your
        privacy. This policy explains how we collect, use, and safeguard your information when
        you use our mobile application.
      </p>

      <h2>Information We Collect</h2>
      <p>We collect the following information:</p>
      <ul>
        <li>
          <strong>Account information:</strong> Email address and password (encrypted) when you
          create an account.
        </li>
        <li>
          <strong>Academic data:</strong> Semesters, courses, tasks, grades, and syllabus content
          that you enter or scan.
        </li>
        <li>
          <strong>Device information:</strong> Timezone, device type, and operating system version
          for app functionality.
        </li>
        <li>
          <strong>Syllabus files:</strong> Documents you upload for AI-powered scanning. These are
          processed to extract deadlines and are not shared with third parties beyond the AI
          processing service.
        </li>
        <li>
          <strong>Study notes:</strong> Lecture notes or slides you optionally upload to the AI
          Tutor. These are stored privately in your account and used only to answer your questions
          about that course.
        </li>
        <li>
          <strong>Usage analytics:</strong> Anonymous, app-level events (e.g. a scan completed, a
          paywall viewed) tied to a random per-install identifier — never to your name or email —
          to help us understand which features are used and improve the app.
        </li>
        <li>
          <strong>Push notification token:</strong> If you grant notification permission, a device
          push token so we can send occasional reminders about upcoming deadlines and new
          semesters.
        </li>
        <li>
          <strong>Referral data:</strong> If you use an invite link, the referral code and the
          fact that two accounts are linked, so we can grant the free-month reward.
        </li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>
          To provide and maintain the app&apos;s core functionality (task management, grade
          tracking, calendar sync).
        </li>
        <li>To process syllabus documents using AI to extract course information and deadlines.</li>
        <li>
          To send you local notification reminders about upcoming deadlines, and — if you grant
          permission — occasional push reminders about deadlines and new semesters.
        </li>
        <li>To sync tasks with your device calendar, and, if you connect it, with Google Calendar.</li>
        <li>
          To power study tools you choose to use (flashcards, focus timer, and an AI tutor grounded
          on your syllabus and any notes you upload).
        </li>
        <li>To apply referral rewards when you invite friends.</li>
      </ul>

      <h2>Data Storage and Security</h2>
      <p>
        Your data is stored securely on Supabase (hosted on AWS). Authentication tokens are stored
        in your device&apos;s secure keychain (iOS Keychain / Android Keystore). We use row-level
        security to ensure you can only access your own data.
      </p>

      <h2>Third-Party Services</h2>
      <ul>
        <li>
          <strong>Supabase:</strong> Database and authentication provider.
        </li>
        <li>
          <strong>Google Gemini AI:</strong> Used to process syllabus documents and power the AI
          tutor. Your syllabus content, and any study notes you upload to the tutor, are sent to
          Google&apos;s API for processing only and are not stored by Google for training purposes.
        </li>
        <li>
          <strong>Apple StoreKit:</strong> For processing in-app subscription purchases.
        </li>
        <li>
          <strong>Expo push service:</strong> Delivers push notifications to your device if you
          enable them.
        </li>
        <li>
          <strong>Google Calendar (optional):</strong> If you connect Google Calendar, we access
          your calendar solely to add and update your Semora deadlines; we do not read your other
          events.
        </li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Your data is retained as long as your account is active. You can delete your account and
        all associated data at any time through the app&apos;s settings (Me tab &gt; Delete
        Account).
      </p>

      <h2>Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal data through the app.</li>
        <li>Delete your account and all data permanently.</li>
        <li>Export your data by contacting us.</li>
      </ul>

      <h2>Children&apos;s Privacy</h2>
      <p>
        Semora is intended for college and university students. We do not knowingly collect
        information from children under 13.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. We will notify you of any changes by posting
        the new policy in the app.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this privacy policy, please contact us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </article>
  );
}
