/**
 * Home / profile / DM allow lists. Friends cache is FriendEdge[] (`['friends', userId]`).
 * Never call `.has` on the raw value — arrays have no `.has`.
 * FriendEdge → the other person, not the viewer, not the friendship row id.
 */
export function asIdSet(input: unknown, viewerId?: string | null): Set<string> {
  if (input instanceof Set) {
    return new Set(
      [...input].flatMap((row) => idsFromUnknown(row, viewerId)),
    );
  }
  if (isSetLike(input)) {
    return new Set(
      [...input].flatMap((row) => idsFromUnknown(row, viewerId)),
    );
  }
  if (!Array.isArray(input)) {
    return new Set();
  }
  const ids: string[] = [];
  for (const row of input) {
    ids.push(...idsFromUnknown(row, viewerId));
  }
  return new Set(ids);
}

function isSetLike(input: unknown): input is Iterable<unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }
  const rec = input as { has?: unknown };
  return typeof rec.has === 'function' && typeof (input as Iterable<unknown>)[Symbol.iterator] === 'function';
}

function idsFromUnknown(row: unknown, viewerId?: string | null): string[] {
  if (typeof row === 'string' && row) {
    return [row];
  }
  if (!row || typeof row !== 'object') {
    return [];
  }
  const rec = row as Record<string, unknown>;
  const userA = rec.user_a_id;
  const userB = rec.user_b_id;
  if (typeof userA === 'string' && userA && typeof userB === 'string' && userB) {
    const viewer = typeof viewerId === 'string' ? viewerId : '';
    if (viewer && (userA === viewer || userB === viewer)) {
      return [userA === viewer ? userB : userA];
    }
    return [userA, userB];
  }
  const nested =
    rec.profile && typeof rec.profile === 'object'
      ? (rec.profile as { id?: unknown }).id
      : undefined;
  const id =
    rec.id ??
    rec.user_id ??
    rec.friend_id ??
    rec.other_user_id ??
    rec.following_id ??
    rec.follower_id ??
    rec.blocked_id ??
    rec.author_id ??
    rec.post_id ??
    rec.muted_user_id ??
    rec.challenge_id ??
    rec.circle_id ??
    nested;
  return typeof id === 'string' && id ? [id] : [];
}
