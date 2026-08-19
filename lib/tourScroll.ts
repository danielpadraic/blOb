import { Platform, type ScrollView, type LayoutRectangle } from 'react-native';

import { TAB_BAR_PEEK, tabBarLift } from '@/lib/theme';

/** Tab chrome body under the status bar: logo row + padding. */
export const TAB_CHROME_BODY = 74;
export const TOUR_SCROLL_MS = 260;
export const TOUR_HOLE_PAD = 6;

export function createTourViewport(
  screenH: number,
  insets: { top: number; bottom: number },
) {
  const top = insets.top + TAB_CHROME_BODY;
  const bottom = screenH - tabBarLift(insets.bottom) - TAB_BAR_PEEK;
  return {
    top,
    bottom,
    center: (top + bottom) / 2,
    height: Math.max(bottom - top, 1),
  };
}

export function scrollViewToY(scroll: ScrollView, y: number, duration = TOUR_SCROLL_MS) {
  const next = Math.max(0, y);
  if (Platform.OS !== 'web') {
    scroll.scrollTo({ y: next, animated: true });
    return;
  }
  const node = webScroller(scroll);
  if (!node) {
    scroll.scrollTo({ y: next, animated: false });
    return;
  }
  const start = node.scrollTop;
  const delta = next - start;
  if (Math.abs(delta) < 1) {
    return;
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ease = (t: number) => 1 - (1 - t) ** 2;
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    node.scrollTop = start + delta * ease(t);
    if (t < 1) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

function webScroller(scroll: ScrollView): { scrollTop: number } | null {
  const anyScroll = scroll as unknown as {
    getScrollableNode?: () => unknown;
    getNativeScrollRef?: () => unknown;
  };
  for (const node of [anyScroll.getScrollableNode?.(), anyScroll.getNativeScrollRef?.()]) {
    if (node && typeof (node as { scrollTop?: number }).scrollTop === 'number') {
      return node as { scrollTop: number };
    }
  }
  return null;
}

export function scrollDeltaToCenter(
  rect: LayoutRectangle,
  viewport: { top: number; bottom: number; center: number },
) {
  let delta = rect.y + rect.height / 2 - viewport.center;
  const paddedTop = rect.y - TOUR_HOLE_PAD;
  const paddedBottom = rect.y + rect.height + TOUR_HOLE_PAD;
  if (paddedBottom - delta > viewport.bottom) {
    delta = paddedBottom - viewport.bottom;
  }
  if (paddedTop - delta < viewport.top) {
    delta = paddedTop - viewport.top;
  }
  return delta;
}
