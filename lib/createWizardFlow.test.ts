import { describe, expect, it } from 'vitest';

import { nextCreateItemId } from '@/lib/createItemIds';
import {
  nextCreateWizardStep,
  prevCreateWizardStep,
  rulesStepIsReady,
  seedPointsTasksFromGoal,
  shouldSkipScoringStep,
  stripBlankExtraRules,
  stripBlankExtraTasks,
} from '@/lib/createWizardFlow';

const PRIZE = 5;
const FUNDING = 7;

const blankTask = {
  id: 'task-1',
  title: '',
  points: '',
  proof_required: true,
  proofs: ['photo'] as ['photo'],
  once: false,
};

describe('create wizard flow', () => {
  it('reuses existing item ids instead of minting Date.now keys', () => {
    expect(nextCreateItemId('task', 'task-keep')).toBe('task-keep');
    expect(nextCreateItemId('rule', 'rule-keep')).toBe('rule-keep');
    expect(nextCreateItemId('task')).not.toBe(nextCreateItemId('task'));
  });

  it('seeds Points Task 1 from the Goal task and 1 point when blank', () => {
    const seeded = seedPointsTasksFromGoal({
      challenge_type: 'points',
      task: 'Pray for somebody…',
      tasks: [blankTask],
    });
    expect(seeded?.[0]?.title).toBe('Pray for somebody…');
    expect(seeded?.[0]?.points).toBe('1');
    expect(seeded?.[0]?.id).toBe('task-1');
  });

  it('does not invent a second Points task', () => {
    const seeded = seedPointsTasksFromGoal({
      challenge_type: 'points',
      task: 'Pray for somebody…',
      tasks: [{ ...blankTask, title: 'Pray for somebody…', points: '3' }],
    });
    expect(seeded).toBeNull();
  });

  it('drops blank and 1-character extra rules so Next is not blocked', () => {
    expect(
      stripBlankExtraRules([
        { id: 'a', text: '' },
        { id: 'b', text: 'x' },
        { id: 'c', text: 'No phones' },
      ]),
    ).toEqual([{ id: 'c', text: 'No phones' }]);
  });

  it('drops unnamed extra tasks', () => {
    expect(
      stripBlankExtraTasks([
        { id: 'a', title: '' },
        { id: 'b', title: 'Read 10 pages' },
      ]),
    ).toEqual([{ id: 'b', title: 'Read 10 pages' }]);
  });

  it('skips Scoring unless comparable points is on or the editor was opened', () => {
    expect(shouldSkipScoringStep({ scoring_method: null }, false)).toBe(true);
    expect(shouldSkipScoringStep({ scoring_method: 'comparable_points' }, false)).toBe(false);
    expect(shouldSkipScoringStep({ scoring_method: null }, true)).toBe(false);
    expect(nextCreateWizardStep(PRIZE, { scoring_method: null }, false)).toBe(FUNDING);
    expect(prevCreateWizardStep(FUNDING, { scoring_method: null }, false)).toBe(PRIZE);
  });

  it('lets Rules Next pass for Points with only the Goal task and no extra constraint', () => {
    expect(
      rulesStepIsReady({
        challenge_type: 'points',
        duration_type: 'fixed',
        task: 'Pray for somebody…',
        tasks: [{ ...blankTask, title: 'Pray for somebody…', points: '1' }],
        target_count: '6',
        rule_activity: 'workout',
        frequency: 'weekly',
      }),
    ).toBe(true);
  });

  it('lets Rules Next pass for Consistency with the default cadence and no extra constraint', () => {
    expect(
      rulesStepIsReady({
        challenge_type: 'consistency',
        duration_type: 'fixed',
        task: 'Run 1 mile',
        tasks: [blankTask],
        target_count: '6',
        rule_activity: 'Run 1 mile',
        frequency: 'weekly',
      }),
    ).toBe(true);
  });
});
