import { describe, expect, it } from 'vitest';

import { DEFAULT_CREATE_VALUES, wizardStepIndex } from '@/lib/challengeTemplates';
import {
  clampDraftStep,
  draftPersistPayload,
  hydrateDraftValues,
  isDraftWorthSaving,
  isVisibleDraft,
  parseChallengeDraft,
  parseStoredWizardStep,
  resumeDraftForm,
  resumeWizardStep,
  valuesFromChallenge,
} from '@/lib/challengeDraft';
import { emptyChallengeTask, emptyExtraCreateTask } from '@/utils/validators';

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

  it('saveChallengeDraft payload keeps Dawn run, Hill repeats, and step 9', () => {
    const values = {
      ...DEFAULT_CREATE_VALUES,
      title: 'Dawn run',
      challenge_type: 'points' as const,
      tasks: [{ ...emptyChallengeTask('task-1'), title: 'Hill repeats', points: '10' }],
    };
    const draft = {
      id: 'draft-dawn',
      userId: 'user-1',
      title: values.title.trim() || 'Untitled draft',
      step: 9,
      startPath: 'scratch' as const,
      templateId: null,
      sourceChallengeId: null,
      values,
      createMode: 'advanced' as const,
      startPreset: 'hour' as const,
      updatedAt: new Date().toISOString(),
    };
    const row = {
      id: draft.id,
      title: draft.title,
      payload: draftPersistPayload(hydrateDraftValues(values), draft),
    };
    const parsed = parseChallengeDraft('user-1', row);
    expect(parsed.values.title).toBe('Dawn run');
    expect(parsed.values.tasks[0]?.title).toBe('Hill repeats');
    expect(parsed.step).toBe(9);

    const applied = resumeDraftForm(parsed);
    expect(applied.values.title).toBe('Dawn run');
    expect(applied.values.tasks[0]?.title).toBe('Hill repeats');
    expect(applied.step).toBe(9);
    expect(applied.step).toBe(clampDraftStep(9));
    expect(applied.values).not.toEqual(DEFAULT_CREATE_VALUES);
    expect(applied.step).not.toBe(wizardStepIndex('goal'));
  });

  it('reads form fields from a double-wrapped payload even when the row title is set', () => {
    const parsed = parseChallengeDraft('user-1', {
      id: 'draft-wrap',
      title: 'Dawn run',
      payload: {
        values: {
          title: '',
          description: 'Sunrise miles',
          task: 'Run the hill',
          challenge_type: 'points',
          tasks: [{ ...emptyChallengeTask('task-1'), title: 'Hill repeats', points: '8' }],
          proofs: ['photo'],
        },
      },
    });
    expect(parsed.title).toBe('Dawn run');
    expect(parsed.values.title).toBe('Dawn run');
    expect(parsed.values.description).toBe('Sunrise miles');
    expect(parsed.values.task).toBe('Run the hill');
    expect(parsed.values.tasks[0]?.title).toBe('Hill repeats');
    expect(parsed.values.proofs).toEqual(['photo']);
  });

  it('counts a titled Simple form as worth saving', () => {
    expect(
      isDraftWorthSaving({
        step: wizardStepIndex('goal'),
        startPath: 'scratch',
        values: DEFAULT_CREATE_VALUES,
        simple: { title: 'Morning miles', task: 'Run 1 mile' } as never,
      }),
    ).toBe(true);
  });

  it('hides empty id-only rows that have a step but no title or edits', () => {
    const empty = parseChallengeDraft('user-1', {
      id: 'draft-empty',
      title: '',
      payload: { step: 9, step_key: 'rules', create_mode: 'advanced' },
    });
    expect(empty.id).toBe('draft-empty');
    expect(isVisibleDraft(empty)).toBe(false);
  });
});

describe('valuesFromChallenge', () => {
  it('hydrates Pinnacle start/end, host-out, and comparable sides without a 7-day default', () => {
    const values = valuesFromChallenge({
      id: '16af3e82-15c0-479f-af52-328440b0c87e',
      title: 'Rookies vs. Veterans',
      description: 'Pinnacle week',
      task: 'Honor log',
      rules: 'Daily honor',
      timezone: 'America/Chicago',
      starts_at: '2026-09-22T05:00:00.000Z',
      ends_at: '2026-09-26T04:59:59.000Z',
      creator_participating: false,
      host_rigor: 'friendly',
      privacy_mode: 'private_corporate',
      visibility: 'invite',
      frequency: 'daily',
      scoring_method: 'comparable_points',
      scoring_config: {
        version: 1,
        parity_points: 13_000,
        window: 'challenge',
        extras_keep_adding: true,
        lanes: [
          { id: 'rookie', name: 'Rookie', activities: ['act-dials', 'act-ap'] },
          { id: 'veteran', name: 'Veteran', activities: ['act-ap'] },
        ],
        activities: [
          { id: 'act-dials', name: 'Dials', unit: 'dials', parity_qty: 3500, input_kind: 'count' },
          { id: 'act-ap', name: 'AP', unit: 'USD', parity_qty: 13_000, input_kind: 'money' },
        ],
        text_fields: [{ id: 'details', label: 'Details' }],
      },
      sponsor_name: 'Pinnacle Life Group',
    } as never);

    expect(values.title).toBe('Rookies vs. Veterans');
    expect(values.timezone).toBe('America/Chicago');
    expect(values.starts_at).toBe('2026-09-22T05:00:00.000Z');
    expect(values.ends_at).toBe('2026-09-26T04:59:59.000Z');
    expect(values.end_mode).toBe('date');
    expect(values.creator_participating).toBe(false);
    expect(values.host_rigor).toBe('friendly');
    expect(values.privacy_mode).toBe('private_corporate');
    expect(values.sponsor_name).toBe('Pinnacle Life Group');
    expect(values.scoring_method).toBe('comparable_points');
    const scoring = values.scoring_config as {
      window?: string;
      extras_keep_adding?: boolean;
      lanes?: Array<{ name: string; activities?: string[] }>;
      text_fields?: Array<{ label: string }>;
    };
    expect(scoring.window).toBe('challenge');
    expect(scoring.extras_keep_adding).toBe(true);
    expect(scoring.lanes?.map((lane) => lane.name)).toEqual(['Rookie', 'Veteran']);
    expect(scoring.text_fields?.[0]?.label).toBe('Details');
  });
});
