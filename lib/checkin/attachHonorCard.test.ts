import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HonorCardModel } from '@/lib/checkin/honorCard';
import { HONOR_CARD_SOURCE } from '@/lib/checkin/honorCard';

const rasterHonorProofCard = vi.fn();
const uploadPostAttachment = vi.fn();
const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const maybeSingle = vi.fn();
const isDeleted = vi.fn(() => ({ maybeSingle }));
const eqCheckin = vi.fn(() => ({ is: isDeleted }));
const select = vi.fn(() => ({ eq: eqCheckin }));
const from = vi.fn(() => ({ select, update }));

vi.mock('@/lib/checkin/honorCardRaster', () => ({
  rasterHonorProofCard: (...args: unknown[]) => rasterHonorProofCard(...args),
}));

vi.mock('@/utils/upload', () => ({
  uploadPostAttachment: (...args: unknown[]) => uploadPostAttachment(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

import { attachHonorCardToCheckin, writeHonorCheckinCard } from '@/lib/checkin/attachHonorCard';

const CARD: HonorCardModel = {
  title: 'Rookies vs. Veterans',
  laneLabel: 'Rookie',
  periodLabel: 'Wed, Sep 23',
  fields: [
    { key: 'act-dials', label: 'Dials', chipLabel: 'Dials', value: 10, kind: 'count', iconKey: 'calls' },
    {
      key: 'multiplier:presentations',
      label: 'Presentations',
      chipLabel: 'Pres',
      value: 1,
      kind: 'count',
      iconKey: 'presentation',
    },
    { key: 'act-ap', label: 'AP', chipLabel: 'AP', value: 0, kind: 'money', iconKey: 'money' },
  ],
};

describe('writeHonorCheckinCard', () => {
  beforeEach(() => {
    rasterHonorProofCard.mockReset();
    uploadPostAttachment.mockReset();
    updateEq.mockReset();
    maybeSingle.mockReset();
    updateEq.mockResolvedValue({ error: null });
    uploadPostAttachment.mockResolvedValue('https://cdn.test/u/honor_card-2.jpg');
  });

  it('writes stats first, retries raster once, then replaces only the recap URL', async () => {
    rasterHonorProofCard.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('file://card.jpg');
    const result = await writeHonorCheckinCard({
      userId: 'u1',
      postId: 'p1',
      card: CARD,
      laneId: 'rookie',
      existingMedia: ['https://cdn.test/note.jpg', 'https://cdn.test/u/honor_card-1.jpg'],
      existingStats: { source: HONOR_CARD_SOURCE, card_url: 'https://cdn.test/u/honor_card-1.jpg' },
    });
    expect(rasterHonorProofCard).toHaveBeenCalledTimes(2);
    expect(result.checkin_stats.source).toBe(HONOR_CARD_SOURCE);
    expect(result.checkin_stats.honor_fields?.map((field) => field.value)).toEqual([10, 1, 0]);
    expect(result.media_urls).toEqual(['https://cdn.test/note.jpg', 'https://cdn.test/u/honor_card-2.jpg']);
    expect(result.media_urls.filter((url) => url.includes('honor_card-'))).toHaveLength(1);
  });

  it('keeps Send successful when raster fails twice — chips still persist', async () => {
    rasterHonorProofCard.mockRejectedValue(new Error('timeout'));
    const result = await writeHonorCheckinCard({
      userId: 'u1',
      postId: 'p1',
      card: CARD,
      laneId: 'rookie',
      existingMedia: ['https://cdn.test/note.jpg'],
    });
    expect(rasterHonorProofCard).toHaveBeenCalledTimes(2);
    expect(result.media_urls).toEqual(['https://cdn.test/note.jpg']);
    expect(result.checkin_stats.source).toBe(HONOR_CARD_SOURCE);
    expect(result.checkin_stats.honor_fields?.find((field) => field.key === 'act-ap')?.value).toBe(0);
  });
});

describe('attachHonorCardToCheckin', () => {
  beforeEach(() => {
    rasterHonorProofCard.mockReset();
    uploadPostAttachment.mockReset();
    updateEq.mockReset();
    maybeSingle.mockReset();
    updateEq.mockResolvedValue({ error: null });
    rasterHonorProofCard.mockResolvedValue('file://card.jpg');
    uploadPostAttachment.mockResolvedValue('https://cdn.test/u/honor_card-9.jpg');
  });

  it('retries post lookup by checkin_id when the first read is empty', async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 'p-dunk', media_urls: [], checkin_stats: null },
        error: null,
      });
    const honor = await attachHonorCardToCheckin({
      userId: 'u1',
      checkinId: 'c-dunk',
      card: CARD,
      laneId: 'rookie',
    });
    expect(honor?.postId).toBe('p-dunk');
    expect(honor?.checkin_stats.source).toBe(HONOR_CARD_SOURCE);
    expect(honor?.media_urls).toEqual(['https://cdn.test/u/honor_card-9.jpg']);
  });
});
