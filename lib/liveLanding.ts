/**
 * Live lands once per challenge visit. Stats / media / reaction patches must not
 * re-scroll or remount the list.
 */

const didInitialScroll = new Set<string>();
const sentCheckinThisVisit = new Map<string, string>();

function challengeKey(challengeId?: string | null): string {
  return String(challengeId ?? '').trim();
}

function postKey(postId?: string | null): string {
  return String(postId ?? '').trim();
}

/** First focused paint of this challenge’s Live already chose a row. */
export function hasLiveInitialScroll(challengeId?: string | null): boolean {
  const id = challengeKey(challengeId);
  return Boolean(id && didInitialScroll.has(id));
}

export function markLiveInitialScroll(challengeId?: string | null): void {
  const id = challengeKey(challengeId);
  if (id) {
    didInitialScroll.add(id);
  }
}

/** Clear only when leaving that challenge — not on a stats patch. */
export function clearLiveInitialScroll(challengeId?: string | null): void {
  const id = challengeKey(challengeId);
  if (!id) {
    return;
  }
  didInitialScroll.delete(id);
  sentCheckinThisVisit.delete(id);
}

/** Remember the check-in we just Sent so Live can land on that row this visit. */
export function rememberSentLiveCheckin(challengeId?: string | null, postId?: string | null): void {
  const id = challengeKey(challengeId);
  const post = postKey(postId);
  if (id && post) {
    sentCheckinThisVisit.set(id, post);
  }
}

export function peekSentLiveCheckin(challengeId?: string | null): string | null {
  const id = challengeKey(challengeId);
  return id ? (sentCheckinThisVisit.get(id) ?? null) : null;
}

/** Consume the just-sent post id after the opening scroll. */
export function takeSentLiveCheckin(challengeId?: string | null): string | null {
  const id = challengeKey(challengeId);
  if (!id) {
    return null;
  }
  const post = sentCheckinThisVisit.get(id) ?? null;
  sentCheckinThisVisit.delete(id);
  return post;
}

export function resetLiveLandingForTests(): void {
  didInitialScroll.clear();
  sentCheckinThisVisit.clear();
}

export type LiveLandingTarget = {
  commentId?: string | null;
  postId?: string | null;
  sentPostId?: string | null;
};

/**
 * Opening target for one visit: comment alert, then the check-in we just Sent,
 * then the newest row.
 */
export function liveLandingFocus(input: LiveLandingTarget): {
  commentId: string | null;
  postId: string | null;
  latest: boolean;
} {
  const commentId = postKey(input.commentId);
  if (commentId) {
    return { commentId, postId: null, latest: false };
  }
  const postId = postKey(input.postId) || postKey(input.sentPostId);
  if (postId) {
    return { commentId: null, postId, latest: false };
  }
  return { commentId: null, postId: null, latest: true };
}
