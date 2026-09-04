export type MentionKind = 'user' | 'challenge' | 'circle';

export type MentionChip = {
  userId: string;
  username: string;
  label: string;
  visibleName?: string;
  kind?: MentionKind;
};

export type MentionRecord = {
  userId: string;
  username: string;
  displayName?: string | null;
  available: boolean;
  kind?: MentionKind;
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

export function mentionVisibleLabel(chip: MentionChip): string {
  const visible = chip.visibleName?.trim() || chip.label.trim();
  return visible || chip.username.replace(/^@/, '');
}

export function mentionInsertLabel(chip: MentionChip): string {
  return chip.label.trim() || chip.username.replace(/^@/, '');
}

export function mentionChipFromAuthor(
  author?: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
  } | null,
  userId?: string | null,
): MentionChip | null {
  const id = String(userId ?? author?.id ?? '').trim();
  if (!id) {
    return null;
  }
  const username = author?.username?.trim() ?? '';
  const label = author?.display_name?.trim() || username || 'blob';
  return {
    userId: id,
    username: username || id,
    label,
  };
}

export function mentionRecordsFromChips(chips?: MentionChip[] | null): MentionRecord[] {
  return (chips ?? [])
    .filter((chip) => chip.userId && (chip.kind ?? 'user') === 'user')
    .map((chip) => ({
      userId: chip.userId,
      username: chip.username,
      displayName: chip.label,
      available: true,
      kind: chip.kind ?? 'user',
    }));
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
    text += `@${mentionVisibleLabel(part.chip)}`;
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
  userId?: string;
};

export function mentionRangeKey(range: MentionRange): string {
  return `${range.start}:${range.userId ?? range.username}`;
}

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

/** Insert `@Profile Name` + suffix and put the caret after the suffix. Replaces a live `@query`. */
export function insertMention(
  text: string,
  selection: TextSelection,
  label: string,
  options?: { suffix?: string },
): { text: string; selection: TextSelection } {
  const suffix = options?.suffix ?? '';
  const token = `@${label.replace(/^@/, '').trim()}${suffix}`;
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

function tokenBodies(tokens: Array<MentionChip | string>): { label: string; userId?: string }[] {
  const rows: { label: string; userId?: string }[] = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      rows.push({ label: token.replace(/^@/, '').trim() });
      continue;
    }
    rows.push({ label: mentionVisibleLabel(token), userId: token.userId });
    const username = token.username.replace(/^@/, '').trim();
    if (username && username.toLowerCase() !== mentionVisibleLabel(token).toLowerCase()) {
      rows.push({ label: username, userId: token.userId });
    }
  }
  return rows.filter((row) => row.label.length > 0).sort((a, b) => b.label.length - a.label.length);
}

function tokenIndexAt(text: string, token: string, from: number): number {
  let start = from;
  while (start <= text.length) {
    const index = text.indexOf(token, start);
    if (index < 0) {
      return -1;
    }
    const beforeOk = index === 0 || /[^A-Za-z0-9_]/.test(text[index - 1] ?? '');
    const after = index + token.length;
    const afterOk = after >= text.length || /[^A-Za-z0-9]/.test(text[after] ?? '');
    if (beforeOk && afterOk) {
      return index;
    }
    start = index + 1;
  }
  return -1;
}

