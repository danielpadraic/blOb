import { describe, expect, it, vi } from 'vitest';

import { WAVE_TAG_SOFT_FAIL, logWaveFail, waveSessionAuthor } from '@/lib/wavePublish';

describe('wave publish author', () => {
  it('always returns an id when the session user id is present', () => {
    expect(waveSessionAuthor({ username: 'ada', display_name: 'Ada' }, 'u-1')).toEqual({
      id: 'u-1',
      username: 'ada',
      display_name: 'Ada',
      avatar_url: null,
    });
    expect(waveSessionAuthor(undefined, 'u-2')?.id).toBe('u-2');
    expect(waveSessionAuthor(undefined, null)).toBeNull();
  });

  it('keeps the soft-fail line for a skipped tag', () => {
    expect(WAVE_TAG_SOFT_FAIL).toBe('Posted without the tag.');
  });

  it('logs one short line with a stage', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logWaveFail('player', new Error('Cannot read property id of undefined'));
    expect(spy).toHaveBeenCalledWith('[blob:wave]', {
      stage: 'player',
      message: 'Cannot read property id of undefined',
    });
    spy.mockRestore();
  });
});
