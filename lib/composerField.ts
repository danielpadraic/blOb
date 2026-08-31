export const COMPOSER_LINE_HEIGHT = 20;
export const COMPOSER_MIN_HEIGHT = 36;
export const COMPOSER_MAX_LINES = 6;
/** ~6 lines; longer drafts scroll inside the field. */
export const COMPOSER_MAX_HEIGHT =
  COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + Math.max(0, COMPOSER_MIN_HEIGHT - COMPOSER_LINE_HEIGHT);

export const FORM_LINE_HEIGHT = 22;
export const FORM_MIN_HEIGHT = 52;
export const TITLE_MAX_LINES = 2;
/** ~32 glyphs per form row so wrapped body copy sizes on first paint. */
export const FORM_WRAP_CHARS = 32;
/** Description may fill this share of the form, then scroll inside the field. */
export const DESCRIPTION_FORM_RATIO = 0.4;

export function wrappedLineCount(text: string, charsPerLine = FORM_WRAP_CHARS): number {
  const width = Math.max(8, charsPerLine);
  return String(text)
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / width) || 1), 0);
}

/** Grow until ~40% of the form, then the field scrolls. */
export function descriptionGrowMaxLines(windowHeight: number): number {
  const formH = Math.max(240, windowHeight * 0.72);
  const pad = Math.max(0, FORM_MIN_HEIGHT - FORM_LINE_HEIGHT);
  return Math.max(6, Math.floor((formH * DESCRIPTION_FORM_RATIO - pad) / FORM_LINE_HEIGHT));
}

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
  const lines = wrappedLineCount(opts.text ?? '');
  const fromLines = lines * lineHeight + pad;
  const fromContent = opts.contentHeight != null ? Math.ceil(opts.contentHeight) : 0;
  return Math.min(maxHeight, Math.max(minHeight, Math.max(fromLines, fromContent)));
}