export function mentionTokenRanges(
  text: string,
  tokens: Array<MentionChip | string>,
): MentionRange[] {
  const unique = tokenBodies(tokens);
  if (!text || unique.length === 0) {
    return [];
  }
  const ranges: MentionRange[] = [];
  const used = new Set<number>();
  for (const row of unique) {
    const token = `@${row.label}`;
    let from = 0;
    while (from <= text.length) {
      const start = tokenIndexAt(text, token, from);
      if (start < 0) {
        break;
      }
      if (!used.has(start)) {
        used.add(start);
        ranges.push({
          start,
          end: start + token.length,
          username: row.label,
          userId: row.userId,
        });
        break;
      }
      from = start + 1;
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
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

export function shortenMentionLabel(label: string): string | null {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return null;
  }
  return words.slice(0, -1).join(' ');
}

export function applyTokenAwareTextChange(
  prev: string,
  next: string,
  selection: TextSelection,
  chips: MentionChip[],
  punctReadyIds: string[] = [],
): {
  text: string;
  selection: TextSelection;
  chips: MentionChip[];
  punctReadyIds: string[];
  forced: boolean;
} {
  const tokens = mentionTokenRanges(prev, chips);
  if (next.length === prev.length - 1 && selection.start === selection.end) {
    const deletedAt = Math.max(0, selection.start - 1);
    const token =
      tokens.find((range) => deletedAt >= range.start && deletedAt < range.end) ??
      tokens.find((range) => selection.start === range.end);
    if (token) {
      const key = mentionRangeKey(token);
      const chip = chips.find((row) => row.userId === token.userId) ?? null;
      if (!punctReadyIds.includes(key)) {
        return {
          text: prev,
          selection: { start: token.end, end: token.end },
          chips,
          punctReadyIds: [...punctReadyIds, key],
          forced: true,
        };
      }
      const currentLabel = chip ? mentionVisibleLabel(chip) : token.username;
      const shortened = shortenMentionLabel(currentLabel);
      if (shortened && chip) {
        const nextChips = chips.map((row) =>
          row.userId === chip.userId ? { ...row, visibleName: shortened } : row,
        );
        const nextText = `${prev.slice(0, token.start)}@${shortened}${prev.slice(token.end)}`;
        const caret = token.start + shortened.length + 1;
        return {
          text: nextText,
          selection: { start: caret, end: caret },
          chips: nextChips,
          punctReadyIds: punctReadyIds.filter((id) => id !== key),
          forced: true,
        };
      }
      const nextText = `${prev.slice(0, token.start)}${prev.slice(token.end)}`;
      return {
        text: nextText,
        selection: { start: token.start, end: token.start },
        chips: chip ? chips.filter((row) => row.userId !== chip.userId) : chips,
        punctReadyIds: punctReadyIds.filter((id) => id !== key),
        forced: true,
      };
    }
  }
  const delta = next.length - prev.length;
  const caret = Math.max(0, Math.min(next.length, selection.start + delta));
  return {
    text: next,
    selection: { start: caret, end: caret },
    chips: mentionDocFromState(next, chips).chips,
    punctReadyIds: [],
    forced: false,
  };
}

export function mentionDocFromState(text: string, chips: MentionChip[]): MentionDoc {
  const live = mentionTokenRanges(text, chips);
  const liveIds = new Set(live.map((range) => range.userId).filter(Boolean));
  const liveLabels = new Set(live.map((range) => range.username.toLowerCase()));
  return {
    text,
    chips: chips.filter((chip) =>
      chip.userId ? liveIds.has(chip.userId) : liveLabels.has(mentionVisibleLabel(chip).toLowerCase()),
    ),
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

function mentionBodyTokens(mention: MentionRecord): { token: string; display: string }[] {
  const rows: { token: string; display: string }[] = [];
  const full = mention.displayName?.trim() ?? '';
  const words = full.split(/\s+/).filter(Boolean);
  for (let count = words.length; count >= 1; count -= 1) {
    const label = words.slice(0, count).join(' ');
    rows.push({ token: `@${label}`, display: `@${label}` });
  }
  if (mention.username) {
    rows.push({
      token: `@${mention.username}`,
      display: full ? `@${full}` : `@${mention.username}`,
    });
  }
  return rows;
}

export function splitMentionedText(
  content: string,
  mentions: MentionRecord[],
): Array<{ type: 'text' | 'mention'; value: string; mention?: MentionRecord }> {
  if (!content) {
    return [];
  }
  const usable = mentions.filter((row) => row.username || row.displayName);
  if (usable.length === 0) {
    return [{ type: 'text', value: content }];
  }
  const candidates = usable
    .flatMap((mention) => mentionBodyTokens(mention).map((row) => ({ ...row, mention })))
    .sort((a, b) => b.token.length - a.token.length);
  const hits: Array<{ start: number; end: number; value: string; mention: MentionRecord }> = [];
  for (const candidate of candidates) {
    let from = 0;
    while (from <= content.length) {
      const start = tokenIndexAt(content, candidate.token, from);
      if (start < 0) {
        break;
      }
      const overlaps = hits.some((hit) => start < hit.end && start + candidate.token.length > hit.start);
      if (!overlaps) {
        hits.push({
          start,
          end: start + candidate.token.length,
          value: candidate.display,
          mention: candidate.mention,
        });
      }
      from = start + 1;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const parts: Array<{ type: 'text' | 'mention'; value: string; mention?: MentionRecord }> = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      parts.push({ type: 'text', value: content.slice(cursor, hit.start) });
    }
    parts.push({ type: 'mention', value: hit.value, mention: hit.mention });
    cursor = hit.end;
  }
  if (cursor < content.length) {
    parts.push({ type: 'text', value: content.slice(cursor) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}

export function mentionSearchMatches(
  profile: { username?: string | null; display_name?: string | null },
  query: string,
): boolean {
  const needle = query.trim().replace(/^@/, '').toLowerCase();
  if (!needle) {
    return true;
  }
  const username = (profile.username ?? '').trim().toLowerCase();
  if (username.startsWith(needle)) {
    return true;
  }
  const name = (profile.display_name ?? '').trim().toLowerCase();
  if (!name) {
    return false;
  }
  if (name.startsWith(needle)) {
    return true;
  }
  return name.split(/\s+/).some((word) => word.startsWith(needle));
}
