/**
 * blocked_peer_ids() returns `setof uuid`, which PostgREST sends as bare
 * strings. Tolerate a single-column row shape too, so a future view or a
 * changed return type does not silently empty the block list.
 */
export function readBlockedPeerRows(data: unknown): string[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((row) => {
      if (typeof row === 'string') {
        return row.trim();
      }
      if (row && typeof row === 'object') {
        const first = Object.values(row as Record<string, unknown>).find(
          (value) => typeof value === 'string' && value.trim().length > 0,
        );
        return typeof first === 'string' ? first.trim() : '';
      }
      return '';
    })
    .filter((id): id is string => Boolean(id));
}
