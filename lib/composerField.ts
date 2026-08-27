export const COMPOSER_LINE_HEIGHT = 20;
export const COMPOSER_MIN_HEIGHT = 36;
/** ~8 lines; longer drafts scroll inside the field. */
export const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * 8 + 12;

export function composerFieldHeight(opts: {
  collapsed?: boolean;
  text?: string;
  contentHeight?: number;
}): number {
  if (opts.collapsed) {
    return COMPOSER_MIN_HEIGHT;
  }
  const lines = Math.max(1, String(opts.text ?? '').split('\n').length);
  const fromLines = lines * COMPOSER_LINE_HEIGHT + 12;
  const fromContent = opts.contentHeight != null ? Math.ceil(opts.contentHeight) : 0;
  return Math.min(
    COMPOSER_MAX_HEIGHT,
    Math.max(COMPOSER_MIN_HEIGHT, Math.max(fromLines, fromContent)),
  );
}
