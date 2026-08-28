export const COMPOSER_LINE_HEIGHT = 20;
export const COMPOSER_MIN_HEIGHT = 36;
export const COMPOSER_MAX_LINES = 6;
/** ~6 lines; longer drafts scroll inside the field. */
export const COMPOSER_MAX_HEIGHT =
  COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + Math.max(0, COMPOSER_MIN_HEIGHT - COMPOSER_LINE_HEIGHT);

export const FORM_LINE_HEIGHT = 22;
export const FORM_MIN_HEIGHT = 52;
export const TITLE_MAX_LINES = 2;

export function composerFieldHeight(opts: {
  collapsed?: boolean;
  text?: string;
  contentHeight?: number;
  minHeight?: number;
  maxLines?: number;
  lineHeight?: number;
}): number {
  const minHeight = opts.minHeight ?? COMPOSER_MIN_HEIGHT;
  const lineHeight = opts.lineHeight ?? COMPOSER_LINE_HEIGHT;
  const maxLines = opts.maxLines ?? COMPOSER_MAX_LINES;
  const pad = Math.max(0, minHeight - lineHeight);
  const maxHeight = lineHeight * maxLines + pad;
  if (opts.collapsed) {
    return minHeight;
  }
  const lines = Math.max(1, String(opts.text ?? '').split('\n').length);
  const fromLines = lines * lineHeight + pad;
  const fromContent = opts.contentHeight != null ? Math.ceil(opts.contentHeight) : 0;
  return Math.min(maxHeight, Math.max(minHeight, Math.max(fromLines, fromContent)));
}
