import { describe, expect, it } from 'vitest';

import { ageOnDate, formatDateOnly, officialDobStatus, parseDateOnly } from '@/lib/officialDob';

describe('official DOB gate', () => {
  it('asks for a birth date when empty', () => {
    expect(officialDobStatus(null)).toBe('dob_required');
    expect(officialDobStatus('')).toBe('dob_required');
  });

  it('blocks under 18 and allows the 18th birthday', () => {
    const today = new Date(2026, 8, 2);
    expect(officialDobStatus('2010-09-03', today)).toBe('underage');
    expect(officialDobStatus('2008-09-02', today)).toBe('ok');
    expect(ageOnDate(parseDateOnly('2008-09-02')!, today)).toBe(18);
  });

  it('parses YYYY-MM-DD without UTC shift', () => {
    const parsed = parseDateOnly('2000-01-01');
    expect(parsed).not.toBeNull();
    expect(formatDateOnly(parsed!)).toBe('2000-01-01');
  });
});
