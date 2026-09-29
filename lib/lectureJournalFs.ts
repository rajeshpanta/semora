/**
 * The real filesystem behind lib/lectureJournal.ts.
 *
 * Kept apart so the journal itself stays pure and every crash boundary in it
 * can be tested without a device. This file is the only place the journal knows
 * about expo-file-system, and it is deliberately thin: no decisions, just the
 * six operations the journal asks for.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { createJournalStore, type JournalFs, type JournalStore } from '@/lib/lectureJournal';

export const lectureJournalFs: JournalFs = {
  async readDir(path) {
    return FileSystem.readDirectoryAsync(path);
  },
  async readText(path) {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return FileSystem.readAsStringAsync(path);
  },
  async writeText(path, data) {
    await FileSystem.writeAsStringAsync(path, data);
  },
  async move(from, to) {
    // `to` is a generation that has never existed, so there is nothing to
    // overwrite. If one somehow does exist, moving onto it would be the bug,
    // not the fix, so the failure is left to surface.
    await FileSystem.moveAsync({ from, to });
  },
  async remove(path) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  },
  async makeDir(path) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  },
};

/** `documents/lectures/<lectureId>/`, the directory the audio already lives in. */
export function lectureDir(lectureId: string): string {
  return `${FileSystem.documentDirectory}lectures/${lectureId}/`;
}

/**
 * ONE store per lecture for the life of the app.
 *
 * A store serializes its own writes, but two stores for the same lecture do
 * not know about each other: the recorder saving a part and the upload queue
 * marking another could each read generation N and write N+1, and one of the
 * two changes was silently lost. Handing out the same instance closes that.
 */
const stores = new Map<string, JournalStore>();

export function lectureJournalStore(ownerId: string, lectureId: string): JournalStore {
  const existing = stores.get(lectureId);
  if (existing) return existing;
  const store = createJournalStore(lectureJournalFs, lectureDir(lectureId), ownerId, lectureId);
  stores.set(lectureId, store);
  return store;
}

/** Forget a lecture's store once its folder is gone. */
export function forgetLectureJournalStore(lectureId: string): void {
  stores.delete(lectureId);
}

/** Filenames sitting in a lecture's directory. Empty when there is no directory. */
export async function lectureDirFilenames(lectureId: string): Promise<string[]> {
  return FileSystem.readDirectoryAsync(lectureDir(lectureId)).catch(() => [] as string[]);
}
