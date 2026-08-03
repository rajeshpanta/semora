'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './PricingCards.module.css';
import {
  PRICING,
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_ANNUAL_MONTHLY_EQUIVALENT,
  PRO_ANNUAL_SAVINGS_PCT,
} from '@/lib/semora-facts';

export function PricingCards({ proFeatureLimit }: { proFeatureLimit?: number }) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const proFeatures = proFeatureLimit ? PRO_FEATURES.slice(0, proFeatureLimit) : PRO_FEATURES;

  return (
    <div className={styles.wrap}>
      <div className={styles.toggle} role="tablist" aria-label="Billing period">
        <button
          type="button"
          role="tab"
          aria-selected={plan === 'monthly'}
          className={`${styles.toggleBtn} ${plan === 'monthly' ? styles.toggleBtnActive : ''}`}
          onClick={() => setPlan('monthly')}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={plan === 'annual'}
          className={`${styles.toggleBtn} ${plan === 'annual' ? styles.toggleBtnActive : ''}`}
          onClick={() => setPlan('annual')}
        >
          Annual
          <span className={styles.saveBadge}>Save {PRO_ANNUAL_SAVINGS_PCT}%</span>
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.card}>
          <p className={styles.name}>{PRICING.free.name}</p>
          <p className={styles.amount}>{PRICING.free.priceLabel}</p>
          <p className={styles.note}>No credit card required.</p>
          <ul className={styles.list}>
            {FREE_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <div className={`${styles.card} ${styles.pro}`}>
          <p className={styles.name}>{PRICING.pro.name}</p>
          {plan === 'monthly' ? (
            <>
              <p className={styles.amount}>
                {PRICING.pro.monthly.priceLabel}
              </p>
              <p className={styles.note}>Billed monthly. Cancel anytime.</p>
            </>
          ) : (
            <>
              <p className={styles.amount}>
                {PRICING.pro.annual.priceLabel}
                <span className={styles.perMonth}>
                  {' '}
                  ({PRO_ANNUAL_MONTHLY_EQUIVALENT}/mo)
                </span>
              </p>
              <p className={styles.note}>Billed annually. Cancel anytime.</p>
            </>
          )}
          <ul className={styles.list}>
            {proFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className={styles.purchaseNote}>{PRICING.pro.purchaseNote}</p>

      {proFeatureLimit && (
        <div className={styles.moreLink}>
          <Link href="/pricing">See full pricing details</Link>
        </div>
      )}
    </div>
  );
}
