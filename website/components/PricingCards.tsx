import styles from './PricingCards.module.css';
import {
  PRICING,
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_ANNUAL_MONTHLY_EQUIVALENT,
  PRO_ANNUAL_SAVINGS_PCT,
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
        monthlyAmount: '$3.99',
        annualAmount: '$19.99',
        noCard: 'Sin tarjeta de crédito.',
        monthlyNote: 'Facturación mensual. Cancela cuando quieras.',
        annualNote: `Equivale a ${PRO_ANNUAL_MONTHLY_EQUIVALENT} al mes. Cancela cuando quieras.`,
        best: 'MEJOR PRECIO',
        save: `Ahorra ${PRO_ANNUAL_SAVINGS_PCT} %`,
        everything: 'Todo lo de Gratis, y además:',
        purchase:
          'Pro se compra con tarjeta en la web o en la app de iOS, y en ambos casos se aplica a toda tu cuenta.',
      }
    : {
        free: PRICING.free.name,
        proMonthly: 'Pro Monthly',
        proAnnual: 'Pro Annual',
        zero: PRICING.free.priceLabel,
        forever: 'Forever',
        perMonth: 'per month',
        perYear: 'per year',
        monthlyAmount: '$3.99',
        annualAmount: '$19.99',
        noCard: 'No credit card required.',
        monthlyNote: 'Billed monthly. Cancel anytime.',
        annualNote: `Works out to ${PRO_ANNUAL_MONTHLY_EQUIVALENT} a month. Cancel anytime.`,
        best: 'BEST VALUE',
        save: `Save ${PRO_ANNUAL_SAVINGS_PCT}%`,
        everything: 'Everything in Free, plus:',
        purchase: PRICING.pro.purchaseNote,
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
          <p className={styles.listHead}>{copy.everything}</p>
          <ul className={styles.list}>
            {proFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className={styles.purchaseNote}>{copy.purchase}</p>
    </div>
  );
}
