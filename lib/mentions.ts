export type MentionChip = {
  userId: string;
  username: string;
  label: string;
};

export type MentionRecord = {
  userId: string;
  username: string;
  displayName?: string | null;
  available: boolean;
};

export type MentionDoc = {
  text: string;
  chips: MentionChip[];
};

export type MentionPart =
  | { type: 'text'; id: string; value: string }
  | { type: 'chip'; id: string; chip: MentionChip };

let partSeq = 0;

function nextId(prefix: string) {
  partSeq += 1;
  return `${prefix}-${partSeq}`;
}

export function emptyMentionParts(): MentionPart[] {
  return [{ type: 'text', id: nextId('t'), value: '' }];
}

export function serializeMentionParts(parts: MentionPart[]): MentionDoc {
  const chips: MentionChip[] = [];
  const seen = new Set<string>();
  let text = '';
  for (const part of parts) {
    if (part.type === 'text') {
      text += part.value;
      continue;
    }
    text += `@${part.chip.username}`;
    if (!seen.has(part.chip.userId)) {
      seen.add(part.chip.userId);
      chips.push(part.chip);
    }
  }
  return { text: text.trim(), chips };
}

export type TextSelection = {
  start: number;
  end: number;
};

export type MentionRange = {
  start: number;
  end: number;
  username: string;
};

export function mentionQueryFromText(value: string): string | null {
  return mentionQueryAtCursor(value, value.length)?.query ?? null;
}

export function mentionQueryAtCursor(
  text: string,
  cursor: number,
): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(^|[\s])@([A-Za-z0-9_]*)$/);
  if (!match) {
    return null;
  }
  const query = match[2] ?? '';
  return { query, start: before.length - query.length - 1 };
}

/** Insert `@username` + suffix and put the caret after the suffix. Replaces a live `@query`. */
export function insertMention(
  text: string,
  selection: TextSelection,
  username: string,
  options?: { suffix?: string },
): { text: string; selection: TextSelection } {
  const suffix = options?.suffix ?? ' ';
  const token = `@${username.replace(/^@/, '')}${suffix}`;
  const query = mentionQueryAtCursor(text, selection.start);
  if (query) {
    const next = `${text.slice(0, query.start)}${token}${text.slice(selection.end)}`;
    const caret = query.start + token.length;
    return { text: next, selection: { start: caret, end: caret } };
  }
  const next = `${text.slice(0, selection.start)}${token}${text.slice(selection.end)}`;
  const caret = selection.start + token.length;
  return { text: next, selection: { start: caret, end: caret } };
}

export function mentionTokenRanges(text: string, usernames: string[]): MentionRange[] {
  const unique = [...new Set(usernames.map((name) => name.replace(/^@/, '').toLowerCase()).filter(Boolean))];
  if (!text || unique.length === 0) {
    return [];
  }
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])(@(?:${unique.map(escapeRegExp).join('|')}))(?![A-Za-z0-9_])`,
    'gi',
  );
  const ranges: MentionRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const token = match[2] ?? '';
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    ranges.push({
      start,
      end: start + token.length,
      username: token.slice(1),
    });
  }
  return ranges;
}

export function snapSelectionOutOfToken(
  selection: TextSelection,
  tokens: MentionRange[],
): TextSelection {
  if (selection.start !== selection.end) {
    return selection;
  }
  const token = tokens.find((range) => selection.start > range.start && selection.start < range.end);
  if (!token) {
    return selection;
  }
  return { start: token.end, end: token.end };
}

export function applyTokenAwareTextChange(
  prev: string,
  next: string,
  selection: TextSelection,
  tokens: MentionRange[],
): { text: string; selection: TextSelection; forced: boolean } {
  if (next.length === prev.length - 1 && selection.start === selection.end) {
    const deletedAt = Math.max(0, selection.start - 1);
    const token =
      tokens.find((range) => deletedAt >= range.start && deletedAt < range.end) ??
      tokens.find((range) => selection.start === range.end);
    if (token) {
      return {
        text: `${prev.slice(0, token.start)}${prev.slice(token.end)}`,
        selection: { start: token.start, end: token.start },
        forced: true,
      };
    }
  }
  const delta = next.length - prev.length;
  const caret = Math.max(0, Math.min(next.length, selection.start + delta));
  return { text: next, selection: { start: caret, end: caret }, forced: false };
}

export function mentionDocFromState(text: string, chips: MentionChip[]): MentionDoc {
  const live = new Set(
    mentionTokenRanges(
      text,
      chips.map((chip) => chip.username),
    ).map((range) => range.username.toLowerCase()),
  );
  return {
    text,
    chips: chips.filter((chip) => live.has(chip.username.toLowerCase())),
  };
}

export function applyMentionPick(parts: MentionPart[], chip: MentionChip): MentionPart[] {
  const next = [...parts];
  const last = next[next.length - 1];
  if (!last || last.type !== 'text') {
    next.push({ type: 'chip', id: nextId('c'), chip });
    next.push({ type: 'text', id: nextId('t'), value: ' ' });
    return next;
  }
  const replaced = last.value.replace(/(^|[\s])@[A-Za-z0-9_]*$/, (full, lead: string) => `${lead}`);
  last.value = replaced;
  if (!last.value) {
    next.pop();
  }
  next.push({ type: 'chip', id: nextId('c'), chip });
  next.push({ type: 'text', id: nextId('t'), value: ' ' });
  return next;
}

export function backspaceMentionParts(parts: MentionPart[]): MentionPart[] {
  const next = [...parts];
  const last = next[next.length - 1];
  if (last?.type === 'text' && last.value.length > 0) {
    last.value = last.value.slice(0, -1);
    return next;
  }
  if (last?.type === 'text') {
    next.pop();
  }
  const chip = next[next.length - 1];
  if (chip?.type === 'chip') {
    next.pop();
  }
  if (next.length === 0 || next[next.length - 1]?.type !== 'text') {
    next.push({ type: 'text', id: nextId('t'), value: '' });
  }
  return next;
}

export function splitMentionedText(
  content: string,
  mentions: MentionRecord[],
): Array<{ type: 'text' | 'mention'; value: string; mention?: MentionRecord }> {
  if (!content) {
    return [];
  }
  const usable = mentions.filter((row) => row.username);
  if (usable.length === 0) {
    return [{ type: 'text', value: content }];
  }
  const pattern = new RegExp(
    `@(?:${usable.map((row) => escapeRegExp(row.username)).join('|')})\\b`,
    'gi',
  );
  const byName = new Map(usable.map((row) => [row.username.toLowerCase(), row]));
  const parts: Array<{ type: 'text' | 'mention'; value: string; mention?: MentionRecord }> = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push({ type: 'text', value: content.slice(cursor, start) });
    }
    const username = match[0].slice(1);
    const mention = byName.get(username.toLowerCase());
    parts.push({ type: 'mention', value: match[0], mention });
    cursor = start + match[0].length;
  }
  if (cursor < content.length) {
    parts.push({ type: 'text', value: content.slice(cursor) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
