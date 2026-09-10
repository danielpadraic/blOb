const held = new Map<string, Blob>();

/** Keep the Safari capture Blob until the put lands or they leave /submit. */
export function holdCheckinBlob(uri?: string | null, blob?: Blob | null): void {
  if (!uri || !blob || blob.size < 1) {
    return;
  }
  held.set(uri, blob);
}

export function getHeldCheckinBlob(uri?: string | null): Blob | null {
  if (!uri) {
    return null;
  }
  return held.get(uri) ?? null;
}

export function releaseHeldCheckinBlobs(): void {
  const revoke = typeof URL !== 'undefined' ? URL.revokeObjectURL : null;
  if (typeof revoke === 'function') {
    for (const uri of held.keys()) {
      if (uri.startsWith('blob:')) {
        try {
          revoke(uri);
        } catch {
          // Already released.
        }
      }
    }
  }
  held.clear();
}
