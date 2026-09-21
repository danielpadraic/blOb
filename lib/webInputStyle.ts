const WEB_INPUT_STYLE_KEYS = new Set([
  'minHeight',
  'maxHeight',
  'height',
  'width',
  'minWidth',
  'maxWidth',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'color',
  'backgroundColor',
  'border',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'borderStyle',
  'borderTopWidth',
  'borderTopColor',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'overflow',
  'overflowX',
  'overflowY',
  'overflowAnchor',
  'resize',
  'fieldSizing',
  'caretColor',
  'outline',
  'boxSizing',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
  'textAlign',
  'opacity',
  'display',
  'boxShadow',
]);

function isIndexedStyleKey(key: string): boolean {
  return key === 'length' || /^\d+$/.test(key);
}

function writeCss(out: Record<string, unknown>, key: string, value: unknown) {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') {
    return;
  }
  if (key === 'paddingHorizontal') {
    out.paddingLeft = value;
    out.paddingRight = value;
    return;
  }
  if (key === 'paddingVertical') {
    out.paddingTop = value;
    out.paddingBottom = value;
    return;
  }
  if (key === 'marginHorizontal') {
    out.marginLeft = value;
    out.marginRight = value;
    return;
  }
  if (key === 'marginVertical') {
    out.marginTop = value;
    out.marginBottom = value;
    return;
  }
  out[key] = value;
}

/**
 * Flatten RN style arrays to one DOM-safe object.
 * Never copies "0" / "1" / "length" — WebKit throws
 * "Cannot set indexed properties on this object".
 */
export function flattenWebInputStyle(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  function walk(node: unknown): void {
    if (node == null || node === false) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    for (const key of Object.keys(node)) {
      if (isIndexedStyleKey(key)) {
        continue;
      }
      const value = (node as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        walk(value);
        continue;
      }
      if (!WEB_INPUT_STYLE_KEYS.has(key)) {
        continue;
      }
      writeCss(out, key, value);
    }
  }

  walk(style);
  return out;
}

export function webInputStyleKeysAreSafe(style: Record<string, unknown>): boolean {
  return Object.keys(style).every((key) => !isIndexedStyleKey(key));
}
