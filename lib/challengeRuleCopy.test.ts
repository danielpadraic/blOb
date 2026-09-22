import { describe, expect, it } from 'vitest';

import {
  challengeRuleCopy,
  challengeSignupLines,
  hostAuthoredRuleParagraphs,
  usesHostAuthoredRules,
} from '@/lib/challengeRuleCopy';
import { nobodyFinishedRuleCopy } from '@/lib/settlement/receipts';

const pinnacle = {
  title: 'Rookies vs. Veterans',
  description: 'Compete in the Pinnacle Core September Rookies vs. Veterans Challenge',
  rules:
    'Team with the most points is winner of September Rookies vs. Veterans.\nOverall High Scorer wins the Prize (see KC for Prize details)!',
  task: 'Rookies vs. Veterans',
  challenge_type: 'points',
  scoring_method: 'comparable_points',
  target_count: 5,
  days_required: 4,
  prize_pool: 0,
  buy_in_amount: 0,
  host_funded: true,
  host_budget: 0,
  creator_contribution: 0,
  privacy_mode: 'private_corporate',
  proofs: [{ id: 'honor', name: 'Confirm on your honor that you did the work.', method: 'honor' }],
  tasks: [],
} as const;

describe('Overview signup + rules', () => {
  it('prints the stored description, not an honor sentence', () => {
    expect(challengeSignupLines(pinnacle)).toEqual([
      'Compete in the Pinnacle Core September Rookies vs. Veterans Challenge',
    ]);
    expect(challengeSignupLines(pinnacle).join(' ')).not.toMatch(/honor/i);
  });

  it('prints stored rules and never Win by reaching 5 points', () => {
    const copy = challengeRuleCopy(pinnacle);
    expect(copy.primary).toBe('Team with the most points is winner of September Rookies vs. Veterans.');
    expect(copy.extras).toEqual(['Overall High Scorer wins the Prize (see KC for Prize details)!']);
    expect(hostAuthoredRuleParagraphs(pinnacle)).toEqual([
      'Team with the most points is winner of September Rookies vs. Veterans.',
      'Overall High Scorer wins the Prize (see KC for Prize details)!',
    ]);
    expect(usesHostAuthoredRules(pinnacle)).toBe(true);
    expect([copy.primary, ...copy.extras].join(' ')).not.toMatch(/Win by reaching 5 points/i);
    expect([copy.primary, ...copy.extras].join(' ')).not.toMatch(/honor/i);
  });

  it('does not invent a points-to-win line from target_count on comparable_points', () => {
    const copy = challengeRuleCopy({
      challenge_type: 'points',
      scoring_method: 'comparable_points',
      target_count: 5,
      days_required: 5,
      task: 'Rookies vs. Veterans',
      proofs: [{ id: 'honor', name: 'Confirm on your honor that you did the work.', method: 'honor' }],
    });
    expect(copy.primary).toBeNull();
    expect(copy.primary ?? '').not.toMatch(/Win by reaching/);
  });

  it('still invents points-to-win for a classic task-points room with no stored rules', () => {
    const copy = challengeRuleCopy({
      challenge_type: 'points',
      target_count: 12,
      tasks: [
        { title: 'Unload dishwasher', points: 1 },
        { title: 'Bible reading', points: 2 },
      ],
    });
    expect(copy.primary).toBe('Win by reaching 12 points. Tasks: Unload dishwasher; Bible reading.');
  });
});

describe('nobody-finished forfeit line', () => {
  it('hides the host-return line when the prize is $0', () => {
    expect(
      nobodyFinishedRuleCopy({
        hostFunded: true,
        hostBudget: 0,
        prize_pool: 0,
        buy_in_amount: 0,
        scoring_method: 'comparable_points',
        privacy_mode: 'private_corporate',
      }),
    ).toBeNull();
  });
});
