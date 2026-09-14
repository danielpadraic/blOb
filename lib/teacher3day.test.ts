import { describe, expect, it } from 'vitest';

import {
  emptyTeacher3DayState,
  parseTeacher3DayState,
  teacherAccountGaps,
  teacherAccountReady,
  teacherBannerCta,
  teacherBannerTitle,
  teacherCanBegin,
  teacherHrProofAccepts,
  teacherLiveAllowsAuthor,
  teacherPeriodWindows,
  teacherPhoneDigits,
  teacherPhoneOk,
} from '@/lib/teacher3day';

const ADULT = {
  date_of_birth: '1990-01-15',
  declared_region: 'CO',
  phone: '2085550100',
  teacher_camera_ready_at: '2026-09-14T12:00:00.000Z',
  teacher_hr_source: 'upload' as const,
};

describe('teacher 3-Day account spine', () => {
  it('requires 10 phone digits and a USPS home state', () => {
    expect(teacherPhoneDigits('(208) 555-0100')).toBe('2085550100');
    expect(teacherPhoneOk('555-0100')).toBe(false);
    expect(teacherAccountReady(ADULT)).toBe(true);
    expect(teacherAccountGaps({ ...ADULT, phone: '' }).phone).toBe(true);
    expect(teacherAccountGaps({ ...ADULT, declared_region: null, home_state: null }).region).toBe(
      true,
    );
  });

  it('locks Officials under 18 and Begin until camera + HR source', () => {
    expect(teacherAccountGaps({ ...ADULT, date_of_birth: '2015-01-01' }).underage).toBe(true);
    expect(teacherCanBegin({ ...ADULT, teacher_camera_ready_at: null })).toBe(false);
    expect(teacherCanBegin({ ...ADULT, teacher_hr_source: null })).toBe(false);
    expect(teacherCanBegin(ADULT)).toBe(true);
  });
});

describe('teacher 3-Day banner machine', () => {
  it('maps none / live / missed / done copy', () => {
    expect(teacherBannerTitle(emptyTeacher3DayState())).toBe('3-Day vs you');
    expect(teacherBannerCta(emptyTeacher3DayState())).toBe('Begin');
    expect(teacherBannerTitle(parseTeacher3DayState({ phase: 'live', day_n: 2 }))).toBe('Day 2 of 3');
    expect(teacherBannerCta(parseTeacher3DayState({ phase: 'live' }))).toBe('Check In');
    expect(teacherBannerCta(parseTeacher3DayState({ phase: 'missed' }))).toBe('Start over');
    expect(teacherBannerTitle(parseTeacher3DayState({ phase: 'done', credit_granted: true }))).toBe(
      '3-Day done',
    );
  });

  it('uses 24h windows from began_at, not UTC midnight', () => {
    const began = new Date('2026-09-14T18:30:00.000Z');
    const windows = teacherPeriodWindows(began, new Date('2026-09-15T19:00:00.000Z'));
    expect(windows).toHaveLength(3);
    expect(windows[0]?.startsAt.toISOString()).toBe('2026-09-14T18:30:00.000Z');
    expect(windows[0]?.endsAt.toISOString()).toBe('2026-09-15T18:30:00.000Z');
    expect(windows[1]?.current).toBe(true);
    expect(windows[2]?.startsAt.toISOString()).toBe('2026-09-16T18:30:00.000Z');
  });
});

describe('teacher HR proof gate', () => {
  it('rejects calories-only, weekly rings, and HR with no timestamp', () => {
    expect(
      teacherHrProofAccepts({
        method: 'hr',
        health: {
          source: 'ocr',
          activityType: 'other',
          sourceName: 'Activity rings',
          activeEnergyKcal: 420,
        },
      }),
    ).toBe(false);
    expect(
      teacherHrProofAccepts({
        method: 'hr',
        health: {
          source: 'ocr',
          activityType: 'run',
          sourceName: 'Watch',
          avgHrBpm: 142,
        },
      }),
    ).toBe(false);
    expect(
      teacherHrProofAccepts({
        method: 'hr',
        health: {
          source: 'healthkit',
          activityType: 'run',
          sourceName: 'Apple Watch',
          startedAt: '2026-09-14T18:00:00.000Z',
          endedAt: '2026-09-14T18:32:00.000Z',
          avgHrBpm: 138,
        },
      }),
    ).toBe(true);
    expect(teacherHrProofAccepts({ method: 'hr', url: 'https://example.com/hr.jpg' })).toBe(true);
  });
});

describe('teacher Live lock', () => {
  it('keeps only the viewer and Bob', () => {
    expect(teacherLiveAllowsAuthor('user-1', 'user-1')).toBe(true);
    expect(teacherLiveAllowsAuthor('81dfe427-d413-4c60-bd4a-e710c95077ad', 'user-1')).toBe(true);
    expect(teacherLiveAllowsAuthor('someone-else', 'user-1')).toBe(false);
  });
});
