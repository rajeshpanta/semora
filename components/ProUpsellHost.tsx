import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ProUpsellSheet, type ProUpsellReason } from '@/components/ProUpsellSheet';

/**
 * One upgrade sheet, reachable from anywhere.
 *
 * Semora has roughly fifty Pro walls across twenty-five screens, and every one
 * of them used to answer the same way: push /paywall. That is a navigation —
 * the student loses the thing they were doing, arrives somewhere else, and has
 * to come back afterwards to try again. For a wall they may only be curious
 * about, it is a heavy price for asking a question.
 *
 * Mounting a sheet in twenty-five screens instead would mean twenty-five
 * copies of the same state, and a slow drift where some screens got the sheet
 * and others kept navigating. So the sheet is mounted ONCE, above the router,
 * and any screen opens it with one call:
 *
 *   const showPro = useProUpsell();
 *   showPro('tutor');
 *
 * Above the router on purpose: a sheet owned by a screen dies with that
 * screen, and several of these walls fire during a navigation.
 *
 * What this does NOT replace: the /paywall screen itself. It is still the
 * place a deliberate "show me Pro" goes — the Me tab's card, the plan buttons
 * in Settings — and on native it is still where a StoreKit purchase completes,
 * because the transaction listeners and restore path live there. This changes
 * how a WALL answers, not how buying works.
 */

type ShowProUpsell = (reason: ProUpsellReason) => void;

const ProUpsellContext = createContext<ShowProUpsell>(() => {});

/** Open the upgrade sheet. No-op outside the provider, never throws. */
export function useProUpsell(): ShowProUpsell {
  return useContext(ProUpsellContext);
}

export function ProUpsellHost({ children }: { children: React.ReactNode }) {
  const [reason, setReason] = useState<ProUpsellReason | null>(null);

  const show = useCallback<ShowProUpsell>((next) => {
    // Setting the reason IS opening it; a separate `visible` flag would let the
    // two disagree and show the sheet with the previous feature's words.
    setReason(next);
  }, []);

  // The provider value must be stable or every consumer re-renders whenever the
  // sheet opens — which is most of the app, for a modal nobody else cares about.
  const value = useMemo(() => show, [show]);

  return (
    <ProUpsellContext.Provider value={value}>
      {children}
      <ProUpsellSheet
        visible={reason !== null}
        // Falls back to 'scan' only while closing: the sheet keeps its content
        // through the dismiss animation, and a null here would blank the text
        // mid-fade.
        reason={reason ?? 'scan'}
        onClose={() => setReason(null)}
      />
    </ProUpsellContext.Provider>
  );
}
