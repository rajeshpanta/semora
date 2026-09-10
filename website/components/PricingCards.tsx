import styles from './PricingCards.module.css';
import Link from 'next/link';
import { SignupButton } from './SignupButton';
import {
  PRICING,
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_ANNUAL_MONTHLY_EQUIVALENT,
  PRO_ANNUAL_SAVINGS_PCT,
  PRO_ANNUAL_SAVINGS_AMOUNT,
  PRO_MONTHLY_AMOUNT,
  PRO_ANNUAL_AMOUNT,
} from '@/lib/semora-facts';
import { FREE_FEATURES_ES, PRO_FEATURES_ES } from '@/lib/es-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Three plans, side by side, no billing toggle.
 *
 * The toggle it replaces was the whole problem: only one Pro price could be on
 * screen at a time, so the page could never answer "what does this cost?"
 * without the reader first discovering a control and clicking it. Both Pro
 * prices are now visible at once and the annual saving is a comparison you can
 * actually see rather than a badge asserting it.
 *
 * With the toggle gone there is no state, no handler and no browser API here,
 * so this is a Server Component and the pricing section ships zero JavaScript.
 * Do not add 'use client' back without a reason that needs it.
 *
 * The two Pro cards deliberately repeat the same feature list: they are the
 * same tier billed differently, and a reader comparing two cards should not
 * have to hold one card's bullets in their head while reading the other's.
 */
