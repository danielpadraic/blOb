import { describe, expect, it } from 'vitest';

import {
  applyTokenAwareTextChange,
  insertMention,
  mentionDocFromState,
  mentionQueryAtCursor,
  mentionSearchMatches,
  mentionTokenRanges,
  splitMentionedText,
  type MentionChip,
} from '@/lib/mentions';

const daniel: MentionChip = {
  userId: 'user-daniel',
  username: 'danielharder',
  label: 'Daniel Harder',
};

const maya: MentionChip = {
  userId: 'user-maya',
  username: 'maya',
  label: 'Maya',
};

function backspace(
  text: string,
  chips: MentionChip[],
  punctReadyIds: string[] = [],
) {
  const selection = { start: text.length, end: text.length };
  const next = text.slice(0, -1);
  return applyTokenAwareTextChange(text, next, selection, chips, punctReadyIds);
}

describe('insertMention', () => {
  it('inserts the profile name, not the username', () => {
    const next = insertMention('@dan', { start: 4, end: 4 }, 'Daniel Harder');
    expect(next.text).toBe('@Daniel Harder');
    expect(next.text).not.toContain('@danielharder');
    expect(next.selection).toEqual({ start: '@Daniel Harder'.length, end: '@Daniel Harder'.length });
  });
});

describe('mentionSearchMatches', () => {
  const profile = { username: 'danielharder', display_name: 'Daniel Harder' };

  it('matches username or display-name start-of-word', () => {
    expect(mentionSearchMatches(profile, 'dan')).toBe(true);
    expect(mentionSearchMatches(profile, 'Daniel')).toBe(true);
    expect(mentionSearchMatches(profile, 'Hard')).toBe(true);
    expect(mentionSearchMatches(profile, 'danielharder')).toBe(true);
  });

  it('does not match mid-word leftovers', () => {
    expect(mentionSearchMatches(profile, 'niel')).toBe(false);
    expect(mentionSearchMatches(profile, 'arder')).toBe(false);
  });
});

describe('mentionQueryAtCursor', () => {
  it('reads @dan and @Daniel as live queries', () => {
    expect(mentionQueryAtCursor('@dan', 4)?.query).toBe('dan');
    expect(mentionQueryAtCursor('@Daniel', 7)?.query).toBe('Daniel');
  });

  it('does not treat an inserted profile name as a live query', () => {
    expect(mentionQueryAtCursor('@Daniel Harder', '@Daniel Harder'.length)).toBeNull();
  });
});

describe('mention backspace', () => {
  it('uses four steps on a two-word profile name and keeps the same user id', () => {
    const start = '@Daniel Harder';
    const first = backspace(start, [daniel]);
    expect(first.text).toBe(start);
    expect(first.chips[0]?.userId).toBe('user-daniel');
    expect(first.forced).toBe(true);

    const second = backspace(first.text, first.chips, first.punctReadyIds);
    expect(second.text).toBe('@Daniel');
    expect(second.chips[0]?.userId).toBe('user-daniel');
    expect(mentionDocFromState(second.text, second.chips).chips[0]?.userId).toBe('user-daniel');

    const third = backspace(second.text, second.chips, second.punctReadyIds);
    expect(third.text).toBe('@Daniel');
    expect(third.chips[0]?.userId).toBe('user-daniel');

    const fourth = backspace(third.text, third.chips, third.punctReadyIds);
    expect(fourth.text).toBe('');
    expect(fourth.chips).toEqual([]);
  });

  it('uses two steps on a one-word profile name', () => {
    const first = backspace('@Maya', [maya]);
    expect(first.text).toBe('@Maya');
    expect(first.chips[0]?.userId).toBe('user-maya');

    const second = backspace(first.text, first.chips, first.punctReadyIds);
    expect(second.text).toBe('');
    expect(second.chips).toEqual([]);
  });

  it('lets typed copy after a shortened token delete first, then resumes the token rules', () => {
    const shortened = applyTokenAwareTextChange(
      '@Daniel Harder',
      '@Daniel Harde',
      { start: '@Daniel Harder'.length, end: '@Daniel Harder'.length },
      [daniel],
      mentionTokenRanges('@Daniel Harder', [daniel]).map((range) => `${range.start}:${range.userId}`),
    );
    expect(shortened.text).toBe('@Daniel');

    const typed = applyTokenAwareTextChange(
      shortened.text,
      '@Daniel hello',
      { start: '@Daniel'.length, end: '@Daniel'.length },
      shortened.chips,
      shortened.punctReadyIds,
    );
    expect(typed.text).toBe('@Daniel hello');
    expect(typed.chips[0]?.userId).toBe('user-daniel');
    expect(typed.punctReadyIds).toEqual([]);

    const afterHello = applyTokenAwareTextChange(
      '@Daniel hello',
      '@Daniel hell',
      { start: '@Daniel hello'.length, end: '@Daniel hello'.length },
      typed.chips,
      [],
    );
    expect(afterHello.text).toBe('@Daniel hell');
    expect(afterHello.forced).toBe(false);

    const againstToken = backspace('@Daniel', typed.chips);
    expect(againstToken.text).toBe('@Daniel');
    expect(againstToken.chips[0]?.userId).toBe('user-daniel');

    const drop = backspace(againstToken.text, againstToken.chips, againstToken.punctReadyIds);
    expect(drop.text).toBe('');
    expect(drop.chips).toEqual([]);
  });
});

describe('mentionDocFromState', () => {
  it('keeps the same user id on a legacy username token', () => {
    const doc = mentionDocFromState('hey @danielharder', [daniel]);
    expect(doc.chips[0]?.userId).toBe('user-daniel');
  });
});

describe('splitMentionedText', () => {
  const mention = {
    userId: 'user-daniel',
    username: 'danielharder',
    displayName: 'Daniel Harder',
    available: true,
  };

  it('renders a legacy @username token as the profile name', () => {
    const parts = splitMentionedText('hey @danielharder', [mention]);
    expect(parts).toEqual([
      { type: 'text', value: 'hey ' },
      { type: 'mention', value: '@Daniel Harder', mention },
    ]);
  });

  it('keeps a shortened profile-name token', () => {
    const parts = splitMentionedText('hey @Daniel', [mention]);
    expect(parts[1]).toMatchObject({ type: 'mention', value: '@Daniel' });
  });
});
