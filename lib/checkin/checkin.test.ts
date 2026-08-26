import { describe, expect, it, vi } from 'vitest';

import { checkinCtaTitle } from '@/lib/challengeCheckin';
import { saveCheckinProofWithClient } from '@/lib/checkin/rpc';
import {
  BEFORE_AFTER_HR_PRESET,
  checkinProofsReady,
  extraProofImageUrls,
  partSatisfies,
  parseProofParts,
  proofImageUrls,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import {
  boardProgressLabel,
  checkinStageLabel,
  classifyCheckinError,
  didAdvanceBoard,
  incrementDaysCompleted,
} from '@/lib/checkin';

const officialTrio: ChallengeProof[] = BEFORE_AFTER_HR_PRESET.map((item, index) => ({
  id: `proof-${index + 1}`,
  name: item.name,
  method: item.method,
  minutes: item.minutes,
}));

describe('check-in stages', () => {
  it('uses Begin → Continue → Submit, never log', () => {
    expect(checkinCtaTitle('none')).toBe('Begin');
    expect(checkinCtaTitle('in_progress')).toBe('Continue');
    expect(checkinCtaTitle('ready')).toBe('Submit');
    expect(checkinCtaTitle('submitted')).toBe('Checked in');
    expect(checkinStageLabel('none')).toBe('Begin');
    expect(checkinStageLabel('ready')).toBe('Submit');
  });
});

describe('official weekly proofs', () => {
  it('needs pre-selfie, post-selfie, and heart-rate proof', () => {
    expect(officialTrio).toHaveLength(3);
    expect(officialTrio[0]?.method).toBe('photo');
    expect(officialTrio[1]?.method).toBe('photo');
    expect(officialTrio[2]?.method).toBe('hr');
    expect(checkinProofsReady(officialTrio, {})).toBe(false);
  });

  it('advances 0/N → 1/N only after every image is attached', () => {
    const target = 7;
    const before = 0;
    const empty = parseProofParts({});
    expect(checkinProofsReady(officialTrio, empty)).toBe(false);
    expect(boardProgressLabel(before, target)).toBe('0/7');

    const withImages = parseProofParts({
      'proof-1': { method: 'photo', url: 'https://example.com/pre.jpg' },
      'proof-2': { method: 'photo', url: 'https://example.com/post.jpg' },
      'proof-3': { method: 'hr', url: 'https://example.com/hr.jpg' },
    });
    expect(partSatisfies(officialTrio[0]!, withImages['proof-1'])).toBe(true);
    expect(partSatisfies(officialTrio[1]!, withImages['proof-2'])).toBe(true);
    expect(partSatisfies(officialTrio[2]!, withImages['proof-3'])).toBe(true);
    expect(checkinProofsReady(officialTrio, withImages)).toBe(true);

    const after = incrementDaysCompleted(before, false);
    expect(didAdvanceBoard(before, after)).toBe(true);
    expect(boardProgressLabel(after, target)).toBe('1/7');
  });

  it('blocks a second submit for the same window', () => {
    expect(incrementDaysCompleted(1, true)).toBe(1);
    expect(classifyCheckinError(new Error('ALREADY_LOGGED_TODAY'))).toBe('already');
  });

  it('treats a one-proof send as posted when SQL still wants the full set', () => {
    expect(classifyCheckinError(new Error('MISSING_PROOFS'))).toBe('missing');
    expect(classifyCheckinError(new Error('Add every required proof to submit.'))).toBe('missing');
  });
});

const savedRow = {
  id: 'ck-1',
  user_id: 'u1',
  challenge_id: 'c1',
  period_key: '2026-08-24',
  status: 'in_progress',
  proof_parts: {},
  started_at: '2026-08-24T12:00:00.000Z',
  created_at: '2026-08-24T12:00:00.000Z',
};

describe('check-in composer save', () => {
  it('clears a required proof without uploading', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    const upload = vi.fn();
    await saveCheckinProofWithClient(
      {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        rpc,
      },
      {
        challengeId: 'c1',
        proof: { id: 'pre', name: 'Pre-workout selfie', method: 'photo' },
        clearProof: true,
      },
      upload,
      async () => 'https://example.com/unused.jpg',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'save_checkin_proof',
      expect.objectContaining({
        p_challenge_id: 'c1',
        p_proof_id: 'pre',
        p_proof_part: null,
        p_clear_proof: true,
      }),
    );
  });

  it('reads a urls array and still treats a single url as complete', () => {
    const parts = parseProofParts({
      photo: {
        method: 'photo',
        url: 'https://example.com/one.jpg',
        urls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
      },
    });
    expect(proofImageUrls(parts.photo)).toEqual([
      'https://example.com/one.jpg',
      'https://example.com/two.jpg',
    ]);
    expect(partSatisfies({ id: 'photo', name: 'Photo', method: 'photo' }, parts.photo)).toBe(true);
    expect(
      extraProofImageUrls([{ id: 'photo', name: 'Photo', method: 'photo' }], parts),
    ).toEqual(['https://example.com/two.jpg']);
    expect(proofImageUrls(parseProofParts({ photo: { method: 'photo', url: 'https://old.jpg' } }).photo)).toEqual([
      'https://old.jpg',
    ]);
  });

  it('saves caption and extra media without a new proof part', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    await saveCheckinProofWithClient(
      {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        rpc,
      },
      {
        challengeId: 'c1',
        notes: 'Crushed legs @friend',
        extraMedia: ['https://example.com/cheer.gif'],
      },
      async () => {
        throw new Error('should not upload');
      },
      async () => 'https://example.com/unused.jpg',
    );
    expect(rpc).toHaveBeenCalledWith(
      'save_checkin_proof',
      expect.objectContaining({
        p_notes: 'Crushed legs @friend',
        p_extra_media: ['https://example.com/cheer.gif'],
        p_proof_id: null,
        p_clear_proof: false,
      }),
    );
  });

  it('writes urls onto a photo proof without re-uploading a remote file', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    const upload = vi.fn();
    await saveCheckinProofWithClient(
      {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        rpc,
      },
      {
        challengeId: 'c1',
        proof: { id: 'photo', name: 'Photo', method: 'photo' },
        uri: 'https://example.com/one.jpg',
        urls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
      },
      upload,
      async () => 'https://example.com/unused.jpg',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'save_checkin_proof',
      expect.objectContaining({
        p_proof_id: 'photo',
        p_proof_part: {
          method: 'photo',
          url: 'https://example.com/one.jpg',
          urls: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
          fromLibrary: false,
        },
      }),
    );
  });

  it('stores a Health snapshot on the check-in proof part', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    const health = {
      startedAt: '2026-08-26T13:02:00.000Z',
      endedAt: '2026-08-26T13:41:00.000Z',
      durationSec: 2340,
      activityType: 'running',
      sourceName: 'Apple Watch',
      avgHrBpm: 148,
      maxHrBpm: 172,
    };
    await saveCheckinProofWithClient(
      {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        rpc,
      },
      {
        challengeId: 'c1',
        proof: { id: 'hr', name: 'Heart rate', method: 'hr' },
        uri: 'health:hw-1',
        health,
      },
      async () => {
        throw new Error('should not upload');
      },
      async () => 'https://example.com/unused.jpg',
    );
    expect(rpc).toHaveBeenCalledWith(
      'save_checkin_proof',
      expect.objectContaining({
        p_proof_id: 'hr',
        p_health_workout_id: 'hw-1',
        p_proof_part: {
          method: 'hr',
          url: '',
          healthWorkoutId: 'hw-1',
          health,
        },
      }),
    );
  });
});
