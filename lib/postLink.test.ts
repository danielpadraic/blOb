import { describe, expect, it } from 'vitest';

import { postIdFromShareText, textWithoutPostLink } from '@/lib/postLink';

const ID = '9f1c2e0a-1111-4222-8333-444444444444';

describe('postIdFromShareText', () => {
  it('finds the post behind a shared link', () => {
    expect(postIdFromShareText(`https://blob.mobi/feed/p/${ID}`)).toBe(ID);
    expect(postIdFromShareText(`blob://feed/p/${ID}`)).toBe(ID);
  });

  it('finds it under a caption, which is how a shared lift arrives', () => {
    expect(postIdFromShareText(`Chest day\nhttps://blob.mobi/feed/p/${ID}`)).toBe(ID);
  });

  it('ignores text with no post in it', () => {
    expect(postIdFromShareText('see you at the gym')).toBeNull();
    expect(postIdFromShareText('https://blob.mobi/challenges/abc')).toBeNull();
  });
});

describe('textWithoutPostLink', () => {
  it('leaves the caption the sender actually typed', () => {
    expect(textWithoutPostLink(`Chest day\nhttps://blob.mobi/feed/p/${ID}`)).toBe('Chest day');
  });

  // No caption means nothing to show, so the bubble falls back to its own label rather than
  // rendering an empty line.
  it('is empty when the link was the whole message', () => {
    expect(textWithoutPostLink(`https://blob.mobi/feed/p/${ID}`)).toBe('');
  });
});
