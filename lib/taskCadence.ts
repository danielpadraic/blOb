import { checkinPeriodKey, challengeClockTz, normalizePeriodKey } from '@/lib/checkinPeriod';
import { partSatisfies, parseProofParts, namedProofsFromLegacyTypes, type ChallengeProof } from '@/lib/challengeProofs';
import type { ChallengeTask } from '@/lib/types';

export type TaskFrequency = 'once' | 'daily' | '3x_week' | 'custom';
export type TaskCustomPeriod = 'day' | 'week' | 'month' | 'duration';

function customFrequencyCopy(n: number, period: TaskCustomPeriod): string {
  const count = Math.max(Math.floor(n) || 1, 1);
  if (period === 'day') {
    return `${count} each day`;
  }
  if (period === 'week') {
    return `${count} each week`;
  }
  if (period === 'month') {
    return `${count} each month`;
  }
  return `${count} over the whole challenge`;
}

export type ResolvedTaskCadence = {
  frequency: TaskFrequency;
  custom_checkins: number;
  custom_period: TaskCustomPeriod;
  once: boolean;
};

export type TaskCadenceSource = {
  id?: string | null;
  once?: boolean | null;
  frequency?: string | null;
  custom_checkins?: number | null;
  custom_period?: string | null;
};

export type CheckinCadenceRow = {
  period_key?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  proof_parts?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function asTaskFrequency(value: unknown): TaskFrequency | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'once' || raw === 'daily' || raw === '3x_week' || raw === 'custom') {
    return raw;
  }
  return null;
}

export function asTaskCustomPeriod(value: unknown): TaskCustomPeriod {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'day' || raw === 'week' || raw === 'month' || raw === 'duration') {
    return raw;
  }
  return 'week';
}

/** Map stored challenge.frequency onto the Simple chip set for inherit. */
export function inheritFrequencyFromChallenge(frequency: string | null | undefined): ResolvedTaskCadence {
  const raw = String(frequency ?? 'daily').trim().toLowerCase();
  if (raw === 'once') {
    return { frequency: 'once', custom_checkins: 1, custom_period: 'duration', once: true };
  }
  if (raw === '3x_week') {
    return { frequency: '3x_week', custom_checkins: 3, custom_period: 'week', once: false };
  }
  if (raw === 'weekly' || raw === 'week') {
    return { frequency: 'custom', custom_checkins: 1, custom_period: 'week', once: false };
  }
  if (raw === 'monthly' || raw === 'month') {
    return { frequency: 'custom', custom_checkins: 1, custom_period: 'month', once: false };
  }
  if (raw === 'custom') {
    return { frequency: 'custom', custom_checkins: 1, custom_period: 'duration', once: false };
  }
  return { frequency: 'daily', custom_checkins: 7, custom_period: 'week', once: false };
}

/**
 * Old rows: `once: true` → Once. Missing frequency inherits the challenge cadence.
 * New rows store frequency and derive once.
 */
export function resolveTaskCadence(
  task: TaskCadenceSource | null | undefined,
  challengeFrequency?: string | null,
): ResolvedTaskCadence {
  const inherited = inheritFrequencyFromChallenge(challengeFrequency);
  if (!task) {
    return inherited;
  }
  if (task.once === true) {
    return { frequency: 'once', custom_checkins: 1, custom_period: 'duration', once: true };
  }
  const stored = asTaskFrequency(task.frequency);
  if (stored === 'once') {
    return { frequency: 'once', custom_checkins: 1, custom_period: 'duration', once: true };
  }
  if (stored === 'daily') {
    return { frequency: 'daily', custom_checkins: 1, custom_period: 'day', once: false };
  }
  if (stored === '3x_week') {
    return { frequency: '3x_week', custom_checkins: 3, custom_period: 'week', once: false };
  }
  if (stored === 'custom') {
    return {
      frequency: 'custom',
      custom_checkins: Math.max(Math.floor(Number(task.custom_checkins) || inherited.custom_checkins) || 1, 1),
      custom_period: asTaskCustomPeriod(task.custom_period ?? inherited.custom_period),
      once: false,
    };
  }
  return inherited;
}

export function cadenceOnce(cadence: ResolvedTaskCadence): boolean {
  return cadence.frequency === 'once' || cadence.once;
}

