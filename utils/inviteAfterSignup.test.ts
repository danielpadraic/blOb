import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('private corporate invite after signup', () => {
  it('keeps the token through profile setup and auto-accepts on /invite/{token}', () => {
    const invites = readFileSync(join(root, 'lib/pendingInviteToken.ts'), 'utf8');
    const screen = readFileSync(join(root, 'app/invite/[token].tsx'), 'utf8');
    const setup = readFileSync(join(root, 'app/onboarding/profile-setup.tsx'), 'utf8');
    const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');

    expect(invites).toMatch(/blob:pending_invite_token/);
    expect(invites).toMatch(/localStorage/);
    expect(invites).toMatch(/peekPendingInviteToken/);
    expect(invites).toMatch(/clearPendingInviteToken/);
    expect(setup).toMatch(/pendingInviteResumeHref/);
    expect(layout).toMatch(/peekPendingInviteToken/);
    expect(layout).not.toMatch(/takePendingInviteToken/);
    expect(layout).not.toMatch(/pathname.startsWith\('\/challenges'\)/);
    expect(screen).toMatch(/stashPendingInviteToken\(token\)/);
    expect(screen).toMatch(/accept\.mutate\(token/);
    expect(screen).toMatch(/tab: 'overview'/);
    expect(screen).toMatch(/Accepting does not join/);
    expect(screen).not.toMatch(/Accept to join/);
  });
});
