import { describe, expect, it } from 'vitest';

import { COVER_STICK_FAIL, webCoverFile } from '@/lib/challengeCoverPick';

describe('webCoverFile', () => {
  it('rejects a missing or empty file with the stick copy', () => {
    expect(webCoverFile(null)).toEqual({ ok: false, message: COVER_STICK_FAIL });
    expect(webCoverFile(undefined)).toEqual({ ok: false, message: COVER_STICK_FAIL });
    expect(webCoverFile(new Blob())).toEqual({ ok: false, message: COVER_STICK_FAIL });
  });

  it('keeps a real still so the crop/upload path can run', () => {
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    expect(webCoverFile(file)).toEqual({ ok: true, file });
  });
});
