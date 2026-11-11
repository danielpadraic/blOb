import { describe, expect, it } from 'vitest';

import {
  officialBoardDayComplete,
  officialBoardDaysByUser,
  officialPeriodCounts,
  officialPeriodFullyProved,
} from '@/lib/checkin/officialDay';

describe('officialPeriodFullyProved', () => {
  it('counts a day only when pre, post, and the workout slot are filled', () => {
    expect(
      officialPeriodFullyProved({
        pre_selfie_url: 'https://cdn.example/pre.jpg',
        post_selfie_url: 'https://cdn.example/post.jpg',
        health_workout_id: 'hk-1',
      }),
    ).toBe(true);
    expect(
      officialPeriodFullyProved({
        proof_parts: { pre: { url: 'https://cdn.example/pre.jpg' } },
      }),
    ).toBe(false);
    expect(officialPeriodFullyProved(null)).toBe(false);
  });

  it('counts a ready Health workout of at least 30 minutes, and not a selfie pair alone', () => {
    expect(
      officialPeriodCounts({
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
          hr: {
            health: {
              source: 'healthkit',
              activityType: 'strength',
              sourceName: 'Apple Watch',
              startedAt: '2026-09-30T11:33:36.398Z',
              endedAt: '2026-09-30T12:30:01.015Z',
              durationSec: 3385,
              avgHrBpm: 142,
            },
          },
        },
      }),
    ).toBe(true);
    expect(
      officialPeriodCounts({
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
        },
      }),
    ).toBe(false);
  });
});

const officialProofs = {
  proofs: [
    { id: 'pre', name: 'Pre-selfie', method: 'photo' },
    { id: 'post', name: 'Post-selfie', method: 'photo' },
    { id: 'hr', name: 'Workout', method: 'hr' },
  ],
};

