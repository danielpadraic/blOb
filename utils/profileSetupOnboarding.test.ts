import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/onboarding/profile-setup.tsx'),
  'utf8',
);

describe('Physical Details onboarding has no Health / OS-permission gate', () => {
  it('does not import HealthKit or ask for OS permission', () => {
    expect(src).not.toMatch(/react-native-health/);
    expect(src).not.toMatch(/HealthKit|Apple Health|initHealthKit|requestAccess/);
    expect(src).not.toMatch(/We need permission to continue/);
    expect(src).toMatch(/Always private/);
    expect(src).toMatch(/Set this up later/);
    expect(src).toMatch(/label: 'Skip'/);
  });
});
