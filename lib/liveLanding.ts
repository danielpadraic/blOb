/**
 * Live lands on the newest row once per visit. A visit starts every time Live is focused: first
 * open, back from Overview / Home / another challenge, and back from the background. Stats / media /
 * reaction patches inside a visit must not re-scroll or remount the list. No mid-scroll offset is
 * ever saved or restored.
 */

const didInitialScroll = new Set<string>();
const sentCheckinThisVisit = new Map<string, string>();

/** Viewport must be a real Live pane, not the height-0 Overview hide. */
export const LIVE_VIEWPORT_READY_MIN = 80;

/**
 * One-shot land on the newest row for this visit. `alreadyLanded` means this visit already landed
 * (cleared by `beginLiveVisit`), so patches, remounts, and date chips cannot call it again.
 */
export function shouldLandLiveLatest(input: {
  focused: boolean;
  hasRows: boolean;
  viewportReady: boolean;
  alreadyLanded: boolean;
}): boolean {
  return (
    Boolean(input.focused) &&
    Boolean(input.hasRows) &&
    Boolean(input.viewportReady) &&
    !input.alreadyLanded
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
}

/**
 * Live was just focused: forget that this challenge already landed so the next land runs. Keeps a
 * just-sent check-in, which still wins the opening target.
 */
export function beginLiveVisit(challengeId?: string | null): void {
  const id = challengeKey(challengeId);
  if (id) {
    didInitialScroll.delete(id);
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
