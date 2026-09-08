import { describe, expect, it } from 'vitest';

import {
  challengeProofObjectPath,
  hasUsableHealthMetrics,
  hasUsablePostStats,
  isOcrBackfillSlot,
  isVendorHealthSlot,
  isVideoStillUrl,
  pickOcrBackfillSlot,
  pickStillUrl,
} from '@/lib/health/ocrBackfill';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('OCR backfill slot picker', () => {
  const hr = { method: 'hr' as const, url: 'https://x.supabase.co/storage/v1/object/sign/challenge-proofs/a.jpg' };

  it('accepts an HR screenshot with no health snapshot', () => {
    expect(isOcrBackfillSlot(hr)).toBe(true);
  });

  it('skips HealthKit and Health Connect', () => {
    expect(
      isOcrBackfillSlot({
        ...hr,
        health: { source: 'healthkit', activityType: 'running', sourceName: 'Apple Watch', durationSec: 600 },
      }),
    ).toBe(false);
    expect(
      isOcrBackfillSlot({
        ...hr,
        health: { source: 'health_connect', activityType: 'running', sourceName: 'Watch', durationSec: 600 },
      }),
    ).toBe(false);
  });

  it('skips a generated workout card', () => {
    expect(isOcrBackfillSlot({ ...hr, healthWorkoutId: 'w1' })).toBe(false);
  });

  it('skips a selfie slot', () => {
    expect(isOcrBackfillSlot({ ...hr, method: 'photo' })).toBe(false);
  });

  it('skips video', () => {
    expect(isVideoStillUrl('https://x/a.mov')).toBe(true);
    expect(isOcrBackfillSlot({ ...hr, url: 'https://x/a.mp4' })).toBe(false);
  });

  it('skips a slot that already has OCR numbers', () => {
    expect(
      isOcrBackfillSlot({
        ...hr,
        health: { source: 'ocr', activityType: 'other', sourceName: 'Workout screenshot', avgHrBpm: 142 },
      }),
    ).toBe(false);
  });

  it('treats a clocked snapshot with no source as vendor, not a screenshot', () => {
    expect(
      isVendorHealthSlot({
        health: { startedAt: '2026-09-01T12:00:00.000Z', endedAt: '2026-09-01T12:40:00.000Z' },
      }),
    ).toBe(true);
  });

  it('does not treat empty post stats as a recap', () => {
    expect(hasUsablePostStats(null)).toBe(false);
    expect(hasUsablePostStats({ pronoun: 'he' } as never)).toBe(false);
    expect(hasUsablePostStats({ hr_avg: 142 })).toBe(true);
    expect(hasUsableHealthMetrics({ avgHrBpm: 142 })).toBe(true);
  });

  it('prefers the slot url, then urls[0]', () => {
    expect(pickStillUrl({ url: '', urls: ['https://x/b.jpg'] })).toBe('https://x/b.jpg');
    expect(pickStillUrl({ url: '', urls: [{ url: 'https://x/c.jpg' }] })).toBe('https://x/c.jpg');
  });

  it('only signs objects on this project’s proofs bucket', () => {
    const project = 'https://tguzdtwsajnnczdxjqyq.supabase.co';
    expect(
      challengeProofObjectPath(`${project}/storage/v1/object/sign/challenge-proofs/u/a.jpg?token=x`, project),
    ).toBe('u/a.jpg');
    expect(challengeProofObjectPath(`${project}/storage/v1/object/sign/avatars/u.jpg`, project)).toBeNull();
  });
});

describe('SQL report is list-only', () => {
  it('does not write', () => {
    const sql = readFileSync(resolve('scripts/ocr-backfill-candidates.sql'), 'utf8');
    expect(sql).not.toMatch(/\b(update|delete|insert|truncate)\b/i);
    expect(sql).not.toMatch(/\bp\.kind\b/);
    expect(sql).toMatch(/\)\s*,\s*slot_rows AS/);
  });
});

describe('backfill RPC is service-role and photo-locked', () => {
  it('does not grant writes to the public and never clears a proof photo', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/20260908170000_backfill_ocr_checkin_health.sql'),
      'utf8',
    );
    expect(sql).toMatch(/grant execute on function public\.backfill_ocr_checkin_health\(uuid, text, jsonb\) to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.backfill_ocr_checkin_health\(uuid, text, jsonb\) from public/i);
    expect(sql).toMatch(/revoke all on function public\.backfill_ocr_checkin_health\(uuid, text, jsonb\) from anon/i);
    expect(sql).toMatch(/revoke all on function public\.backfill_ocr_checkin_health\(uuid, text, jsonb\) from authenticated/i);
    const body = sql.replace(/--[^\n]*/g, '');
    expect(body).not.toMatch(/write_coin_ledger/);
    expect(body).not.toMatch(/p_clear_proof/);
    expect(sql).toMatch(/PROOF_URL_LOCKED/);
    expect(sql).toMatch(/HAS_VENDOR/);
    expect(sql).toMatch(/source', ''\) is distinct from 'ocr'/);
  });
});

describe('pickOcrBackfillSlot', () => {
  const screenshot = 'https://tguzdtwsajnnczdxjqyq.supabase.co/storage/v1/object/sign/challenge-proofs/a.jpg';
  const challenge = {
    category: 'fitness' as const,
    proofs: [{ id: 'p_hr', method: 'hr' as const, name: 'Heart rate' }],
  };

  it('picks an HR screenshot with no stats', () => {
    expect(
      pickOcrBackfillSlot({
        challenge,
        proofs: challenge.proofs,
        parts: { p_hr: { method: 'hr', url: screenshot } },
        postStats: null,
      }),
    ).toEqual({ slotId: 'p_hr', url: screenshot, method: 'hr' });
  });

  it('skips HealthKit and a post that already has chips', () => {
    expect(
      pickOcrBackfillSlot({
        challenge,
        proofs: challenge.proofs,
        parts: {
          p_hr: {
            method: 'hr',
            url: screenshot,
            health: { source: 'healthkit', activityType: 'running', sourceName: 'Watch', durationSec: 600 },
          },
        },
      }),
    ).toBeNull();
    expect(
      pickOcrBackfillSlot({
        challenge,
        proofs: challenge.proofs,
        parts: { p_hr: { method: 'hr', url: screenshot } },
        postStats: { duration_sec: 600 },
      }),
    ).toBeNull();
  });

  it('skips a selfie-only check-in', () => {
    expect(
      pickOcrBackfillSlot({
        challenge: { category: 'fitness', proofs: [{ id: 'p_photo', method: 'photo', name: 'Selfie' }] },
        proofs: [{ id: 'p_photo', method: 'photo' }],
        parts: { p_photo: { method: 'photo', url: screenshot } },
      }),
    ).toBeNull();
  });
});
