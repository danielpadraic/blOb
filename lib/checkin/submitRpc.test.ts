import { describe, expect, it } from 'vitest';

import { submitCheckinWithClient, type CheckinRpcClient } from '@/lib/checkin/rpc';

function client(response: { data: unknown; error?: { message?: string } | null }): CheckinRpcClient {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    rpc: () => Promise.resolve({ data: response.data, error: response.error ?? null }),
  };
}

describe('what submit_checkin hands back', () => {
  it('returns the check-in it wrote', async () => {
    const submitted = await submitCheckinWithClient(
      client({
        data: {
          checkin: {
            id: 'c1',
            challenge_id: 'ch1',
            user_id: 'u1',
            status: 'complete',
            created_at: '2026-09-05T12:00:00Z',
          },
        },
      }),
      'ch1',
    );
    expect(submitted?.id).toBe('c1');
  });

  // The submit screen reads this null as a failed Send. If it ever starts meaning "submitted fine,
  // just no row for you", the screen would begin refusing check-ins that actually landed.
  it('returns null when the response carries no check-in', async () => {
    expect(await submitCheckinWithClient(client({ data: {} }), 'ch1')).toBeNull();
    expect(await submitCheckinWithClient(client({ data: null }), 'ch1')).toBeNull();
    expect(await submitCheckinWithClient(client({ data: { checkin: null } }), 'ch1')).toBeNull();
  });

  it('throws the mapped reason when the RPC errors', async () => {
    await expect(
      submitCheckinWithClient(client({ data: null, error: { message: 'MISSING_PROOFS' } }), 'ch1'),
    ).rejects.toThrow();
  });
});
