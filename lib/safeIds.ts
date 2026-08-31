/** Missing author / user after publish or check-in must not throw. */
export function safeUserId(
  ...candidates: Array<{ id?: string | null } | string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const id = candidate.trim();
      if (id) {
        return id;
      }
      continue;
    }
    const id = candidate?.id?.trim();
    if (id) {
      return id;
    }
  }
  return null;
}

export function authorLabel(
  author?: { display_name?: string | null; username?: string | null } | null,
): string {
  return author?.display_name?.trim() || author?.username?.trim() || 'Someone';
}
