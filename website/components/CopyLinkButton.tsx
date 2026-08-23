'use client';

import { useState } from 'react';
import styles from './DeviceGrid.module.css';

/**
 * Copy the download link, for the visitor who is on a laptop with their phone
 * face-down on the desk and no camera pointed at anything.
 *
 * Deliberately not a "text it to me" field: sending an SMS means a paid
 * gateway, a phone number we would then be storing, and a delivery failure
 * mode the visitor cannot see. A copied link is instant and needs nothing.
 *
 * `navigator.clipboard` is unavailable on insecure origins and can be denied
 * outright, so failure falls back to selecting nothing and simply not
 * confirming — the link is still visible in the QR code beside it.
 */
export function CopyLinkButton({
  url,
  label,
  copiedLabel,
}: {
  url: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* Clipboard denied — the QR beside this button still works. */
        }
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
