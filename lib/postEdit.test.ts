import { describe, expect, it } from 'vitest';

import { canHideCheckinUrl, parsePostEdits, visiblePostMedia } from '@/lib/postEdit';

describe('post edit lock', () => {
  it('hides extras but not the last required selfie without a replacement', () => {
    const required = { pre: ['https://example.com/pre.jpg'] };
    expect(
      canHideCheckinUrl({
        url: 'https://example.com/cheer.gif',
        hidden: [],
        required,
      }),
    ).toBe(true);
    expect(
      canHideCheckinUrl({
        url: 'https://example.com/pre.jpg',
        hidden: [],
        required,
      }),
    ).toBe(false);
    expect(
      canHideCheckinUrl({
        url: 'https://example.com/pre.jpg',
        hidden: [],
        required,
        replacements: { pre: 'https://example.com/new.jpg' },
      }),
    ).toBe(true);
  });

  it('keeps hidden URLs off the public grid', () => {
    expect(
      visiblePostMedia(
        ['https://a.jpg', 'https://b.jpg', 'https://a.jpg'],
        ['https://a.jpg'],
      ),
    ).toEqual(['https://b.jpg']);
  });

  it('reads owner edit history captions', () => {
    expect(
      parsePostEdits([
        { caption: 'Sam is laundry!', created_at: '2026-08-27T12:00:00.000Z' },
        { caption: '', created_at: '2026-08-27T12:05:00.000Z' },
      ]),
    ).toEqual([
      { caption: 'Sam is laundry!', created_at: '2026-08-27T12:00:00.000Z' },
      { caption: '', created_at: '2026-08-27T12:05:00.000Z' },
    ]);
  });
});
