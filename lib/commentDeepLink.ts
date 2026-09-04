/** Append comments=1 + commentId without sending anyone to Check In submit. */
export function withCommentQuery(href: string, commentId?: string | null): string {
  const raw = String(href ?? '').trim();
  if (!raw) {
    return raw;
  }
  if (/\/submit(?:\?|$)/.test(raw)) {
    return raw;
  }
  const id = String(commentId ?? '').trim();
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const qIndex = base.indexOf('?');
  const path = qIndex >= 0 ? base.slice(0, qIndex) : base;
  const qs = new URLSearchParams(qIndex >= 0 ? base.slice(qIndex + 1) : '');
  qs.set('comments', '1');
  if (id) {
    qs.set('commentId', id);
  }
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ''}${hash}`;
}

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = String(raw ?? '').trim();
  return id || undefined;
}
