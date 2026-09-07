import { describe, expect, it } from 'vitest';

import { readBlockedPeerRows } from '@/lib/blockedPeers';

const A = '2bb47049-4f8d-40a7-aa5d-83cf6ba5025b';
const B = '4e00ec21-0f3b-4fc6-a23b-076b42abf380';

describe('readBlockedPeerRows', () => {
  it('reads the bare string array PostgREST sends for setof uuid', () => {
    expect(readBlockedPeerRows([A, B])).toEqual([A, B]);
  });

  it('reads a single-column row shape', () => {
    expect(readBlockedPeerRows([{ blocked_peer_ids: A }, { blocked_peer_ids: B }])).toEqual([A, B]);
  });

  it('drops empty, blank, and non-string entries instead of returning holes', () => {
    expect(readBlockedPeerRows([A, '', '   ', null, undefined, 7, {}, B])).toEqual([A, B]);
  });

  it('trims whitespace so a padded id still matches an author id', () => {
    expect(readBlockedPeerRows([` ${A} `])).toEqual([A]);
  });

  it('returns nothing for a non-array, so a failed read never looks like an empty block list', () => {
    expect(readBlockedPeerRows(null)).toEqual([]);
    expect(readBlockedPeerRows(undefined)).toEqual([]);
    expect(readBlockedPeerRows({ ids: [A] })).toEqual([]);
    expect(readBlockedPeerRows('nope')).toEqual([]);
  });
});