export function taskFrequencyHint(cadence: ResolvedTaskCadence): string {
  if (cadence.frequency === 'once') {
    return 'This task once for the whole challenge.';
  }
  if (cadence.frequency === 'daily') {
    return 'This task once each day.';
  }
  if (cadence.frequency === '3x_week') {
    return 'This task three times each week.';
  }
  return customFrequencyCopy(cadence.custom_checkins, cadence.custom_period);
}

export function taskCadenceLabel(cadence: ResolvedTaskCadence): string {
  if (cadence.frequency === 'once') {
    return 'Once';
  }
  if (cadence.frequency === 'daily') {
    return 'Daily';
  }
  if (cadence.frequency === '3x_week') {
    return '3×/week';
  }
  return customFrequencyCopy(cadence.custom_checkins, cadence.custom_period);
}

export function patchTaskCadence(
  frequency: TaskFrequency,
  current?: Partial<ResolvedTaskCadence>,
): ResolvedTaskCadence {
  if (frequency === 'once') {
    return { frequency: 'once', custom_checkins: 1, custom_period: 'duration', once: true };
  }
  if (frequency === 'daily') {
    return { frequency: 'daily', custom_checkins: 1, custom_period: 'day', once: false };
  }
  if (frequency === '3x_week') {
    return { frequency: '3x_week', custom_checkins: 3, custom_period: 'week', once: false };
  }
  return {
    frequency: 'custom',
    custom_checkins: Math.max(Math.floor(Number(current?.custom_checkins) || 1) || 1, 1),
    custom_period: current?.custom_period ?? 'week',
    once: false,
  };
}

export function hasDistinctTaskCadences(
  tasks: TaskCadenceSource[] | null | undefined,
  challengeFrequency?: string | null,
): boolean {
  const list = tasks ?? [];
  if (list.length > 1) {
    return true;
  }
  return list.some((task) => {
    const resolved = resolveTaskCadence(task, challengeFrequency);
    const inherited = inheritFrequencyFromChallenge(challengeFrequency);
    return resolved.frequency !== inherited.frequency || resolved.once !== inherited.once;
  });
}

function isSubmittedRow(row: CheckinCadenceRow): boolean {
  return Boolean(row.submitted_at) || String(row.status ?? '') === 'submitted';
}

function weekIndex(periodKey: string, startKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00.000Z`);
  const now = Date.parse(`${periodKey}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(now)) {
    return 0;
  }
  return Math.max(0, Math.floor((now - start) / (7 * DAY_MS)));
}

function monthKey(periodKey: string): string {
  return normalizePeriodKey(periodKey).slice(0, 7);
}

function rowHasTaskProof(
  row: CheckinCadenceRow,
  taskId: string,
  proofs: ChallengeProof[],
): boolean {
  const parts = parseProofParts(row.proof_parts);
  const slots = proofs.filter((proof) => (proof.taskId ?? 'primary') === taskId);
  if (slots.length === 0) {
    return isSubmittedRow(row);
  }
  return slots.every((proof) => proof.method === 'honor' || partSatisfies(proof, parts[proof.id]));
}

export type TaskDueContext = {
  now?: Date;
  periodKey?: string;
  history?: CheckinCadenceRow[];
  proofs?: ChallengeProof[];
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
};

