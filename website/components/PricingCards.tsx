'use client';

import { useState } from 'react';
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

export function PricingCards({ locale = 'en' }: { locale?: SiteLocale }) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const proFeatures = locale === 'es' ? PRO_FEATURES_ES : PRO_FEATURES;
  const freeFeatures = locale === 'es' ? FREE_FEATURES_ES : FREE_FEATURES;
  const monthlyPrice = locale === 'es' ? '$3.99/mes' : PRICING.pro.monthly.priceLabel;
  const annualPrice = locale === 'es' ? '$19.99/año' : PRICING.pro.annual.priceLabel;
  const copy = locale === 'es'
    ? {
        billing: 'Periodo de facturación', monthly: 'Mensual', annual: 'Anual', save: 'Ahorra',
        free: 'Gratis', noCard: 'No necesitas tarjeta de crédito.', monthlyNote: 'Facturación mensual. Cancela cuando quieras.',
        annualNote: 'Facturación anual. Cancela cuando quieras.', monthShort: 'mes',
        purchase: 'Pro se compra dentro de la app y se aplica a toda tu cuenta, incluida la versión web.',
      }
    : {
        billing: 'Billing period', monthly: 'Monthly', annual: 'Annual', save: 'Save',
        free: PRICING.free.name, noCard: 'No credit card required.', monthlyNote: 'Billed monthly. Cancel anytime.',
        annualNote: 'Billed annually. Cancel anytime.', monthShort: 'mo', purchase: PRICING.pro.purchaseNote,
      };

  return (
    <div className={styles.wrap}>
      <div className={styles.toggle} role="tablist" aria-label={copy.billing}>
        <button
          type="button"
          role="tab"
          aria-selected={plan === 'monthly'}
          className={`${styles.toggleBtn} ${plan === 'monthly' ? styles.toggleBtnActive : ''}`}
          onClick={() => setPlan('monthly')}
        >
          {copy.monthly}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={plan === 'annual'}
          className={`${styles.toggleBtn} ${plan === 'annual' ? styles.toggleBtnActive : ''}`}
          onClick={() => setPlan('annual')}
        >
          {copy.annual}
          <span className={styles.saveBadge}>{copy.save} {PRO_ANNUAL_SAVINGS_PCT}%</span>
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.card}>
          <p className={styles.name}>{copy.free}</p>
          <p className={styles.amount}>{PRICING.free.priceLabel}</p>
          <p className={styles.note}>{copy.noCard}</p>
          <ul className={styles.list}>
            {freeFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <div className={`${styles.card} ${styles.pro}`}>
          <p className={styles.name}>{PRICING.pro.name}</p>
          {plan === 'monthly' ? (
            <>
              <p className={styles.amount}>
                {monthlyPrice}
              </p>
              <p className={styles.note}>{copy.monthlyNote}</p>
            </>
          ) : (
            <>
              <p className={styles.amount}>
                {annualPrice}
                <span className={styles.perMonth}>
                  {' '}
                  ({PRO_ANNUAL_MONTHLY_EQUIVALENT}/{copy.monthShort})
                </span>
              </p>
              <p className={styles.note}>{copy.annualNote}</p>
            </>
          )}
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
