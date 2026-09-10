import { describe, expect, it } from 'vitest';

import { CHECKIN_REACH_STAY, CHECKIN_UPLOAD_STAY } from '@/lib/checkin/errors';
import { getCheckinSubmitMessage, withFailureReason } from '@/utils/errors';

describe('what the submit banner says', () => {
  it('keeps the friendly line for the cases it recognises', () => {
    expect(getCheckinSubmitMessage(new Error('ALREADY_LOGGED_TODAY'))).toBe(
      'Already checked in today. Come back tomorrow.',
    );
    expect(getCheckinSubmitMessage(new Error('MISSING_PROOFS'))).toBe(
      'Add every required proof to submit.',
    );
    expect(getCheckinSubmitMessage(new Error('NOT_PARTICIPANT'))).toBe(
      'Join this challenge before you check in.',
    );
  });

  it('carries the real reason for anything it does not recognise', () => {
    // A Send that fails has to say why. "Try again" on its own is indistinguishable from a dead
    // button, and leaves Daniel nothing to report.
    const message = getCheckinSubmitMessage(
      new Error('null value in column "period_key" violates not-null constraint'),
    );
    expect(message).toContain('Couldn’t submit this check-in.');
    expect(message).toContain('period_key');
  });

  it('carries the reason out of a PostgREST-shaped error object too', () => {
    const message = getCheckinSubmitMessage({
      message: 'permission denied for table challenge_checkins',
      details: null,
      code: '42501',
    });
    expect(message).toContain('permission denied for table challenge_checkins');
  });

  it('does not print Load failed on Safari abort', () => {
    expect(getCheckinSubmitMessage(new TypeError('Load failed'))).toBe(CHECKIN_REACH_STAY);
    expect(getCheckinSubmitMessage(new TypeError('Failed to fetch'))).toBe(CHECKIN_REACH_STAY);
    expect(getCheckinSubmitMessage(new Error('Network request failed'))).toBe(CHECKIN_REACH_STAY);
    expect(getCheckinSubmitMessage(new TypeError('Load failed'))).not.toContain('(');
    expect(getCheckinSubmitMessage(new TypeError('Load failed'))).not.toContain('Load failed');
  });

  it('uses the stay-photo line for a storage upload fault', () => {
    expect(getCheckinSubmitMessage(new Error('Couldn’t save that proof'))).toBe(CHECKIN_UPLOAD_STAY);
  });

  it('still says something when the error carries no message at all', () => {
    expect(getCheckinSubmitMessage(null)).toBe('Couldn’t submit this check-in. Try again.');
    expect(getCheckinSubmitMessage({})).toBe('Couldn’t submit this check-in. Try again.');
    expect(getCheckinSubmitMessage(new Error(''))).toBe('Couldn’t submit this check-in. Try again.');
  });

  it('never returns an empty string, which would render as no banner', () => {
    for (const input of [null, undefined, {}, '', new Error(''), 'boom', { message: 'boom' }]) {
      expect(getCheckinSubmitMessage(input).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('the reassuring line an upload failure shows', () => {
  it('keeps the reassurance and adds why it failed', () => {
    // The upload branch used to show only "your photo is saved", which hid a storage error behind
    // copy about the photo being safe.
    const message = withFailureReason('Your photo is saved to Photos. Try Submit again.', {
      message: 'storage/object-too-large',
    });
    expect(message).toContain('Your photo is saved to Photos.');
    expect(message).toContain('storage/object-too-large');
  });

  it('leaves the line alone when there is nothing to add', () => {
    expect(withFailureReason('Saved to Photos.', null)).toBe('Saved to Photos.');
    expect(withFailureReason('Saved to Photos.', new Error(''))).toBe('Saved to Photos.');
  });

  it('does not repeat a reason the line already states', () => {
    expect(withFailureReason('Network request failed', new Error('Network request failed'))).toBe(
      'Network request failed',
    );
  });
});
