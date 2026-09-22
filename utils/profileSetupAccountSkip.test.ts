import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('first-run Account step skips cash geo', () => {
  it('never calls geo_cash_gate from signup or profile setup', () => {
    const setup = readFileSync(join(root, 'app/onboarding/profile-setup.tsx'), 'utf8');
    const spine = readFileSync(join(root, 'components/profile/AccountSpineFields.tsx'), 'utf8');
    const joinHost = readFileSync(join(root, 'components/challenge/JoinConfirmHost.tsx'), 'utf8');
    expect(setup).not.toMatch(/geo_cash_gate|requestGeoCashGate|useGeoCash/);
    expect(spine).not.toMatch(/geo_cash_gate|requestGeoCashGate/);
    expect(setup).toMatch(/skipAccount/);
    expect(setup).toMatch(/title="Add later"/);
    expect(joinHost).toMatch(/skipsCashGeo/);
  });
});
