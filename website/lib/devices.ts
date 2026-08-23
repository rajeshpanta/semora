import { APP_STORE_URL, APP_URL } from './semora-facts';

/**
 * Every surface Semora runs on, and honestly what state each one is in.
 *
 * One list, two locales, one rule: a device appears here only with the status
 * that is actually true of the shipping product. `available` means a student
 * can be using it ten minutes from now. Everything else is `soon`, including
 * work that is well underway — a download page is the last place a promise
 * should outrun the build.
 *
 * Verified against the app repo on 2026-08-22:
 *  - iPhone/iPad: one universal build (`expo.ios.supportsTablet: true`)
 *  - Widget: targets/widget, WidgetKit, .systemSmall + .systemMedium
 *  - Web: the Expo web export at app.semoraai.com
 *  - Watch: NO watchOS target and no .accessory* families exist
 *  - Android: the target builds and runs, nothing is published
 *  - Wear OS / Mac: not started
 */
export type DeviceStatus = 'available' | 'soon';

export interface DeviceCard {
  id: string;
  /** Where the primary action goes. Absent for anything not shipped. */
  href?: string;
  /** Render a scannable code for this URL next to the card. */
  qr?: string;
  status: DeviceStatus;
  /** True for things that arrive WITH another download rather than on their own. */
  included?: boolean;
}

export const DEVICES: DeviceCard[] = [
  { id: 'iphone', status: 'available', href: APP_STORE_URL, qr: APP_STORE_URL },
  { id: 'ipad', status: 'available', href: APP_STORE_URL, included: true },
  { id: 'web', status: 'available', href: APP_URL, qr: APP_URL },
  { id: 'widget', status: 'available', included: true },
  { id: 'android', status: 'soon' },
  { id: 'watch', status: 'soon' },
  { id: 'wearos', status: 'soon' },
  { id: 'mac', status: 'soon' },
];

export interface DeviceCopy {
  name: string;
  /** One line. What this surface is FOR, not that it exists. */
  body: string;
  action?: string;
}

export const DEVICE_COPY_EN: Record<string, DeviceCopy> = {
  iphone: {
    name: 'iPhone',
    body: 'The full app. Scan a syllabus with the camera, get reminders before every deadline.',
    action: 'Download on the App Store',
  },
  ipad: {
    name: 'iPad',
    body: 'The same download, laid out for the bigger screen. One app, both devices.',
    action: 'Included with the iPhone app',
  },
  web: {
    name: 'Web',
    body: 'Nothing to install. Drag a syllabus PDF straight onto the page from any laptop.',
    action: 'Open Semora in your browser',
  },
  widget: {
    name: 'Home Screen widget',
    body: "What's due today, on your Home Screen, without opening anything.",
    action: 'Included with the iPhone and iPad app',
  },
  android: { name: 'Android', body: 'In development. Same account, same semester, same deadlines.' },
  watch: { name: 'Apple Watch', body: 'Your next deadline on your wrist.' },
  wearos: { name: 'Wear OS', body: 'The same glance, for an Android watch.' },
  mac: { name: 'Mac', body: 'A desktop window for the work you do sitting down.' },
};

export const DEVICE_COPY_ES: Record<string, DeviceCopy> = {
  iphone: {
    name: 'iPhone',
    body: 'La app completa. Escanea un programa con la cámara y recibe avisos antes de cada entrega.',
    action: 'Descargar en la App Store',
  },
  ipad: {
    name: 'iPad',
    body: 'La misma descarga, adaptada a la pantalla grande. Una app, los dos dispositivos.',
    action: 'Incluido con la app de iPhone',
  },
  web: {
    name: 'Web',
    body: 'Nada que instalar. Arrastra el PDF del programa a la página desde cualquier computadora.',
    action: 'Abrir Semora en el navegador',
  },
  widget: {
    name: 'Widget de pantalla de inicio',
    body: 'Lo que vence hoy, en tu pantalla de inicio, sin abrir nada.',
    action: 'Incluido con la app de iPhone y iPad',
  },
  android: { name: 'Android', body: 'En desarrollo. La misma cuenta, el mismo semestre, las mismas entregas.' },
  watch: { name: 'Apple Watch', body: 'Tu próxima entrega en la muñeca.' },
  wearos: { name: 'Wear OS', body: 'La misma mirada rápida, para un reloj Android.' },
  mac: { name: 'Mac', body: 'Una ventana de escritorio para el trabajo que haces sentado.' },
};
