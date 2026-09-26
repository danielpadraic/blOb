import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { officialBob } from '@/copy/officialBob';
import { copy } from '@/lib/copy';

const FULL = 'Settings → Apps → Health → Data Access & Devices → blOb';
const SHORT = 'Settings → Health → blOb';

describe('Health settings path', () => {
  it('uses the full iOS path in connect / empty / Official copy', () => {
    expect(copy('health.howToIos')).toBe(FULL);
    expect(copy('health.permissionDeniedIos')).toContain(FULL);
    expect(copy('health.emptyIos')).toContain(FULL);
    expect(officialBob('proofHeart')).toContain(FULL);
    expect(officialBob('proofHeartAndroid')).not.toContain('Settings →');
  });

  it('does not keep the short Settings → Health → blOb path in user copy', () => {
    const files = [
      'lib/copy.ts',
      'copy/officialBob.ts',
      'lib/health/howTo.ts',
      'hooks/useHealthConnection.ts',
      'components/challenge/HealthWorkoutPicker.tsx',
      'components/challenge/ProofUploader.tsx',
      'components/challenge/ProofRequirementIcons.tsx',
      'app/(tabs)/profile/account.tsx',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src.includes(SHORT), file).toBe(false);
      expect(src).not.toMatch(/Settings → Health(?! → Data Access)/);
      expect(src).not.toMatch(/Open Health settings/i);
      expect(src).not.toMatch(/Settings → Privacy → Health/);
    }
    expect(copy('health.howToIos')).toContain('blOb');
    expect(copy('health.howToIos')).not.toMatch(/\bBlob\b|\bblob\b/);
  });
});
