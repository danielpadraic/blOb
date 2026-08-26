import { describe, expect, it } from 'vitest';

import { DEFAULT_CREATE_VALUES, wizardStepIndex } from '@/lib/challengeTemplates';
import {
  hydrateDraftValues,
  parseChallengeDraft,
  parseStoredWizardStep,
  resumeWizardStep,
} from '@/lib/challengeDraft';
import { emptyExtraCreateTask } from '@/utils/validators';

describe('challenge drafts', () => {
  it('round-trips title, task, extra_tasks, proofs, buy_in, host_budget, points tasks, and privacy_mode', () => {
    const extra = { ...emptyExtraCreateTask('xtask-1'), title: 'Journal tonight' };
    const values = {
      ...DEFAULT_CREATE_VALUES,
      title: 'Pray week',
      task: 'Pray for somebody',
      extra_tasks: [extra],
      proofs: ['photo' as const],
      buy_in: '5',
      host_budget: '25',
      host_funded: true,
      challenge_type: 'points' as const,
      privacy_mode: 'private' as const,
      tasks: [
        {
          id: 'task-1',
          title: 'Finish a 5K',
          points: '10',
          proof_required: true,
          proofs: ['photo' as const],
          once: false,
        },
      ],
    };
    const again = hydrateDraftValues(values);
    expect(again.title).toBe('Pray week');
    expect(again.task).toBe('Pray for somebody');
    expect(again.extra_tasks?.[0]?.title).toBe('Journal tonight');
    expect(again.proofs).toEqual(['photo']);
    expect(again.buy_in).toBe('5');
    expect(again.host_budget).toBe('25');
    expect(again.tasks[0]?.title).toBe('Finish a 5K');
    expect(again.privacy_mode).toBe('private');
  });

  it('sets createMode simple when payload.create_mode or payload.simple is set', () => {
    const fromMode = parseChallengeDraft('user-1', {
      payload: {
        create_mode: 'simple',
        title: 'Morning walk',
        task: 'Walk',
      },
    });
    expect(fromMode.createMode).toBe('simple');

    const fromSimple = parseChallengeDraft('user-1', {
      payload: {
        title: 'Lift club',
        simple: {
          title: 'Lift club',
          task: 'Lift',
          currency: 'bucks',
          buy_in: 0,
          host_budget: 40,
        },
      },
    });
    expect(fromSimple.createMode).toBe('simple');
    expect(fromSimple.simple?.title).toBe('Lift club');
    expect(fromSimple.simple?.host_budget).toBe(40);
  });

  it('restores the stored step without bumping it', () => {
    const rules = wizardStepIndex('rules');
    expect(parseStoredWizardStep(rules, 'rules')).toBe(rules);
    expect(parseStoredWizardStep(rules)).toBe(rules);
    expect(parseStoredWizardStep(9)).toBe(9);
    expect(
      resumeWizardStep({
        step: rules,
        values: { ...DEFAULT_CREATE_VALUES, title: 'Pray week' },
      }),
    ).toBe(rules);
  });
});
