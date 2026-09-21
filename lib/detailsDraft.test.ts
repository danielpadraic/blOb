import { describe, expect, it } from 'vitest';

import { draftFromSource, keepDetailsDraft } from '@/lib/detailsDraft';

const source = {
  title: 'Rookies vs. Veterans',
  description: 'Show up.',
  cover_image_url: 'https://blob.mobi/cover.jpg',
  rules: 'Be kind.',
  sponsor_name: '',
};

describe('keepDetailsDraft', () => {
  it('seeds from source once and never wipes a typed title', () => {
    const first = keepDetailsDraft(null, source, false);
    expect(first?.title).toBe('Rookies vs. Veterans');

    const typed = { ...first!, title: 'Rookies vs. Veterans 2' };
    expect(keepDetailsDraft(typed, { ...source, title: 'Other' }, true)?.title).toBe(
      'Rookies vs. Veterans 2',
    );
    expect(keepDetailsDraft(typed, { ...source, title: 'Other' }, false)?.title).toBe(
      'Rookies vs. Veterans 2',
    );
  });

  it('does not replace a focused empty-looking current with source', () => {
    const current = draftFromSource(source);
    current.title = 'Rookies vs. Veterans';
    expect(keepDetailsDraft(current, { ...source, title: '' }, true)?.title).toBe(
      'Rookies vs. Veterans',
    );
  });
});
