import { describe, expect, it } from 'vitest';

import { namedOfficialSponsor, officialSponsorName } from '@/lib/challengeSponsor';

describe('official sponsor', () => {
  it('uses sponsor or organization name and never treats blOb as a named sponsor', () => {
    expect(namedOfficialSponsor({ sponsor_name: 'Pinnacle Life Group' })).toBe('Pinnacle Life Group');
    expect(namedOfficialSponsor({ organization_name: 'Pinnacle Life Group' })).toBe(
      'Pinnacle Life Group',
    );
    expect(namedOfficialSponsor({ sponsor_name: 'blOb' })).toBe('');
    expect(namedOfficialSponsor({ sponsor_name: 'blob' })).toBe('');
    expect(officialSponsorName({ is_official: true })).toBe('blOb');
    expect(officialSponsorName({ is_official: true, sponsor_name: 'Pinnacle Life Group' })).toBe(
      'Pinnacle Life Group',
    );
  });
});
