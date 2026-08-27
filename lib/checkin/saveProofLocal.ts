import { Platform } from 'react-native';

export const CHECKIN_SAVE_PERMISSION =
  'Save proof photos to your library so you can resend if the upload fails.';

export const CHECKIN_UPLOAD_SAVED_NATIVE =
  'Saved to your photos. You can pick it from Gallery and send again.';

export const CHECKIN_UPLOAD_SAVED_WEB = 'Kept on this device. Send again when you’re ready.';

export function checkinUploadStayCopy(): string {
  return Platform.OS === 'web' ? CHECKIN_UPLOAD_SAVED_WEB : CHECKIN_UPLOAD_SAVED_NATIVE;
}

export type SaveCapturedProofInput = {
  uri?: string | null;
  fromLibrary?: boolean;
};

export type SaveCapturedProofResult = {
  saved: boolean;
  reason?: 'library' | 'empty' | 'health' | 'denied' | 'web' | 'failed';
};

const WEB_DB = 'blob-checkin-local';
const WEB_STORE = 'proofs';

function shouldSkip(input: SaveCapturedProofInput): SaveCapturedProofResult | null {
  const uri = input.uri?.trim() ?? '';
  if (!uri) {
    return { saved: false, reason: 'empty' };
  }
  if (uri.startsWith('health:')) {
    return { saved: false, reason: 'health' };
  }
  if (input.fromLibrary) {
    return { saved: false, reason: 'library' };
  }
  return null;
}

async function rememberWebProof(uri: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  const blob = await fetch(uri).then((response) => response.blob());
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(WEB_DB, 1);
    open.onerror = () => reject(open.error ?? new Error('indexedDB'));
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(WEB_STORE)) {
        open.result.createObjectStore(WEB_STORE);
      }
    };
    open.onsuccess = () => {
      const tx = open.result.transaction(WEB_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB'));
      tx.objectStore(WEB_STORE).put(blob, uri);
    };
  });
}

/** Write an in-app capture to the camera roll (native) or IndexedDB (web). Never blocks Send. */
export async function saveCapturedProofLocally(
  input: SaveCapturedProofInput,
): Promise<SaveCapturedProofResult> {
  const skip = shouldSkip(input);
  if (skip) {
    return skip;
  }
  const uri = input.uri!.trim();
  if (Platform.OS === 'web') {
    try {
      await rememberWebProof(uri);
      return { saved: true, reason: 'web' };
    } catch {
      return { saved: false, reason: 'failed' };
    }
  }
  try {
    const media = await import('expo-media-library');
    const current = await media.getPermissionsAsync(true);
    const permission = current.granted ? current : await media.requestPermissionsAsync(true);
    if (!permission.granted) {
      return { saved: false, reason: 'denied' };
    }
    await media.Asset.create(uri);
    return { saved: true };
  } catch {
    return { saved: false, reason: 'failed' };
  }
}
