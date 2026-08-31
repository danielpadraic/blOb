import { describe, expect, it } from 'vitest';

import {
  canWaveProof,
  clampProofCaption,
  mediaCaptionsForUrls,
  prefsFromProfile,
  proofCaptionCounter,
} from '@/lib/checkinShare';

describe('check-in proof captions', () => {
  it('caps at 180 and shows a counter from 160', () => {
    expect(clampProofCaption('x'.repeat(200)).length).toBe(180);
    expect(proofCaptionCounter('x'.repeat(159))).toBeNull();
    expect(proofCaptionCounter('x'.repeat(160))).toBe('160/180');
    expect(proofCaptionCounter('x'.repeat(180))).toBe('180/180');
  });

  it('maps each proof caption onto its own media url', () => {
    const captions = mediaCaptionsForUrls(
      ['https://cdn/pre.jpg', 'https://cdn/after.jpg'],
      [
        { id: 'pre', name: 'Pre-workout', method: 'photo' },
        { id: 'after', name: 'After', method: 'photo' },
      ],
      {
        pre: { method: 'photo', url: 'https://cdn/pre.jpg', caption: 'Lacing up' },
        after: { method: 'photo', url: 'https://cdn/after.jpg', caption: 'Done' },
      },
      {},
    );
    expect(captions).toEqual(['Lacing up', 'Done']);
  });
});

describe('check-in share prefs', () => {
  it('defaults Home and Wave off when unset', () => {
    expect(prefsFromProfile(null)).toEqual({ home: false, wave: false });
    expect(prefsFromProfile({})).toEqual({ home: false, wave: false });
    expect(prefsFromProfile({ checkin_share_home: true, checkin_share_wave: false })).toEqual({
      home: true,
      wave: false,
    });
  });

  it('allows Wave for photo and short video only', () => {
    expect(canWaveProof({ method: 'photo', uri: 'file://selfie.jpg' })).toBe(true);
    expect(canWaveProof({ method: 'video', uri: 'file://clip.mp4', durationMs: 29_000 })).toBe(true);
    expect(canWaveProof({ method: 'video', uri: 'file://clip.mp4', durationMs: 30_001 })).toBe(false);
    expect(canWaveProof({ method: 'photo', uri: 'health:abc' })).toBe(false);
  });
});
