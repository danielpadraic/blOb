import { describe, expect, it, vi } from 'vitest';

import {
  challengeLoadKind,
  classifyChallengeLoadFailure,
  createChallengeLoadError,
  firstRouteParam,
  isTransientNetworkError,
  snapshotLooksPrivate,
} from '@/lib/challengeLoad';
import { openChallengeLobby, seedChallengeDetailQuery } from '@/lib/challengeOpen';
import { scrollNodeTo } from '@/lib/challengeRoute';

describe('firstRouteParam', () => {
  it('reads a string or the first array value and trims', () => {
    expect(firstRouteParam('  abc  ')).toBe('abc');
    expect(firstRouteParam(['  xyz  '])).toBe('xyz');
    expect(firstRouteParam([undefined, 'nope'])).toBe('');
    expect(firstRouteParam(undefined)).toBe('');
    expect(firstRouteParam(null)).toBe('');
  });
});

describe('classifyChallengeLoadFailure', () => {
  it('keeps geo ahead of other reasons', () => {
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'geo',
        snapshot: { visibility: 'private' },
        error: new Error('Failed to fetch'),
      }),
    ).toBe('geo');
  });

  it('uses snapshot privacy when RLS hides the row', () => {
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'hidden',
        snapshot: { visibility: 'private', challenge_lane: 'private' },
      }),
    ).toBe('private');
    expect(
      classifyChallengeLoadFailure({
        accessReason: 'hidden',
        snapshot: { privacy_mode: 'private_corporate' },
      }),
    ).toBe('private');
  });

  it('treats network / 5xx as a real server failure', () => {
    expect(classifyChallengeLoadFailure({ error: new Error('Failed to fetch') })).toBe('server');
    expect(classifyChallengeLoadFailure({ error: { message: 'timeout', status: 503 } })).toBe(
      'server',
    );
  });

  it('treats empty / RLS deny as unavailable', () => {
    expect(classifyChallengeLoadFailure({ accessReason: 'hidden' })).toBe('unavailable');
    expect(classifyChallengeLoadFailure({ error: { code: 'PGRST116', message: '0 rows' } })).toBe(
      'unavailable',
    );
  });
});

describe('challenge load helpers', () => {
  it('round-trips typed errors', () => {
    const error = createChallengeLoadError('unavailable');
    expect(challengeLoadKind(error)).toBe('unavailable');
    expect(isTransientNetworkError(new Error('Network request failed'))).toBe(true);
    expect(snapshotLooksPrivate({ visibility: 'public' })).toBe(false);
  });

  it('does not navigate without a stable id', () => {
    const push = vi.fn();
    const client = {
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      prefetchQuery: vi.fn(),
    };
    expect(openChallengeLobby({ push }, { id: '   ' }, client as never)).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(seedChallengeDetailQuery({ title: 'Nope' }, client)).toBe('');
    expect(client.setQueryData).not.toHaveBeenCalled();
  });

  it('scrolls only when scrollTo exists', () => {
    expect(scrollNodeTo(null, { y: 0 })).toBe(false);
    expect(scrollNodeTo({}, { y: 0 })).toBe(false);
    const node = { scrollTo: vi.fn() };
    expect(scrollNodeTo(node, { y: 0, animated: false })).toBe(true);
    expect(node.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    const broken = {
      scrollTo: () => {
        throw new Error('missing');
      },
    };
    expect(scrollNodeTo(broken, { y: 0 })).toBe(false);
  });
});