describe('officialBoardDayComplete', () => {
  it('counts a Chicago day only when every Official slot is filled', () => {
    expect(
      officialBoardDayComplete(officialProofs, {
        user_id: 'daniel',
        period_key: '2026-10-01',
        proof_parts: {
          pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' },
          post: { method: 'photo', url: 'https://cdn.example/post.jpg' },
          hr: { method: 'hr', health: { source: 'healthkit', durationSec: 3447 }, healthWorkoutId: 'hk-1' },
        },
      }),
    ).toBe(true);
    expect(
      officialBoardDayComplete(officialProofs, {
        user_id: 'silas',
        period_key: '2026-09-30',
        proof_parts: {
          pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' },
          post: { method: 'photo', url: 'https://cdn.example/post.jpg' },
        },
      }),
    ).toBe(false);
    expect(
      officialBoardDayComplete(officialProofs, {
        user_id: 'mrs-h',
        period_key: '2026-10-01',
        proof_parts: {
          pre: { method: 'photo', url: 'https://cdn.example/pre.jpg' },
          p_muqaiz5p_4penhs: { method: 'photo', url: 'https://cdn.example/extra.jpg' },
        },
      }),
    ).toBe(false);
  });

  it('does not count a row when the room has no proof list', () => {
    expect(
      officialBoardDayComplete(
        { proofs: [] },
        {
          proof_parts: {
            pre: { url: 'https://cdn.example/pre.jpg' },
            post: { url: 'https://cdn.example/post.jpg' },
            hr: { healthWorkoutId: 'hk-1' },
          },
        },
      ),
    ).toBe(false);
  });

  it('counts every member and keeps one row per Chicago day', () => {
    const days = officialBoardDaysByUser(officialProofs, [
      {
        id: 'dan-1',
        status: 'submitted',
        submitted_at: '2026-10-01T15:00:00.000Z',
        user_id: 'daniel',
        period_key: '2026-10-01',
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
          hr: { url: 'https://cdn.example/hr.jpg' },
        },
      },
      {
        id: 'dan-1-copy',
        status: 'submitted',
        submitted_at: '2026-10-01T15:00:00.000Z',
        user_id: 'daniel',
        period_key: '2026-10-01',
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
          hr: { url: 'https://cdn.example/hr.jpg' },
        },
      },
      {
        id: 'friend-1',
        status: 'submitted',
        submitted_at: '2026-10-01T15:00:00.000Z',
        user_id: 'friend',
        period_key: '2026-10-01',
        pre_selfie_url: 'https://cdn.example/pre.jpg',
        post_selfie_url: 'https://cdn.example/post.jpg',
        health_workout_id: 'hk-2',
      },
      {
        id: 'open',
        status: 'submitted',
        submitted_at: '2026-10-01T15:00:00.000Z',
        user_id: 'friend',
        period_key: '2026-09-30',
        proof_parts: { pre: { url: 'https://cdn.example/pre.jpg' } },
      },
    ]);
    expect(days.get('daniel')?.map((day) => day.periodKey)).toEqual(['2026-10-01']);
    expect(days.get('friend')?.map((day) => day.checkinId)).toEqual(['friend-1']);
    expect(days.has('viewer')).toBe(false);
  });

  describe('board days match settlement', () => {
    const full = {
      pre: { url: 'https://cdn.example/pre.jpg' },
      post: { url: 'https://cdn.example/post.jpg' },
      hr: { url: 'https://cdn.example/hr.jpg' },
    };
    const SUBMITTED_AT = '2026-10-01T15:00:00.000Z';

    it('does not count a complete ready or in_progress row', () => {
      const days = officialBoardDaysByUser(officialProofs, [
        { id: 'r', user_id: 'daniel', period_key: '2026-10-01', status: 'ready', proof_parts: full },
        { id: 'p', user_id: 'daniel', period_key: '2026-10-02', status: 'in_progress', proof_parts: full },
        {
          id: 'rs',
          user_id: 'daniel',
          period_key: '2026-10-03',
          status: 'ready',
          submitted_at: SUBMITTED_AT,
          proof_parts: full,
        },
      ]);
      expect(days.size).toBe(0);
    });

    it('counts a complete submitted row once', () => {
      const days = officialBoardDaysByUser(officialProofs, [
        {
          id: 's',
          user_id: 'daniel',
          period_key: '2026-10-01',
          status: 'submitted',
          submitted_at: SUBMITTED_AT,
          proof_parts: full,
        },
      ]);
      expect(days.get('daniel')?.map((day) => day.checkinId)).toEqual(['s']);
    });

    it('needs submitted_at as well as the status', () => {
      const days = officialBoardDaysByUser(officialProofs, [
        { id: 's', user_id: 'daniel', period_key: '2026-10-01', status: 'submitted', proof_parts: full },
      ]);
      expect(days.size).toBe(0);
    });

    it('still skips a submitted row with a missing slot', () => {
      const days = officialBoardDaysByUser(officialProofs, [
        {
          id: 's',
          user_id: 'daniel',
          period_key: '2026-10-01',
          status: 'submitted',
          submitted_at: SUBMITTED_AT,
          proof_parts: { pre: full.pre, post: full.post },
        },
      ]);
      expect(days.size).toBe(0);
    });

    it('counts duplicate submitted rows for one day once, and ignores a ready twin', () => {
      const days = officialBoardDaysByUser(officialProofs, [
        { id: 'twin', user_id: 'daniel', period_key: '2026-10-01', status: 'ready', proof_parts: full },
        {
          id: 'a',
          user_id: 'daniel',
          period_key: '2026-10-01',
          status: 'submitted',
          submitted_at: SUBMITTED_AT,
          proof_parts: full,
        },
        {
          id: 'b',
          user_id: 'daniel',
          period_key: '2026-10-01',
          status: 'submitted',
          submitted_at: SUBMITTED_AT,
          proof_parts: full,
        },
      ]);
      expect(days.get('daniel')?.map((day) => day.checkinId)).toEqual(['a']);
    });
  });
});