export function taskIsDue(
  task: TaskCadenceSource & { id?: string | null },
  challengeFrequency: string | null | undefined,
  ctx: TaskDueContext,
): boolean {
  const cadence = resolveTaskCadence(task, challengeFrequency);
  const taskId = String(task.id ?? 'primary');
  const proofs = (ctx.proofs ?? []).filter((proof) => (proof.taskId ?? 'primary') === taskId);
  const history = ctx.history ?? [];
  const periodKey = normalizePeriodKey(ctx.periodKey ?? '');
  const startKey = normalizePeriodKey(ctx.startsAt) || periodKey;

  const submitted = history.filter(isSubmittedRow);
  const provenIn = (rows: CheckinCadenceRow[]) =>
    rows.some((row) => rowHasTaskProof(row, taskId, proofs.length ? proofs : ctx.proofs ?? []));

  if (cadence.frequency === 'once') {
    return !provenIn(submitted);
  }

  if (cadence.frequency === 'daily') {
    const today = submitted.filter((row) => normalizePeriodKey(row.period_key) === periodKey);
    return !provenIn(today);
  }

  if (cadence.frequency === '3x_week' || (cadence.frequency === 'custom' && cadence.custom_period === 'week')) {
    const need = cadence.frequency === '3x_week' ? 3 : cadence.custom_checkins;
    const week = weekIndex(periodKey, startKey);
    const inWeek = submitted.filter(
      (row) => weekIndex(normalizePeriodKey(row.period_key), startKey) === week,
    );
    const done = inWeek.filter((row) => rowHasTaskProof(row, taskId, proofs.length ? proofs : ctx.proofs ?? [])).length;
    return done < need;
  }

  if (cadence.frequency === 'custom' && cadence.custom_period === 'day') {
    const today = submitted.filter((row) => normalizePeriodKey(row.period_key) === periodKey);
    const done = today.filter((row) => rowHasTaskProof(row, taskId, proofs.length ? proofs : ctx.proofs ?? [])).length;
    return done < cadence.custom_checkins;
  }

  if (cadence.frequency === 'custom' && cadence.custom_period === 'month') {
    const month = monthKey(periodKey);
    const inMonth = submitted.filter((row) => monthKey(normalizePeriodKey(row.period_key)) === month);
    const done = inMonth.filter((row) => rowHasTaskProof(row, taskId, proofs.length ? proofs : ctx.proofs ?? [])).length;
    return done < cadence.custom_checkins;
  }

  if (cadence.frequency === 'custom' && cadence.custom_period === 'duration') {
    const done = submitted.filter((row) =>
      rowHasTaskProof(row, taskId, proofs.length ? proofs : ctx.proofs ?? []),
    ).length;
    return done < cadence.custom_checkins;
  }

  const today = submitted.filter((row) => normalizePeriodKey(row.period_key) === periodKey);
  return !provenIn(today);
}

export function challengeTasksForCadence(challenge: {
  task?: string | null;
  tasks?: unknown[] | null;
  frequency?: string | null;
}): Array<ChallengeTask & TaskCadenceSource> {
  const stored = (challenge.tasks ?? []).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return [];
    }
    const row = raw as Record<string, unknown>;
    const title = String(row.title ?? '').trim();
    if (!title) {
      return [];
    }
    return [
      {
        id: String(row.id ?? `task-${index + 1}`),
        title,
        points: Number(row.points ?? 0),
        proof_required: Boolean(row.proof_required),
        proof_types: Array.isArray(row.proof_types) ? row.proof_types.map((item) => String(item)) : undefined,
        once: Boolean(row.once),
        frequency: typeof row.frequency === 'string' ? row.frequency : undefined,
        custom_checkins: Number(row.custom_checkins) > 0 ? Math.floor(Number(row.custom_checkins)) : undefined,
        custom_period: typeof row.custom_period === 'string' ? String(row.custom_period) : undefined,
      } satisfies ChallengeTask & TaskCadenceSource,
    ];
  });
  if (stored.length > 0) {
    return stored;
  }
  const title = String(challenge.task ?? '').trim();
  if (!title) {
    return [];
  }
  return [
    {
      id: 'primary',
      title,
      points: 0,
      proof_required: true,
      once: false,
      frequency: inheritFrequencyFromChallenge(challenge.frequency).frequency,
    },
  ];
}

export function dueTaskIds(
  challenge: {
    task?: string | null;
    tasks?: unknown[] | null;
    frequency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string | null;
  },
  ctx: Omit<TaskDueContext, 'startsAt' | 'endsAt' | 'timezone'> & { now?: Date },
): string[] {
  const tasks = challengeTasksForCadence(challenge);
  const now = ctx.now ?? new Date();
  const periodKey = ctx.periodKey ?? checkinPeriodKey(challenge as never, now);
  return tasks
    .filter((task) =>
      taskIsDue(task, challenge.frequency, {
        ...ctx,
        periodKey,
        startsAt: challenge.starts_at,
        endsAt: challenge.ends_at,
        timezone: challenge.timezone ?? challengeClockTz(challenge as never),
      }),
    )
    .map((task) => String(task.id ?? 'primary'));
}

