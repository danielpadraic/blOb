import { Platform } from 'react-native';

import { measureInWindowSafe } from '@/lib/measureWindow';

/** Cap so a tall TourAnchor (Task + proofs) cannot pull Privacy into view. */
export const CREATE_FIELD_ALIGN_MAX = 140;
const FOOTER_GAP = 16;

/**
 * Keep the focused create field just above the sticky footer.
 * Prefer `footerTop` (footer `measureInWindow` Y). Do not also add keyboard
 * overlap — Simple/Advanced already lift the form (`marginBottom`), and on web
 * `window` height is often the visual viewport. Counting both scrolls Task
 * into Privacy / Corporate.
 * Do not also pad the footer or scroll content (`createStickyFooterPad` /
 * `createScrollBottomPad`).
 */
export function createFieldScrollDelta(args: {
  fieldY: number;
  fieldH: number;
  windowH: number;
  footerH: number;
  keyboardOverlap?: number;
  footerTop?: number | null;
  topGuard?: number;
}): number {
  const alignH = Math.min(Math.max(0, args.fieldH), CREATE_FIELD_ALIGN_MAX);
  const hasFooterTop = args.footerTop != null && Number.isFinite(args.footerTop);
  const visibleBottom = hasFooterTop
    ? (args.footerTop as number) - FOOTER_GAP
    : args.windowH -
      Math.max(0, args.footerH) -
      Math.max(0, args.keyboardOverlap ?? 0) -
      FOOTER_GAP;
  const fieldBottom = args.fieldY + alignH;
  const topGuard = args.topGuard ?? 24;
  if (fieldBottom > visibleBottom) {
    return fieldBottom - visibleBottom;
  }
  if (args.fieldY < topGuard) {
    return args.fieldY - topGuard;
  }
  return 0;
}

/** Web: stop the UA from anchoring scroll to a later section (Privacy). */
export const CREATE_SCROLL_OVERFLOW_ANCHOR =
  Platform.OS === 'web' ? ({ overflowAnchor: 'none' } as const) : null;

export function applyCreateFieldScroll(opts: {
  field: unknown;
  footer?: unknown;
  windowH: number;
  footerH: number;
  scrollY: number;
  /** Used only when the footer cannot be measured. */
  keyboardOverlap?: number;
  /** Android KeyboardFormShell: footer is not lifted, so clamp to the keys. */
  clampFooterToKeyboard?: boolean;
  scrollTo: (y: number) => void;
}): void {
  const measured = measureInWindowSafe(opts.field, (rect) => {
    if (rect.y == null || Number.isNaN(rect.y)) {
      return;
    }
    const finish = (footerTop: number | null) => {
      const overlap = Math.max(0, opts.keyboardOverlap ?? 0);
      let top = footerTop;
      if (opts.clampFooterToKeyboard && top != null && overlap > 8) {
        top = Math.min(top, opts.windowH - overlap);
      }
      const delta = createFieldScrollDelta({
        fieldY: rect.y,
        fieldH: rect.height,
        windowH: opts.windowH,
        footerH: opts.footerH,
        footerTop: top,
        keyboardOverlap: top == null ? overlap : 0,
      });
      if (delta !== 0) {
        opts.scrollTo(Math.max(0, opts.scrollY + delta));
      }
    };
    const footerOk = measureInWindowSafe(opts.footer, (footer) => {
      finish(Number.isFinite(footer.y) ? footer.y : null);
    });
    if (!footerOk) {
      finish(null);
    }
  });
  if (!measured) {
    return;
  }
}

export function scheduleCreateFieldScroll(run: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(run, Platform.OS === 'android' ? 80 : 40);
  });
}
