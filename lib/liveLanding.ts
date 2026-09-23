/**
 * Live lands once per challenge visit. Stats / media / reaction patches must not
 * re-scroll or remount the list.
 */

const didInitialScroll = new Set<string>();
const sentCheckinThisVisit = new Map<string, string>();
/** Mid-thread offset from THIS session’s background only. Never a prior visit. */
const midScrollByChallenge = new Map<string, number>();

/** Viewport must be a real Live pane, not the height-0 Overview hide. */
export const LIVE_VIEWPORT_READY_MIN = 80;

/**
 * One-shot land on the newest row. Patches, remounts, and date chips must not
 * call this again after `alreadyLanded`.
 */
export function shouldLandLiveLatest(input: {
  focused: boolean;
  hasRows: boolean;
  viewportReady: boolean;
  alreadyLanded: boolean;
  restoringMidScroll: boolean;
}): boolean {
  return (
    Boolean(input.focused) &&
    Boolean(input.hasRows) &&
    Boolean(input.viewportReady) &&
    !input.alreadyLanded &&
    !input.restoringMidScroll
  );
}

function challengeKey(challengeId?: string | null): string {
  return String(challengeId ?? '').trim();
}

function postKey(postId?: string | null): string {
  return String(postId ?? '').trim();
}

/** One line when Live scrolls without a finger, wheel, or trackpad drag. */
export function logLiveAutoScroll(input: {
  reason: string;
  rowId?: string | null;
  willScroll: boolean;
  itemCount: number;
}): void {
  console.log('[blob:live]', {
    reason: input.reason,
    rowId: input.rowId ?? null,
    willScroll: input.willScroll,
    itemCount: input.itemCount,
  });
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

/** Clear when leaving Live (Overview / Home / another challenge) — not on a stats patch. */
export function clearLiveInitialScroll(challengeId?: string | null): void {
  const id = challengeKey(challengeId);
  if (!id) {
    return;
  }
  didInitialScroll.delete(id);
  sentCheckinThisVisit.delete(id);
  midScrollByChallenge.delete(id);
}

export function saveLiveMidScroll(challengeId?: string | null, offsetY?: number): void {
  const id = challengeKey(challengeId);
  if (!id || !Number.isFinite(offsetY) || (offsetY ?? 0) <= 8) {
    return;
  }
  midScrollByChallenge.set(id, offsetY as number);
}

export function peekLiveMidScroll(challengeId?: string | null): number | null {
  const id = challengeKey(challengeId);
  if (!id) {
    return null;
  }
  const offset = midScrollByChallenge.get(id);
  return Number.isFinite(offset) ? (offset as number) : null;
}

export function takeLiveMidScroll(challengeId?: string | null): number | null {
  const id = challengeKey(challengeId);
  if (!id) {
    return null;
  }
  const offset = peekLiveMidScroll(id);
  midScrollByChallenge.delete(id);
  return offset;
}

export function clearLiveMidScroll(challengeId?: string | null): void {
  const id = challengeKey(challengeId);
  if (id) {
    midScrollByChallenge.delete(id);
  }
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
  midScrollByChallenge.clear();
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
