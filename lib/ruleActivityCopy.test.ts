import { describe, expect, it } from 'vitest';

import {
  consistencyHowOftenSentence,
  pointsToWinOf,
  pointsWinRulesSentence,
  pluralizeRuleActivity,
  ruleActivityNoun,
  sumTaskPoints,
} from '@/lib/ruleActivityCopy';

describe('rule activity copy', () => {
  it('falls back to task, never workout', () => {
    expect(ruleActivityNoun('', '')).toBe('task');
    expect(ruleActivityNoun('  ', null)).toBe('task');
    expect(ruleActivityNoun('Bible reading', 'workout')).toBe('Bible reading');
    expect(pluralizeRuleActivity('', 20)).toBe('tasks');
    expect(pluralizeRuleActivity('task', 20)).toBe('tasks');
    expect(pluralizeRuleActivity('Bible reading', 20)).toBe('Bible readings');
    expect(pluralizeRuleActivity('workout', 6)).toBe('workouts');
  });

  it('writes Consistency How often with the named activity or tasks', () => {
    expect(
      consistencyHowOftenSentence({
        task: '',
        rule_activity: '',
        target_count: '20',
        frequency: 'weekly',
      }),
    ).toBe('Competitors must check in 20 tasks every week for the duration of the challenge.');
    expect(
      consistencyHowOftenSentence({
        task: 'Bible reading',
        rule_activity: 'workout',
        target_count: '20',
        frequency: 'weekly',
      }),
    ).toBe('Competitors must check in 20 Bible readings every week for the duration of the challenge.');
  });

  it('builds Points-to-win copy from the task list, not a weekly cadence', () => {
    const tasks = [
      { title: 'Unload dishwasher', points: '1' },
      { title: 'Bible reading', points: '2' },
    ];
    expect(sumTaskPoints(tasks)).toBe(3);
    expect(pointsToWinOf({ tasks })).toBe(3);
    expect(pointsToWinOf({ points_to_win: '10', tasks })).toBe(10);
    expect(pointsWinRulesSentence({ tasks })).toBe(
      'Win by reaching 3 points. Tasks: Unload dishwasher; Bible reading.',
    );
    expect(pointsWinRulesSentence({ tasks })).not.toMatch(/week|workout/i);
  });
});
