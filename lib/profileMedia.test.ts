import { describe, expect, it } from 'vitest';

import { collectProfileMedia } from '@/lib/profileMedia';
import type { PostWithMeta } from '@/lib/types';

describe('collectProfileMedia', () => {
  it('takes owner post media and comment media they wrote', () => {
    const posts = [
      {
        id: 'p1',
        author_id: 'owner',
        media_urls: ['https://cdn.test/a.jpg'],
        comments: [
          { id: 'c1', author_id: 'owner', content: 'nice\nhttps://cdn.test/b.mp4', post_id: 'p1', created_at: '' },
        ],
      },
      {
        id: 'p2',
        author_id: 'guest',
        media_urls: ['https://cdn.test/other.jpg'],
        comments: [],
      },
    ] as unknown as PostWithMeta[];
    const items = collectProfileMedia(posts, 'owner', 'owner');
    expect(items.map((item) => item.url)).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.mp4']);
    expect(items[0]?.owned).toBe(true);
  });
});
