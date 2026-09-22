import { describe, expect, it } from 'vitest';

import { canHouseEditChallenge, canHostWizardEdit, formatStartMovedDate, startMovedBody } from '@/lib/challengeStart';

describe('Wizard edit', () => {
  const pinnacle = {
    status: 'live',
    created_by: 'host-1',
    is_official: false,
    series_id: null,
    privacy_mode: 'private_corporate' as const,
    host_rigor: 'friendly' as const,
  };

  it('lets a live Friendly private_corporate host open Edit Challenge', () => {
    expect(canHostWizardEdit({ challenge: pinnacle, viewerId: 'host-1' })).toBe(true);
  });

  it('lets a listed moderator edit the same live Friendly corporate challenge', () => {
    expect(
      canHostWizardEdit({ challenge: pinnacle, viewerId: 'mod-1', moderatorIds: ['mod-1'] }),
    ).toBe(true);
  });

  it('blocks a live Strict corporate host from the wizard', () => {
    expect(
      canHostWizardEdit({
        challenge: { ...pinnacle, host_rigor: 'strict' },
        viewerId: 'host-1',
      }),
    ).toBe(false);
  });

  it('blocks a live public Friendly host — schedule edit is corporate Friendly|Normal', () => {
    expect(
      canHostWizardEdit({
        challenge: { ...pinnacle, privacy_mode: 'public' },
        viewerId: 'host-1',
      }),
    ).toBe(false);
  });
});

describe('House edit', () => {
  it('lets official_ops edit a live challenge they do not host, not after settled', () => {
    expect(canHouseEditChallenge({ challenge: { status: 'live' }, officialOps: true })).toBe(true);
    expect(canHouseEditChallenge({ challenge: { status: 'live' }, officialOps: false })).toBe(false);
    expect(canHouseEditChallenge({ challenge: { status: 'settled' }, officialOps: true })).toBe(false);
  });
});

describe('start-rolled copy', () => {
  it('prints Sep 6 for a 7pm Denver start stored as Sep 7 UTC', () => {
    expect(formatStartMovedDate('2026-09-07T01:00:00.000Z', 'America/Denver')).toBe('Sep 6');
    expect(startMovedBody({ starts_at: '2026-09-07T01:00:00.000Z', timezone: 'America/Denver' })).toBe(
      'Not enough people yet. Start moved to Sep 6.',
    );
  });

  it('uses America/Denver when the challenge has no timezone', () => {
    expect(formatStartMovedDate('2026-09-07T01:00:00.000Z')).toBe('Sep 6');
  });
});
