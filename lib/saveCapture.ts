import { Platform } from 'react-native';

export const SAVE_CAPTURE_DENIED = 'Couldn’t save to Photos.';
export const SAVE_CAPTURE_WEB = 'Save to Photos';

export type SaveCaptureInput = {
  uri?: string | null;
  blob?: Blob | null;
  mimeType?: string | null;
  mediaType?: 'image' | 'video';
  fromLibrary?: boolean;
};

export type SaveCaptureResult = {
  saved: boolean;
  uri?: string;
  reason?: 'library' | 'empty' | 'health' | 'remote' | 'denied' | 'web' | 'failed' | 'duplicate';
};

type SaveListener = (result: SaveCaptureResult) => void;

const savedUris = new Set<string>();
const pendingUris = new Set<string>();
const listeners = new Set<SaveListener>();

export function watchSaveCapture(listener: SaveListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(result: SaveCaptureResult) {
  for (const listener of listeners) {
    listener(result);
  }
}

export function resetSaveCaptureForTests() {
  savedUris.clear();
  pendingUris.clear();
}

/** Skip gallery picks, Health tokens, and other people’s remote files. */
export function classifySaveCapture(input: SaveCaptureInput): SaveCaptureResult | null {
  const uri = input.uri?.trim() ?? '';
  if (!uri) {
    return { saved: false, reason: 'empty' };
  }
  if (input.fromLibrary) {
    return { saved: false, uri, reason: 'library' };
  }
  if (uri.startsWith('health:')) {
    return { saved: false, uri, reason: 'health' };
  }
  if (/^https?:\/\//i.test(uri)) {
    return { saved: false, uri, reason: 'remote' };
  }
  if (savedUris.has(uri) || pendingUris.has(uri)) {
    return { saved: false, uri, reason: 'duplicate' };
  }
  return null;
}

function markSaved(uri: string) {
  savedUris.add(uri);
}

/** Write an onboard capture to Photos. Never throws. Never blocks Publish. */
export async function saveOwnCapture(input: SaveCaptureInput): Promise<SaveCaptureResult> {
  const skip = classifySaveCapture(input);
  if (skip) {
    emit(skip);
    return skip;
  }
  const uri = input.uri!.trim();
  if (Platform.OS === 'web') {
    const result: SaveCaptureResult = { saved: false, uri, reason: 'web' };
    emit(result);
    return result;
  }
  pendingUris.add(uri);
  try {
    const media = await import('expo-media-library');
    const current = await media.getPermissionsAsync(true);
    const permission = current.granted ? current : await media.requestPermissionsAsync(true);
    if (!permission.granted) {
      pendingUris.delete(uri);
      const result: SaveCaptureResult = { saved: false, uri, reason: 'denied' };
      emit(result);
      return result;
    }
    await media.saveToLibraryAsync(uri);
    pendingUris.delete(uri);
    markSaved(uri);
    const result: SaveCaptureResult = { saved: true, uri };
    emit(result);
    return result;
  } catch {
    pendingUris.delete(uri);
    const result: SaveCaptureResult = { saved: false, uri, reason: 'failed' };
    emit(result);
    return result;
  }
}

function filenameFor(input: SaveCaptureInput): string {
  if (input.mediaType === 'video') {
    return input.mimeType?.includes('mp4') ? 'blob-clip.mp4' : 'blob-clip.webm';
  }
  return 'blob-photo.jpg';
}

/** Web-only: share or download the capture. Returns whether the OS sheet/download actually ran. */
export async function offerWebSaveCapture(input: SaveCaptureInput): Promise<{ ran: boolean }> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return { ran: false };
  }
  const uri = input.uri?.trim() ?? '';
  if (!uri || input.fromLibrary || uri.startsWith('health:') || /^https?:\/\//i.test(uri)) {
    return { ran: false };
  }
  try {
    const blob =
      input.blob ??
      (await fetch(uri).then((response) => {
        if (!response.ok) {
          throw new Error('fetch');
        }
        return response.blob();
      }));
    const name = filenameFor(input);
    const type = input.mimeType || blob.type || (input.mediaType === 'video' ? 'video/webm' : 'image/jpeg');
    const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (file && nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file] });
      markSaved(uri);
      return { ran: true };
    }
    const href = uri.startsWith('blob:') ? uri : URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (href !== uri) {
      URL.revokeObjectURL(href);
    }
    markSaved(uri);
    return { ran: true };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError') {
      return { ran: false };
    }
    return { ran: false };
  }
}
