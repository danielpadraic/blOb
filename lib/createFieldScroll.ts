/** Cap so a tall TourAnchor (Task + proofs) cannot pull Privacy into view. */
export const CREATE_FIELD_ALIGN_MAX = 140;

/**
 * Keep the focused create field just above the sticky footer.
 * Keyboard overlap belongs in window coordinates; do not also pad the footer
 * or scroll content (`createStickyFooterPad` / `createScrollBottomPad`).
 */
export function createFieldScrollDelta(args: {
  fieldY: number;
  fieldH: number;
  windowH: number;
  footerH: number;
  keyboardOverlap: number;
  topGuard?: number;
}): number {
  const alignH = Math.min(Math.max(0, args.fieldH), CREATE_FIELD_ALIGN_MAX);
  const reserved = Math.max(0, args.footerH) + Math.max(0, args.keyboardOverlap) + 16;
  const visibleBottom = args.windowH - reserved;
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
