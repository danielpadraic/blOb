/** Full Postgrest / Error text for logs and the Home banner. Not the mascot line. */
export function rawFeedError(error: unknown): string {
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>;
    const nested = row.error && typeof row.error === 'object' ? (row.error as Record<string, unknown>) : null;
    const parts = [row.code, row.message, row.details, row.hint, nested?.code, nested?.message]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) {
      return [...new Set(parts)].join(' | ').slice(0, 500);
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }
  const text = String(error ?? '').trim();
  return text.slice(0, 500) || 'Feed failed';
}
