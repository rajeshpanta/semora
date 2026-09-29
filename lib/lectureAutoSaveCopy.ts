import type { AutoSaveReason } from '@/lib/lectureSession';

/** Why a recording saved itself, in the student's words. Null for a plain Stop. */
export function autoSaveAlert(reason: AutoSaveReason | null, maxMinutes: number): { title: string; body: string } | null {
  switch (reason) {
    case 'limit':
      return { title: 'Recording saved', body: `It reached the ${maxMinutes}-minute limit, so Semora saved it for you.` };
    case 'wall_clock':
      return { title: 'Recording saved', body: 'It had been running for much longer than a class, so Semora stopped and saved it.' };
    case 'storage':
      return { title: 'Recording saved', body: 'Your phone was almost out of storage, so Semora stopped and saved what it had.' };
    default:
      return null;
  }
}
