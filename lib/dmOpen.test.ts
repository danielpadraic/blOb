import { describe, expect, it } from 'vitest';

import {
  DM_BLOCKED_COPY,
  DM_OPEN_FAILED_COPY,
  DM_SELF_COPY,
  canStartDirectChat,
  dmOpenUserMessage,
  isDmBlockedText,
  leaksPostgres,
} from './dmOpen';

describe('dmOpenUserMessage', () => {
  it('maps blocked copy without Postgres codes', () => {
    expect(dmOpenUserMessage('P0001 You can’t message this person.')).toBe(DM_BLOCKED_COPY);
    expect(isDmBlockedText('direct_thread_is_blocked')).toBe(true);
  });

  it('never shows P0001 or the old friends-only raise', () => {
    expect(dmOpenUserMessage('P0001 You can only message accepted friends.')).toBe(
      DM_OPEN_FAILED_COPY,
    );
    expect(dmOpenUserMessage('P0001 You can only message accepted friends.')).not.toMatch(/P0001/i);
    expect(leaksPostgres('P0001 You can only message accepted friends.')).toBe(true);
  });

  it('maps message RLS deny to the blocked copy', () => {
    expect(
      dmOpenUserMessage('new row violates row-level security policy for table "messages"'),
    ).toBe(DM_BLOCKED_COPY);
  });

  it('maps self and missing-profile without leaking SQLSTATE', () => {
    expect(dmOpenUserMessage('P0001 You can’t message yourself.')).toBe(DM_SELF_COPY);
    expect(dmOpenUserMessage('P0001 That person isn’t on the map.')).toBe(DM_OPEN_FAILED_COPY);
  });

  it('gates Start chat when blocked', () => {
    expect(canStartDirectChat({ blocked: true })).toBe(false);
    expect(canStartDirectChat({ blocked: false, self: false })).toBe(true);
  });
});
