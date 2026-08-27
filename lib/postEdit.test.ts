import { describe, expect, it } from 'vitest';

import { checkinCardCaption } from '@/lib/checkinPost';
import {
  canHideCheckinUrl,
  hiddenUrlsFromParts,
  isPersistedMediaUrl,
  parsePostEdits,
  postEditUnchanged,
  visiblePostMedia,
} from '@/lib/postEdit';

describe('post edit lock', () => {
  it('allows hide as blur-in-place on the last required selfie', () => {
    const required = { pre: ['https://example.com/pre.jpg'] };
    expect(
      canHideCheckinUrl({
        url: 'https://example.com/pre.jpg',
        hidden: [],
        required,
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

  it('treats hide as unchanged when flags already match', () => {
    expect(
      postEditUnchanged({
        caption: 'Hi',
        originalCaption: 'Hi',
        mediaUrls: ['https://a.jpg'],
        originalMediaUrls: ['https://a.jpg'],
        hidden: ['https://a.jpg'],
        originalHidden: ['https://a.jpg'],
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

  it('reads hidden urls from proof json', () => {
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
