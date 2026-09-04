import { describe, expect, it } from 'vitest';

import { checkinCardCaption } from '@/lib/checkinPost';
import {
  canRemoveCheckinExtra,
  hiddenUrlsFromParts,
  isHiddenMedia,
  isPersistedMediaUrl,
  parsePostEdits,
  postEditUnchanged,
  visiblePostMedia,
} from '@/lib/postEdit';

describe('post edit lock', () => {
  it('blocks removing the last photo in a required category', () => {
    const required = { pre: ['https://example.com/pre.jpg'] };
    expect(
      canRemoveCheckinExtra({
        url: 'https://example.com/pre.jpg',
        mediaUrls: ['https://example.com/pre.jpg', 'https://example.com/extra.jpg'],
        required,
      }),
    ).toBe(false);
    expect(
      canRemoveCheckinExtra({
        url: 'https://example.com/extra.jpg',
        mediaUrls: ['https://example.com/pre.jpg', 'https://example.com/extra.jpg'],
        required,
      }),
    ).toBe(true);
  });

  it('keeps hidden URLs off a derived list without using them on lobby cards', () => {
    expect(
      visiblePostMedia(
        ['https://a.jpg', 'https://b.jpg', 'https://a.jpg'],
        ['https://a.jpg'],
      ),
    ).toEqual(['https://b.jpg']);
    expect(isHiddenMedia('https://cdn.example/a.jpg?x=1', ['https://cdn.example/a.jpg?x=2'])).toBe(true);
  });

  it('treats caption and media as unchanged when they already match', () => {
    expect(
      postEditUnchanged({
        caption: 'Hi',
        originalCaption: 'Hi',
        mediaUrls: ['https://a.jpg'],
        originalMediaUrls: ['https://a.jpg'],
        hidden: [],
        originalHidden: [],
        hiddenFromHome: true,
        originalHiddenFromHome: false,
      }),
    ).toBe(false);
    expect(
      postEditUnchanged({
        caption: 'Hi',
        originalCaption: 'Hi',
        mediaUrls: ['https://a.jpg'],
        originalMediaUrls: ['https://a.jpg'],
        hidden: [],
        originalHidden: [],
        hiddenFromHome: true,
        originalHiddenFromHome: true,
      }),
    ).toBe(true);
    expect(
      postEditUnchanged({
        caption: 'New',
        originalCaption: 'Hi',
        mediaUrls: ['https://a.jpg'],
        originalMediaUrls: ['https://a.jpg'],
        hidden: [],
        originalHidden: [],
      }),
    ).toBe(false);
  });

  it('reads hidden urls from proof json as legacy only', () => {
    expect(
      hiddenUrlsFromParts({
        pre: { method: 'photo', url: 'https://a.jpg', hidden_urls: ['https://a.jpg'] },
      }),
    ).toEqual(['https://a.jpg']);
    expect(isPersistedMediaUrl('https://a.jpg')).toBe(true);
    expect(isPersistedMediaUrl('file:///tmp/x.jpg')).toBe(false);
  });

  it('shows the saved caption after an owner edit', () => {
    expect(checkinCardCaption('Sam is laundry!', 'Laundry', null)).toBe('');
    expect(checkinCardCaption('Sam is laundry!', 'Laundry', '2026-08-27T12:00:00.000Z')).toBe(
      'Sam is laundry!',
    );
    expect(checkinCardCaption('Check-in Complete', null, null)).toBe('');
    expect(checkinCardCaption('legs day', null, null)).toBe('legs day');
    expect(checkinCardCaption('Daniel Harder was exercising for 30-minutes.', null, null)).toBe('');
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
