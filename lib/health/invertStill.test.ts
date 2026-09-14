import { describe, expect, it } from 'vitest';

import { invertJpegBase64 } from '@/lib/health/invertStill';

describe('invertJpegBase64', () => {
  it('returns null for an empty payload and does not throw', async () => {
    await expect(invertJpegBase64('')).resolves.toBeNull();
    await expect(invertJpegBase64('   ')).resolves.toBeNull();
  });
});
