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

export function mentionQueryFromText(value: string): string | null {
  const match = value.match(/(^|[\s])@([A-Za-z0-9_]*)$/);
  if (!match) {
    return null;
  }
  return match[2] ?? '';
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
