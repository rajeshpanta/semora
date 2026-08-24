import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import styles from '@/components/Prose.module.css';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { OG_IMAGE } from '@/lib/og';
import { ArticleShell } from '@/components/ArticleShell';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Semora collects, uses, and safeguards your information.',
  alternates: enAlternates('/privacy'),
  openGraph: { url: '/privacy', ...OG_IMAGE },
};

export default function PrivacyPage() {
  return (
    <ArticleShell
      ctaHeading="Try it on your own syllabus"
      ctaSubheading="See how Semora handles your actual courses. Free, no credit card."
    >
    <article className={`${styles.prose} article-body`}>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: August 8, 2026</p>

      <h2>Introduction</h2>
      <p>
        Semora (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your
        privacy. This policy explains how we collect, use, and safeguard your information when
        you use our applications and websites.
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
          <strong>Learning-platform data (optional):</strong> If you choose to connect Canvas,
          Blackboard, Moodle, or Google Classroom, we retrieve the courses and assignments you
          select to import or sync. The imported information is stored as academic data in your
          Semora account.
        </li>
        <li>
          <strong>Device information:</strong> Timezone, device type, and operating system version
          for app functionality.
        </li>
        <li>
          <strong>Syllabus files:</strong> Documents you upload for AI-powered scanning. These are
          processed to extract deadlines and are not shared with third parties beyond the AI
          processing services named below.
        </li>
        <li>
          <strong>Study notes:</strong> Lecture notes or slides you optionally upload to the AI
          Tutor. These are stored privately in your account and used only to answer your questions
          about that course.
        </li>
        <li>
          <strong>Lecture recordings (optional):</strong> If you choose to record a class, Semora
          captures the audio around you — which includes your instructor&apos;s voice and anyone
          speaking nearby. The audio is stored privately in your account only until it has been
          transcribed, and is then <strong>deleted automatically</strong>. Recording never starts
          until you tap Record and confirm you have permission to record.
        </li>
        <li>
          <strong>Lecture transcripts and generated study material:</strong> The text transcript of
          a recording, plus the notes, quizzes, and flashcards generated from it. These stay in your
          account until you delete the recording or your account.
        </li>
        <li>
          <strong>Usage analytics:</strong> Anonymous events (e.g. a page viewed, a scan
          completed, a paywall viewed) tied to a random identifier, never to your name or email,
          to help us understand which features are used and improve the app. On this website that
          identifier is stored in a first-party cookie named <code>semora_device_id</code>, set on
          <code>semoraai.com</code> so the website and the app recognise the same browser and we
          can tell whether a page actually helped someone get started. It is a random number, it is
          never sold, and clearing your browser data removes it. The website also uses Google
          Analytics, which sets its own first-party cookies (their names begin <code>_ga</code>) to
          count visits and tell one visit apart from the next; the <code>semora_device_id</code>
          above is deliberately not sent to Google, so the two measurements cannot be joined into a
          profile of you. No advertising cookie is set on any Semora site, and nothing measured here
          is used for ad targeting.
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
          To send you local notification reminders about upcoming deadlines, and, if you grant permission, occasional push reminders about deadlines and new semesters.
        </li>
        <li>To sync tasks with your device calendar, and, if you connect it, with Google Calendar.</li>
        <li>To import and sync the courses and assignments you choose from a connected learning platform.</li>
        <li>
          To power study tools you choose to use (flashcards, focus timer, and an AI tutor grounded
          on your syllabus and any notes you upload).
        </li>
        <li>
          To transcribe class lectures you choose to record, and to generate notes, quizzes, and
          flashcards from those transcripts.
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
          <strong>OpenAI GPT-5.6 Luna:</strong> Semora&apos;s text AI provider. It reads your
          syllabus documents, generates flashcards, practice questions and quizzes, writes your
          lecture notes, and answers your questions in the AI Tutor. Your syllabus content, any
          study notes you choose to upload, and lecture transcripts are sent to the OpenAI API for
          processing. OpenAI states that API data is not used to train its models unless a customer
          explicitly opts in. Semora disables response storage for these requests; OpenAI may still
          retain abuse-monitoring logs for up to 30 days unless a stricter retention control applies
          to the account.
        </li>
        <li>
          <strong>Groq (speech-to-text):</strong> Used only if you record a lecture. The audio of
          that recording is sent to Groq&apos;s transcription API to be converted into text, along
          with the title you gave the recording and the last few sentences already transcribed —
          those help the transcription keep names and terminology consistent across a long lecture.
          Transcription is the only purpose your audio is used for, and Groq is the only service it
          is sent to. Nothing else from your account — no syllabus, no notes, no tutor messages — is
          sent to Groq.
        </li>
        <li>
          <strong>Google Analytics (website only):</strong> Used on <code>semoraai.com</code> to
          measure which pages and which channels actually bring people to Semora. Google receives
          the address of the page viewed, the events described above, and the technical data any web
          request carries — including the request&apos;s IP address, which Google Analytics 4 uses to
          derive an approximate location and does not store. It does not run inside the app, and it
          never receives your account data.
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
        <li>
          <strong>Learning platforms (optional):</strong> Canvas, Blackboard, Moodle, and Google
          Classroom provide the course and assignment data you choose to sync. By default, their
          access tokens or authorization credentials stay on your device and are used only while you
          sync in Semora. If you explicitly turn on <em>Automatic sync</em>, we store that credential
          encrypted in Supabase Vault so Semora can check for selected course, assignment,
          submission, and grade updates while the app is closed. It is never exposed in your Semora
          account, and we delete it when you turn off Automatic sync or disconnect the platform.
        </li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Your data is retained as long as your account is active. You can delete your account and
        all associated data at any time through the app&apos;s settings (Me tab &gt; Delete
        Account).
      </p>
      <p>
        <strong>Lecture audio is the exception, and is deleted sooner.</strong> The recording itself
        is removed from our storage as soon as its transcript has been created — usually within a
        few minutes of you stopping the recording. Only the transcript and the study material
        generated from it remain, and those are deleted when you delete the recording or your
        account.
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
    </ArticleShell>
  );
}