export function hasOpenDueTask(
  challenge: {
    task?: string | null;
    tasks?: unknown[] | null;
    frequency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string | null;
  },
  ctx: TaskDueContext,
): boolean {
  return dueTaskIds(challenge, ctx).length > 0;
}

/** Day-grain cadences block today's Send. Once / week / month do not. */
export function cadenceGrain(cadence: ResolvedTaskCadence): 'day' | 'week' | 'month' | 'duration' {
  if (cadence.frequency === 'once' || (cadence.frequency === 'custom' && cadence.custom_period === 'duration')) {
    return 'duration';
  }
  if (cadence.frequency === '3x_week' || (cadence.frequency === 'custom' && cadence.custom_period === 'week')) {
    return 'week';
  }
  if (cadence.frequency === 'custom' && cadence.custom_period === 'month') {
    return 'month';
  }
  return 'day';
}

export function dueTaskIdsThisPeriod(
  challenge: {
    task?: string | null;
    tasks?: unknown[] | null;
    frequency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string | null;
  },
  ctx: Omit<TaskDueContext, 'startsAt' | 'endsAt' | 'timezone'> & { now?: Date },
): string[] {
  return dueTaskIds(challenge, ctx).filter((id) => {
    const task = challengeTasksForCadence(challenge).find((item) => String(item.id ?? 'primary') === id);
    const cadence = resolveTaskCadence(task, challenge.frequency);
    return cadenceGrain(cadence) === 'day';
  });
}

export function dueProofsForCheckin(
  allProofs: ChallengeProof[],
  challenge: {
    task?: string | null;
    tasks?: unknown[] | null;
    frequency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string | null;
  },
  ctx: TaskDueContext,
): ChallengeProof[] {
  const tasks = challengeTasksForCadence(challenge);
  if (tasks.length <= 1 && !hasDistinctTaskCadences(tasks, challenge.frequency)) {
    return allProofs;
  }
  const due = new Set(dueTaskIds(challenge, { ...ctx, proofs: allProofs }));
  const tagged = allProofs.filter((proof) => due.has(proof.taskId ?? 'primary'));
  const missing = challengeTasksForCadence(challenge).filter((task) => {
    const id = String(task.id ?? 'primary');
    return due.has(id) && !tagged.some((proof) => (proof.taskId ?? 'primary') === id);
  });
  const synthesized = missing.flatMap((task) => {
    const types = task.proof_types ?? (task.proof_required ? ['photo'] : []);
    if (types.length === 0) {
      return [];
    }
    return namedProofsFromLegacyTypes(types).map((proof, index) => ({
      ...proof,
      id: proof.taskId ? proof.id : `${task.id ?? 'task'}-${proof.id}-${index}`,
      taskId: String(task.id ?? 'primary'),
    }));
  });
  if (tagged.length + synthesized.length > 0) {
    return [...tagged, ...synthesized];
  }
  const untagged = allProofs.filter((proof) => !proof.taskId);
  if (due.has('primary')) {
    return untagged.length > 0 ? untagged : allProofs;
  }
  return [];
}

/**
 * Proofs that block Send for this period. Daily (and custom/day) first.
 * After those are done, remaining Once / week / month slots become required
 * so they can be appended on the same check-in.
 */
export function blockingProofsForCheckin(
  allProofs: ChallengeProof[],
  challenge: {
    task?: string | null;
    tasks?: unknown[] | null;
    frequency?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    timezone?: string | null;
  },
  ctx: TaskDueContext,
): ChallengeProof[] {
  const due = dueProofsForCheckin(allProofs, challenge, ctx);
  const periodIds = new Set(dueTaskIdsThisPeriod(challenge, ctx));
  const periodProofs = due.filter((proof) => periodIds.has(proof.taskId ?? 'primary'));
  if (periodProofs.length > 0) {
    return periodProofs;
  }
  return due;
}

export function simpleFrequencyFromCreate(frequency: string | null | undefined): TaskFrequency {
  return inheritFrequencyFromChallenge(frequency).frequency;
}

export function createFrequencyFromTask(frequency: TaskFrequency): 'once' | 'daily' | '3x_week' | 'custom' {
  return frequency;
}
