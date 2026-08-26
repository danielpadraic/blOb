let seq = 0;

/** Stable new ids. Reuse `existing` so hydrate / clone / autosave never remount inputs. */
export function nextCreateItemId(prefix: string, existing?: string | null): string {
  if (typeof existing === 'string' && existing.trim()) {
    return existing.trim();
  }
  seq += 1;
  return `${prefix}-${seq}`;
}
