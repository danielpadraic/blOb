import { healthProofFingerprint, proofObjectKey } from '@/lib/proofUniqueness';

async function sha256Text(value: string): Promise<string | null> {
  try {
    const crypto = await import('expo-crypto');
    return crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, value);
  } catch {
    return null;
  }
}

async function bytesFromBlob(blob: Blob): Promise<string | null> {
  try {
    if (typeof blob.arrayBuffer === 'function') {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let bin = '';
      for (const byte of bytes) {
        bin += String.fromCharCode(byte);
      }
      return btoa(bin);
    }
  } catch {
    // Fall through to object-key identity.
  }
  return null;
}

async function bytesFromUri(uri: string): Promise<string | null> {
  if (!uri || uri.startsWith('http') || uri.startsWith('health:')) {
    return null;
  }
  try {
    const fs = await import('expo-file-system');
    if (typeof fs.File !== 'function') {
      return bytesFromFetch(uri);
    }
    const file = new fs.File(uri);
    if (typeof file.base64 === 'function') {
      const encoded = await file.base64();
      return encoded || null;
    }
  } catch {
    // Fall through to fetch for blob:/web preview URIs.
  }
  return bytesFromFetch(uri);
}

async function bytesFromFetch(uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (const byte of bytes) {
      bin += String.fromCharCode(byte);
    }
    return btoa(bin);
  } catch {
    return null;
  }
}

/** SHA-256 of file bytes when we have them; else storage object / Health id. Never throws. */
export async function hashCheckinProof(input: {
  uri?: string | null;
  blob?: Blob | null;
  url?: string | null;
  healthWorkoutId?: string | null;
}): Promise<string> {
  const health = healthProofFingerprint(input.healthWorkoutId);
  if (health) {
    return health;
  }
  try {
    const fromBlob = input.blob ? await bytesFromBlob(input.blob) : null;
    if (fromBlob) {
      return (await sha256Text(fromBlob)) || `object:${proofObjectKey(input.url ?? input.uri)}`;
    }
    const fromFile = await bytesFromUri(String(input.uri ?? ''));
    if (fromFile) {
      return (await sha256Text(fromFile)) || `object:${proofObjectKey(input.url ?? input.uri)}`;
    }
  } catch {
    // Object key still locks same-file reuse of a stored URL.
  }
  const objectKey = proofObjectKey(input.url ?? input.uri);
  return objectKey ? `object:${objectKey}` : '';
}
