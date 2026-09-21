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
  /** Cache copy written before Photos. Attach / persist this so Camera tmp can die. */
  copiedUri?: string;
  reason?: 'library' | 'empty' | 'health' | 'remote' | 'denied' | 'web' | 'failed' | 'duplicate';
};

type SaveListener = (result: SaveCaptureResult) => void;

const savedUris = new Set<string>();
const pendingUris = new Set<string>();
const lastResults = new Map<string, SaveCaptureResult>();
const listeners = new Set<SaveListener>();

export function watchSaveCapture(listener: SaveListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function remember(result: SaveCaptureResult) {
  if (result.uri) {
    lastResults.set(result.uri, result);
  }
  if (result.copiedUri) {
    lastResults.set(result.copiedUri, result);
  }
}

function emit(result: SaveCaptureResult) {
  remember(result);
  for (const listener of listeners) {
    listener(result);
  }
}

export function lastSaveCapture(uri?: string | null): SaveCaptureResult | null {
  const key = uri?.trim() ?? '';
  if (!key) {
    return null;
  }
  return lastResults.get(key) ?? null;
}

export function resetSaveCaptureForTests() {
  savedUris.clear();
  pendingUris.clear();
  lastResults.clear();
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
  const copied = await copyCaptureForLibrary(input);
  const toSave = copied ?? uri;
  try {
    const media = await import('expo-media-library');
    const permission = await media.requestPermissionsAsync(true);
    if (!permission.granted) {
      pendingUris.delete(uri);
      const result: SaveCaptureResult = { saved: false, uri, copiedUri: copied ?? undefined, reason: 'denied' };
      emit(result);
      return result;
    }
    await media.saveToLibraryAsync(toSave);
    pendingUris.delete(uri);
    markSaved(uri);
    if (copied) {
      markSaved(copied);
    }
    const result: SaveCaptureResult = { saved: true, uri, copiedUri: copied ?? undefined };
    emit(result);
    return result;
  } catch {
    pendingUris.delete(uri);
    const result: SaveCaptureResult = { saved: false, uri, copiedUri: copied ?? undefined, reason: 'failed' };
    emit(result);
    return result;
  }
}

/** Copy Camera tmp → cacheDirectory blob-save-{ts}.jpg or .mov before Photos. */
export async function copyCaptureForLibrary(input: SaveCaptureInput): Promise<string | null> {
  const uri = input.uri?.trim() ?? '';
  if (!uri) {
    return null;
  }
  try {
    const { cacheDirectory, copyAsync } = await import('expo-file-system/legacy');
    if (!cacheDirectory) {
      return null;
    }
    const ext =
      input.mediaType === 'video' ? (input.mimeType?.includes('mp4') ? 'mp4' : 'mov') : 'jpg';
    const dest = `${cacheDirectory}blob-save-${Date.now()}.${ext}`;
    await copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return null;
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
    if (!blob) {
      return { ran: false };
    }
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
