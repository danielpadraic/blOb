import { describe, expect, it } from 'vitest';

import {
  blockingProofsForCheckin,
  dueProofsForCheckin,
  hasOpenDueTask,
  patchTaskCadence,
  resolveTaskCadence,
  taskFrequencyHint,
  taskIsDue,
} from '@/lib/taskCadence';

describe('resolveTaskCadence', () => {
  it('maps once true to Once even when frequency is missing', () => {
    expect(resolveTaskCadence({ once: true }, 'daily')).toEqual({
      frequency: 'once',
      custom_checkins: 1,
      custom_period: 'duration',
      once: true,
    });
  });

  it('inherits challenge frequency when the task has no cadence', () => {
    expect(resolveTaskCadence({ once: false }, '3x_week').frequency).toBe('3x_week');
    expect(resolveTaskCadence({ once: false }, 'daily').frequency).toBe('daily');
  });
});

describe('taskFrequencyHint', () => {
  it('uses the per-task copy', () => {
    expect(taskFrequencyHint(patchTaskCadence('daily'))).toBe('This task once each day.');
    expect(taskFrequencyHint(patchTaskCadence('once'))).toBe('This task once for the whole challenge.');
    expect(taskFrequencyHint(patchTaskCadence('3x_week'))).toBe('This task three times each week.');
  });
});

describe('task due windows', () => {
  const daily = { id: 'primary', frequency: 'daily', once: false };
  const once = { id: 'groceries', frequency: 'once', once: true };
  const photo = { id: 'p1', name: 'Photo', method: 'photo' as const, taskId: 'primary' };
  const extra = { id: 'p2', name: 'Receipt', method: 'photo' as const, taskId: 'groceries' };

  it('does not require a Once task after it is proven', () => {
    expect(
      taskIsDue(once, 'daily', {
        periodKey: '2026-09-10',
        proofs: [extra],
        history: [
          {
            period_key: '2026-09-08',
            status: 'submitted',
            submitted_at: '2026-09-08T12:00:00.000Z',
            proof_parts: { p2: { method: 'photo', url: 'https://x/a.jpg' } },
          },
        ],
      }),
    ).toBe(false);
  });

  it('keeps Daily due when only the Once task was done', () => {
    expect(
      taskIsDue(daily, 'daily', {
        periodKey: '2026-09-10',
        proofs: [photo, extra],
        history: [
          {
            period_key: '2026-09-08',
            status: 'submitted',
            submitted_at: '2026-09-08T12:00:00.000Z',
            proof_parts: { p2: { method: 'photo', url: 'https://x/a.jpg' } },
          },
        ],
      }),
    ).toBe(true);
  });

  it('filters check-in proofs to tasks due today', () => {
    const challenge = {
      frequency: 'daily',
      task: 'Run',
      tasks: [
        { id: 'primary', title: 'Run', points: 0, proof_required: true, frequency: 'daily', once: false },
        { id: 'groceries', title: 'Groceries', points: 0, proof_required: true, frequency: 'once', once: true },
      ],
    };
    const history = [
      {
        period_key: '2026-09-08',
        status: 'submitted' as const,
        submitted_at: '2026-09-08T12:00:00.000Z',
        proof_parts: { p2: { method: 'photo', url: 'https://x/a.jpg' } },
      },
    ];
    const due = dueProofsForCheckin([photo, extra], challenge, {
      periodKey: '2026-09-10',
      history,
    });
    expect(due.map((item) => item.id)).toEqual(['p1']);
    expect(
      hasOpenDueTask(challenge, {
        periodKey: '2026-09-10',
        proofs: [photo, extra],
        history: [
          ...history,
          {
            period_key: '2026-09-10',
            status: 'submitted',
            submitted_at: '2026-09-10T12:00:00.000Z',
            proof_parts: { p1: { method: 'photo', url: 'https://x/b.jpg' } },
          },
        ],
      }),
    ).toBe(false);
  });

  it('does not block today’s daily Send on an unproven Once task', () => {
    const challenge = {
      frequency: 'daily',
      task: 'Run',
      tasks: [
        { id: 'primary', title: 'Run', points: 0, proof_required: true, frequency: 'daily', once: false },
        { id: 'groceries', title: 'Groceries', points: 0, proof_required: true, frequency: 'once', once: true },
      ],
    };
    const ctx = { periodKey: '2026-09-10', history: [] as const };
    expect(dueProofsForCheckin([photo, extra], challenge, ctx).map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(blockingProofsForCheckin([photo, extra], challenge, ctx).map((item) => item.id)).toEqual(['p1']);
    expect(
      hasOpenDueTask(challenge, {
        periodKey: '2026-09-10',
        proofs: [photo, extra],
        history: [
          {
            period_key: '2026-09-10',
            status: 'submitted',
            submitted_at: '2026-09-10T12:00:00.000Z',
            proof_parts: { p1: { method: 'photo', url: 'https://x/b.jpg' } },
          },
        ],
      }),
    ).toBe(true);
  });
});
