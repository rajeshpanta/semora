import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Read a picked file as base64, on every platform.
 *
 * expo-file-system's web build is a shim that implements NOTHING — it exposes
 * only null directory properties — so `FileSystem.readAsStringAsync` throws
 * UnavailabilityError in a browser. Every caller that encoded a file before
 * uploading it therefore failed on app.semoraai.com: syllabus scanning from a
 * photo, a PDF or a drag-and-drop, and lecture-note upload for the tutor. On
 * native nothing changes.
 *
 * On web the picker hands back a blob:/data: URL, which fetch can read, so the
 * bytes are available — they just have to be encoded here instead.
 */
export async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected file.');
  const buffer = new Uint8Array(await response.arrayBuffer());

  // Chunked so a large PDF doesn't blow the argument limit of String.fromCharCode
  // via a single spread — the same guard the edge functions use server-side.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Return the byte size of a picked file on every platform.
 *
 * Browser picker URIs are blob:/data: URLs, so Expo FileSystem cannot inspect
 * them. Fetching the URL yields the same bytes read by readFileAsBase64 and
 * keeps native file:// handling on Expo's filesystem implementation.
 */
export async function getFileSize(uri: string): Promise<number> {
  if (Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected file.');
  return (await response.blob()).size;
}
