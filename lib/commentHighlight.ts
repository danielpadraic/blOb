import { Dimensions, Platform, type View } from 'react-native';

import { isLiveComment } from '@/lib/commentEdit';

export const COMMENT_HIGHLIGHT_MS = 1600;
export const COMMENT_UNAVAILABLE = 'That comment isn’t available.';

export function liveCommentRowId(commentId: string): string {
  return `comment:${commentId}`;
}

export function findCommentById<T extends { id: string }>(
  comments: T[] | null | undefined,
  commentId?: string | null,
): T | null {
  const id = String(commentId ?? '').trim();
  if (!id) {
    return null;
  }
  return comments?.find((row) => row.id === id) ?? null;
}

/** True once this post’s comments have been fetched — empty is a real empty thread. */
export function commentsHaveResolved(
  comments: unknown,
  ready?: boolean,
): boolean {
  if (ready === false) {
    return false;
  }
  if (ready === true) {
    return true;
  }
  return Array.isArray(comments);
}

export function commentTargetMissing(
  comments: Array<{ id: string; deleted_at?: string | null }> | null | undefined,
  commentId?: string | null,
  ready?: boolean,
): boolean {
  const id = String(commentId ?? '').trim();
  if (!id || !commentsHaveResolved(comments, ready)) {
    return false;
  }
  const found = findCommentById(comments, id);
  return !found || !isLiveComment(found);
}

export function commentScrollDelta(input: {
  y: number;
  height: number;
  windowHeight: number;
  topSafe?: number;
  bottomSafe?: number;
}): number {
  const topSafe = input.topSafe ?? 88;
  const bottomSafe = input.bottomSafe ?? Math.max(120, input.windowHeight - 220);
  if (!Number.isFinite(input.y) || !Number.isFinite(input.height)) {
    return 0;
  }
  if (input.y < topSafe) {
    return input.y - topSafe;
  }
  const bottom = input.y + input.height;
  if (bottom > bottomSafe) {
    return bottom - bottomSafe;
  }
  return 0;
}

type ScrollHost = {
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
  scrollTo?: (opts: { y: number; animated?: boolean }) => void;
};

export function scrollCommentNodeIntoView(
  node: View | null | undefined,
  host?: ScrollHost | null,
  scrollY = 0,
  extras?: { topSafe?: number; bottomSafe?: number },
): void {
  if (!node) {
    return;
  }
  if (Platform.OS === 'web') {
    const el = node as unknown as {
      scrollIntoView?: (opts?: { block?: string; behavior?: string }) => void;
    };
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return;
  }
  node.measureInWindow((_x, y, _w, h) => {
    const delta = commentScrollDelta({
      y,
      height: h,
      windowHeight: Dimensions.get('window').height,
      topSafe: extras?.topSafe,
      bottomSafe: extras?.bottomSafe,
    });
    if (!delta || !host) {
      return;
    }
    const next = Math.max(0, scrollY + delta);
    if (host.scrollToOffset) {
      host.scrollToOffset({ offset: next, animated: true });
      return;
    }
    host.scrollTo?.({ y: next, animated: true });
  });
}
