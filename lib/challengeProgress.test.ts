import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { milesToMeters } from '@/lib/distance';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import { buildPulsePills } from '@/lib/homePulse';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { simpleDraftToCreateValues, defaultSimpleDraft } from '@/lib/simpleChallenge';
import {
  challengeProgressLine,
  editFormatFromChallenge,
  goalFieldsForSave,
} from '@/lib/challengeProgress';

describe('shared progress line', () => {
  it('prints Run 128 as miles on Home and Overview', () => {
    const run128 = {
      challenge_type: 'cumulative',
      format: 'cumulative',
      metrics: [{ id: 'm1', name: 'miles', unit: 'mi' as const, target: 128 }],
      duration_days: 127,
      days_required: 127,
      title: 'Run 128 Miles by January 1',
    };
    expect(challengeProgressLine(run128, { distanceMetersCompleted: 0 }, 'overview')).toBe('0 / 128 mi');
    expect(challengeProgressLine(run128, { distanceMetersCompleted: 10026 }, 'rail')).toBe('6.23 / 128 mi');
    expect(challengeGoalLabel(run128, { distanceMetersCompleted: 0 })).toBe('0 / 128 mi');
    const pills = buildPulsePills({
      challenges: [{ ...run128, id: 'run', status: 'live', joined: true }],
      posts: [
        {
          challenge_id: 'run',
          source: 'checkin',
          author_id: 'a1',
          created_at: '2026-09-26T17:00:00.000Z',
        },
      ],
      profiles: [{ id: 'a1', display_name: 'Daniel', username: 'dh', avatar_url: null }],
      relative: () => '4m ago',
    });
    expect(pills[0]?.activityLine).toBe('0 / 128 mi');
  });

  it('prints a 30-day room as days, including when someone just checked in', () => {
    const room = {
      id: 'thirty',
      status: 'live',
      joined: true,
      title: '30-Day Consistency',
      challenge_type: 'consistency',
      format: 'consistency',
      duration_days: 30,
      ends_at: '2026-08-07T09:00:00.000Z',
    };
    expect(challengeProgressLine(room, { daysCompleted: 4 }, 'overview')).toBe('4 / 30 days');
    expect(challengeGoalLabel(room, { daysCompleted: 4 })).toBe('4 / 30 days');
    expect(joinedProgressCopy(room, 4).label).toBe('4 / 30 days');
    const pills = buildPulsePills({
      challenges: [{ ...room, ends_at: '2026-12-01T09:00:00.000Z' }],
      posts: [
        {
          challenge_id: 'thirty',
          source: 'checkin',
          author_id: 'a1',
          created_at: '2026-09-26T17:00:00.000Z',
        },
      ],
      profiles: [{ id: 'a1', display_name: 'Daniel', username: 'dh', avatar_url: null }],
      progress: { thirty: { done: 4, target: 30 } },
      relative: () => '4m ago',
    });
    expect(pills[0]?.activityLine).toBe('4 / 30 days');
  });

  it('shows 0 / 50 km on a brand-new simple distance challenge', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Autumn ride';
    draft.scoring = 'cumulative';
    draft.distance_unit = 'km';
    draft.metrics = [{ id: 'm1', target: 50, name: 'km', unit: 'km' }];
    const values = simpleDraftToCreateValues(draft);
    expect(values.format).toBe('cumulative');
    expect(values.metrics?.[0]).toMatchObject({ target: 50, unit: 'km' });
    expect(Number(values.cumulative_target)).toBe(50);
    expect(challengeProgressLine(values, {}, 'rail')).toBe('0 / 50 km');
    expect(challengeGoalLabel(values)).toBe('0 / 50 km');
  });

  it('shows days for a brand-new consistency challenge even if the title says km', () => {
    const draft = defaultSimpleDraft();
    draft.title = '50 km club';
    draft.scoring = 'consistency';
    draft.duration_preset = 30;
    draft.duration_days = 30;
    draft.distance_unit = 'km';
    const values = simpleDraftToCreateValues(draft);
    expect(values.format).toBe('consistency');
    expect(challengeProgressLine(values, { daysCompleted: 0 }, 'rail')).toBe('0 / 30 days');
    expect(challengeProgressLine(values, { daysCompleted: 0 }, 'overview')).not.toMatch(/km/);
  });

  it('does not read the title to invent a distance goal', () => {
    const source = readFileSync(new URL('./challengeProgress.ts', import.meta.url), 'utf8');
    expect(source.includes("title.includes('128')")).toBe(false);
    expect(source.includes("title.includes('Mile')")).toBe(false);
    expect(source.includes('parseDistanceText')).toBe(false);
    expect(
      challengeProgressLine(
        {
          title: 'Run 128 Miles',
          challenge_type: 'consistency',
          format: 'consistency',
          duration_days: 30,
        },
        { daysCompleted: 0 },
        'rail',
      ),
    ).toBe('0 / 30 days');
    expect(
      challengeProgressLine(
        {
          title: 'Not 128',
          challenge_type: 'cumulative',
          format: 'cumulative',
          cumulative_target: milesToMeters(128),
          cumulative_metric: 'distance_m',
        },
        { distanceMetersCompleted: 0 },
      ),
    ).toBe('0 / 128 mi');
  });

  it('keeps a saved km goal when a cover edit drops the form fields', () => {
    const existing = {
      format: 'cumulative',
      challenge_type: 'cumulative',
      cumulative_metric: 'count',
      cumulative_target: 50,
      metrics: [{ id: 'm1', target: 50, name: 'km', unit: 'km' as const }],
    };
    const kept = goalFieldsForSave(
      {
        format: 'cumulative',
        challenge_type: 'cumulative',
        cumulative_target: '',
        metrics: [],
      },
      existing,
    );
    expect(kept.metrics[0]).toMatchObject({ target: 50, unit: 'km' });
    expect(kept.cumulative_target).toBe(50);
    expect(challengeProgressLine({ ...existing, ...kept }, {}, 'rail')).toBe('0 / 50 km');
  });

  it('clears the goal when the host switches to consistency', () => {
    const cleared = goalFieldsForSave(
      { format: 'consistency', challenge_type: 'consistency', metrics: [], cumulative_target: '' },
      {
        format: 'cumulative',
        challenge_type: 'cumulative',
        cumulative_target: 50,
        metrics: [{ id: 'm1', target: 50, name: 'km', unit: 'km' }],
      },
    );
    expect(cleared.metrics).toEqual([]);
    expect(cleared.cumulative_target).toBeNull();
  });

  it('keeps a distance format when the edit form reloads the row', () => {
    expect(
      editFormatFromChallenge({
        format: 'distance',
        metrics: [{ id: 'm1', target: 50, name: 'km', unit: 'km' }],
      }),
    ).toBe('cumulative');
    expect(
      editFormatFromChallenge({
        format: 'consistency',
        duration_days: 30,
        title: '50 km club',
      }),
    ).toBe('consistency');
  });
});
