const HOME_FEED_SCOPE = 'home';

/** Home social list. Never includes a circleId. */
export function homeFeedListKey(userId?: string | null) {
  return ['feed', HOME_FEED_SCOPE, userId] as const;
}

/** Members-only Circle Feed. Separate cache from Home. */
export function circleFeedListKey(circleId: string, userId?: string | null) {
  return ['feed', 'circle', circleId, userId] as const;
}

export function feedListKey(scope: string, userId?: string | null) {
  if (scope === 'global' || scope === HOME_FEED_SCOPE) {
    return homeFeedListKey(userId);
  }
  return ['feed', scope, userId] as const;
}

export function composerListKey(
  input: { circleId?: string | null; challengeId?: string | null },
  hookedChallengeId?: string | null,
  userId?: string | null,
) {
  const circleId = String(input.circleId ?? '').trim();
  if (circleId) {
    return circleFeedListKey(circleId, userId);
  }
  const id = String(input.challengeId ?? hookedChallengeId ?? '').trim();
  if (id) {
    return feedListKey(id, userId);
  }
  return homeFeedListKey(userId);
}

export function isHomeSocialFeedKey(queryKey: readonly unknown[]): boolean {
  return (
    queryKey[0] === 'feed' &&
    (queryKey[1] === HOME_FEED_SCOPE ||
      queryKey[1] === 'global' ||
      queryKey[1] === 'author' ||
      queryKey[1] === 'post')
  );
}

export { HOME_FEED_SCOPE };
