import { describe, expect, it } from 'vitest';

import { apexBlobOrigin, apexBlobUrl, isBlobWwwHost } from '@/lib/webHost';

describe('blob apex host', () => {
  it('rewrites www.blob.mobi to https://blob.mobi', () => {
    expect(isBlobWwwHost('www.blob.mobi')).toBe(true);
    expect(isBlobWwwHost('blob.mobi')).toBe(false);
    expect(apexBlobUrl('https://www.blob.mobi/auth/callback?code=1')).toBe(
      'https://blob.mobi/auth/callback?code=1',
    );
    expect(apexBlobOrigin('https://www.blob.mobi')).toBe('https://blob.mobi');
    expect(apexBlobOrigin('https://blob.mobi')).toBe('https://blob.mobi');
  });
});
