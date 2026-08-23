/**
 * Line icons for the download grid, drawn rather than imported so they share
 * one stroke weight and one corner radius. 24px grid, `currentColor`, so a
 * card sets the colour once and the icon follows — including when a
 * coming-soon card mutes everything inside it.
 */
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function AppleIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2.6" />
      <path d="M11 18.6h2" />
    </svg>
  );
}

export function TabletIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="4" y="2.5" width="16" height="19" rx="2.2" />
      <path d="M10.6 18.6h2.8" />
    </svg>
  );
}

export function BrowserIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="16" rx="2.2" />
      <path d="M2.5 9h19M6 6.6h.01M8.6 6.6h.01" />
    </svg>
  );
}

export function WidgetIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="18" height="8" rx="2" />
    </svg>
  );
}

export function AndroidIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M4.6 10.8a7.4 7.4 0 0 1 14.8 0z" />
      <path d="M7.4 5.1 6.2 3M16.6 5.1 17.8 3" />
      <path d="M9.3 8.1h.01M14.7 8.1h.01" />
      <path d="M4.6 12.4h14.8v4.9a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function WatchIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="3" />
      <path d="M9 6.5 9.5 2.6h5L15 6.5M9 17.5l.5 3.9h5l.5-3.9" />
    </svg>
  );
}

export function LaptopIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="4" y="4.5" width="16" height="11" rx="1.8" />
      <path d="M2 19h20" />
    </svg>
  );
}