export function PricingCards({ locale = 'en' }: { locale?: SiteLocale }) {
  const es = locale === 'es';
  const proFeatures = es ? PRO_FEATURES_ES : PRO_FEATURES;
  const freeFeatures = es ? FREE_FEATURES_ES : FREE_FEATURES;

  const copy = es
    ? {
        free: 'Gratis',
        proMonthly: 'Pro mensual',
        proAnnual: 'Pro anual',
        zero: '$0',
        forever: 'Para siempre',
        perMonth: 'al mes',
        perYear: 'al año',
        monthlyAmount: PRO_MONTHLY_AMOUNT,
        annualAmount: PRO_ANNUAL_AMOUNT,
        noCard: 'Sin tarjeta de crédito.',
        monthlyNote: 'Facturación mensual. Cancela cuando quieras.',
        annualNote: `Equivale a ${PRO_ANNUAL_MONTHLY_EQUIVALENT} al mes: ${PRO_ANNUAL_SAVINGS_AMOUNT} menos que pagar mes a mes.`,
        best: 'MEJOR PRECIO',
        save: `Ahorra ${PRO_ANNUAL_SAVINGS_PCT} %`,
        everything: 'Todo lo de Gratis, y además:',
        // Lo primero que dice es lo que más miedo da: si dejas de pagar, no
        // pierdes tu trabajo. Era la cuarta de doce preguntas frecuentes, muy
        // por debajo del precio; aquí está donde se toma la decisión.
        purchase:
          'Si dejas de pagar no desaparece nada: tus cursos, entregas y calificaciones siguen ahí y conservas todo lo del plan Gratis. Pro se compra con tarjeta en la web o en la app de iOS, y en ambos casos se aplica a toda tu cuenta.',
        exploreLead: '¿Aún no lo tienes claro?',
        exploreFeatures: 'Ver todas las funciones',
        exploreCompare: 'Cómo se compara Semora',
        featuresHref: '/es/funciones',
        compareHref: '/es/comparar',
        ctaFree: 'Empezar gratis',
        ctaPro: 'Obtener Pro',
        // Exacto, no aspiracional: en la web, /paywall redirige a quien no ha
        // iniciado sesión, así que la ruta real es cuenta primero y después
        // «Mejorar a Pro» en la pestaña Mi cuenta. Decirlo aquí evita que el
        // botón prometa un checkout que no existe todavía.
        ctaNote: 'Creas tu cuenta gratis y mejoras desde Mi cuenta.',
        trust: ['Cancela cuando quieras', 'Pagos con Stripe', 'iPhone, iPad y web en una cuenta'],
      }
    : {
        free: PRICING.free.name,
        proMonthly: 'Pro Monthly',
        proAnnual: 'Pro Annual',
        zero: PRICING.free.priceLabel,
        forever: 'Forever',
        perMonth: 'per month',
        perYear: 'per year',
        monthlyAmount: PRO_MONTHLY_AMOUNT,
        annualAmount: PRO_ANNUAL_AMOUNT,
        noCard: 'No credit card required.',
        monthlyNote: 'Billed monthly. Cancel anytime.',
        annualNote: `Works out to ${PRO_ANNUAL_MONTHLY_EQUIVALENT} a month: ${PRO_ANNUAL_SAVINGS_AMOUNT} less than paying monthly.`,
        best: 'BEST VALUE',
        save: `Save ${PRO_ANNUAL_SAVINGS_PCT}%`,
        everything: 'Everything in Free, plus:',
        // Leads with the thing students are most afraid of: that stopping
        // payment costs them a semester of work. It does not. This was the
        // fourth of twelve FAQ answers, thousands of words under the price —
        // which is the wrong place for the sentence that removes the fear.
        purchase:
          `Stop paying and nothing disappears — your courses, deadlines and grades stay, and you keep everything on the free plan. ${PRICING.pro.purchaseNote}`,
        exploreLead: 'Not sure yet?',
        exploreFeatures: 'See every feature',
        exploreCompare: 'How Semora compares',
        featuresHref: '/features',
        compareHref: '/compare',
        ctaFree: 'Try it for free',
        ctaPro: 'Get Pro',
        // Exact rather than aspirational. On web the app redirects a signed-out
        // visitor away from /paywall (app/_layout.tsx), so a "Get Pro" button
        // cannot deep-link to checkout today — the real route is account first,
        // then "Upgrade to Pro" in the Me tab. Saying so under the button costs
        // one line and stops the button promising a checkout that is not there.
        ctaNote: 'Create your free account, then upgrade from the Me tab.',
        trust: ['Cancel anytime', 'Payments by Stripe', 'iPhone, iPad and web on one account'],
      };

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.card}>
          <p className={styles.name}>{copy.free}</p>
          <p className={styles.amount}>
            {copy.zero}
            <span className={styles.period}> {copy.forever}</span>
          </p>
          <p className={styles.note}>{copy.noCard}</p>
          <SignupButton className={styles.cta} placement="pricing-free">
            {copy.ctaFree}
          </SignupButton>
          <ul className={styles.list}>
            {freeFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <p className={styles.name}>{copy.proMonthly}</p>
          <p className={styles.amount}>
            {copy.monthlyAmount}
            <span className={styles.period}> {copy.perMonth}</span>
          </p>
          <p className={styles.note}>{copy.monthlyNote}</p>
          <SignupButton
            className={`${styles.cta} ${styles.ctaPro}`}
            placement="pricing-pro-monthly"
          >
            {copy.ctaPro}
          </SignupButton>
          <p className={styles.ctaNote}>{copy.ctaNote}</p>
          <p className={styles.listHead}>{copy.everything}</p>
          <ul className={styles.list}>
            {proFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <div className={`${styles.card} ${styles.pro}`}>
          <p className={styles.name}>
            {copy.proAnnual}
            <span className={styles.best}>{copy.best}</span>
          </p>
          <p className={styles.amount}>
            {copy.annualAmount}
            <span className={styles.period}> {copy.perYear}</span>
            <span className={styles.saveBadge}>{copy.save}</span>
          </p>
          <p className={styles.note}>{copy.annualNote}</p>
          <SignupButton
            className={`${styles.cta} ${styles.ctaPro}`}
            placement="pricing-pro-annual"
          >
            {copy.ctaPro}
          </SignupButton>
          <p className={styles.ctaNote}>{copy.ctaNote}</p>
          <p className={styles.listHead}>{copy.everything}</p>
          <ul className={styles.list}>
            {proFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <ul className={styles.trustRow}>
        {copy.trust.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className={styles.purchaseNote}>{copy.purchase}</p>

      {/* /pricing linked to nothing — not one link to /features or /compare in
          4,400 words. A reader who is not ready to buy had only the back
          button. Deliberately NOT a competitor price table here: an obviously
          self-flattering comparison on your own pricing page reads as a sales
          pitch and costs the trust it is trying to buy. The comparison pages
          already do the fair version, so point at those instead. */}
      <p className={styles.exploreNote}>
        {copy.exploreLead}{' '}
        <Link href={copy.featuresHref}>{copy.exploreFeatures}</Link>
        {/* A visible separator, because two links with only a space between
            them render as one long underline-less phrase — on the phone this
            read as a single link and hid the fact that there are two places
            to go. */}
        <span aria-hidden="true" className={styles.exploreSep}>
          ·
        </span>
        <Link href={copy.compareHref}>{copy.exploreCompare}</Link>
      </p>
    </div>
  );
}
