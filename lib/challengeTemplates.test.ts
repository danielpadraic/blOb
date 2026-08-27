import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CREATE_VALUES,
  challengeContractRows,
  challengeReviewSections,
  missesAllowedForPublish,
  missesAllowedReviewLine,
  wizardMeans,
} from '@/lib/challengeTemplates';
import { emptyChallengeTask } from '@/utils/validators';

describe('Points misses', () => {
  const leftoverMisses = {
    ...DEFAULT_CREATE_VALUES,
    challenge_type: 'points' as const,
    duration_type: 'fixed' as const,
    misses_allowed: '3',
    title: 'Points race',
  };

  const consistencyMisses = {
    ...DEFAULT_CREATE_VALUES,
    challenge_type: 'consistency' as const,
    duration_type: 'fixed' as const,
    misses_allowed: '2',
    title: 'Show up',
  };

  it('publishes Points with 0 misses even if the stepper leftover is higher', () => {
    expect(missesAllowedForPublish(leftoverMisses)).toBe(0);
    expect(missesAllowedForPublish(consistencyMisses)).toBe(2);
    expect(missesAllowedReviewLine(leftoverMisses)).toBeNull();
    expect(missesAllowedReviewLine(consistencyMisses)).toBe('2 misses allowed');
  });

  it('omits misses from Points review, contract, and Entry means', () => {
    const review = challengeReviewSections(leftoverMisses)
      .map((row) => `${row.title} ${row.body}`)
      .join('\n');
    const contract = challengeContractRows(leftoverMisses)
      .map((row) => `${row.label} ${row.body}`)
      .join('\n');
    const entryMeans = wizardMeans(8, leftoverMisses, null);

    expect(review.toLowerCase()).not.toMatch(/miss/);
    expect(contract.toLowerCase()).not.toMatch(/miss/);
    expect(entryMeans.toLowerCase()).not.toMatch(/miss/);
  });

  it('keeps misses on Consistency contract and Entry means', () => {
    const contract = challengeContractRows(consistencyMisses).find((row) => row.label === 'Misses allowed');
    const entryMeans = wizardMeans(8, consistencyMisses, null);

    expect(contract?.body).toBe('2 misses allowed');
    expect(entryMeans.toLowerCase()).toContain('2 misses allowed');
  });
});

describe('Points-to-win copy', () => {
  const chores = {
    ...DEFAULT_CREATE_VALUES,
    challenge_type: 'points' as const,
    duration_type: 'fixed' as const,
    task: '',
    rule_activity: '',
    target_count: '20',
    frequency: 'weekly' as const,
    points_to_win: '12',
    tasks: [
      { ...emptyChallengeTask(), title: 'Unload dishwasher', points: '1' },
      { ...emptyChallengeTask(), title: 'Bible reading', points: '2' },
    ],
  };

  it('reviews and contracts Points as a win total, never a weekly workout cadence', () => {
    const review = challengeReviewSections(chores)
      .map((row) => `${row.title} ${row.body}`)
      .join('\n');
    const contract = challengeContractRows(chores)
      .map((row) => `${row.label} ${row.body}`)
      .join('\n');

    expect(review).toContain('Win by reaching 12 points. Tasks: Unload dishwasher; Bible reading.');
    expect(contract).toContain('Win by reaching 12 points. Tasks: Unload dishwasher; Bible reading.');
    expect(`${review}\n${contract}`).not.toMatch(/workout|every week/i);
  });
});
