import { describe, expect, it } from 'vitest';

import { inferScoringIconKey, resolveScoringIconKey } from '@/lib/scoringIcons';

describe('scoring icon fallback', () => {
  it('maps obvious labels and money kind without insurance-only words', () => {
    expect(inferScoringIconKey('Dials')).toBe('calls');
    expect(inferScoringIconKey('Presentations')).toBe('presentation');
    expect(inferScoringIconKey('AP')).toBe('money');
    expect(inferScoringIconKey('Closed tickets', 'money')).toBe('money');
    expect(inferScoringIconKey('Floor walks')).toBe('steps');
    expect(inferScoringIconKey('Mystery metric')).toBe('generic');
  });

  it('keeps a stored key and falls back when the key is missing', () => {
    expect(resolveScoringIconKey({ icon_key: 'camera', name: 'Dials' })).toBe('camera');
    expect(resolveScoringIconKey({ name: 'Dials' })).toBe('calls');
    expect(resolveScoringIconKey({})).toBe('generic');
  });
});
