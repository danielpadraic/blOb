import { describe, expect, it } from 'vitest';
import { pointsProofTypeForPublish } from '@/lib/challengeCreatePublish';

function task(proofTypes?: string[], required = true) {
  return {
    id: 'task-1',
    title: 'Pray for somebody',
    points: 10,
    once: false,
    proof_required: required,
    proof_types: proofTypes,
  } as never;
}

describe('pointsProofTypeForPublish', () => {
  it('echoes the photo the host picked so Overview and check-in agree', () => {
    expect(pointsProofTypeForPublish([task(['photo', 'text_note'])])).toBe('photo');
  });

  it('does not claim a camera when the host only asked for a note', () => {
    expect(pointsProofTypeForPublish([task(['text_note'])])).toBe('check_in');
  });

  it('falls back to honor when no task needs proof', () => {
    expect(pointsProofTypeForPublish([task(undefined, false)])).toBe('honor');
  });

  it('prefers the strongest proof across several tasks', () => {
    expect(pointsProofTypeForPublish([task(['text_note']), task(['video'])])).toBe('video');
  });
});
