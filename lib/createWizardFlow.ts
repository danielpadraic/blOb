import { COMPARABLE_POINTS_METHOD } from '@/lib/comparablePoints';
import { nextCreateItemId } from '@/lib/createItemIds';
import type { CreateChallengeValues } from '@/utils/validators';

/** Matches CREATE_WIZARD_STEPS: prize then scoring then funding. */
const STEP_PRIZE = 5;
const STEP_FUNDING = 7;

export function stripBlankExtraRules<T extends { text?: string | null }>(rules: T[] | undefined): T[] {
  return (rules ?? []).filter((rule) => (rule.text ?? '').trim().length >= 2);
}

export function stripBlankExtraTasks<T extends { title?: string | null }>(tasks: T[] | undefined): T[] {
  return (tasks ?? []).filter((task) => (task.title ?? '').trim().length > 0);
}

function emptyPointsTask(): CreateChallengeValues['tasks'][number] {
  return {
    id: nextCreateItemId('task'),
    title: '',
    points: '10',
    proof_required: true,
    proofs: ['photo'],
    once: false,
  };
}

export function seedPointsTasksFromGoal(
  values: Pick<CreateChallengeValues, 'challenge_type' | 'task' | 'tasks'>,
): CreateChallengeValues['tasks'] | null {
  if (values.challenge_type !== 'points') {
    return null;
  }
  const goalTask = (values.task ?? '').trim();
  const tasks = values.tasks ?? [];
  const first = tasks[0] ?? emptyPointsTask();
  const nextFirst = { ...first };
  let changed = tasks.length === 0;
  if (!nextFirst.title.trim() && goalTask) {
    nextFirst.title = goalTask;
    changed = true;
  }
  if (!String(nextFirst.points ?? '').trim()) {
    nextFirst.points = '1';
    changed = true;
  }
  if (!changed) {
    return null;
  }
  return [nextFirst, ...tasks.slice(1)];
}

export function shouldSkipScoringStep(
  values: Pick<CreateChallengeValues, 'scoring_method'>,
  scoringEditorOpen: boolean,
): boolean {
  return values.scoring_method !== COMPARABLE_POINTS_METHOD && !scoringEditorOpen;
}

export function nextCreateWizardStep(
  current: number,
  values: Pick<CreateChallengeValues, 'scoring_method'>,
  scoringEditorOpen: boolean,
): number {
  if (current === STEP_PRIZE && shouldSkipScoringStep(values, scoringEditorOpen)) {
    return STEP_FUNDING;
  }
  return current + 1;
}

export function prevCreateWizardStep(
  current: number,
  values: Pick<CreateChallengeValues, 'scoring_method'>,
  scoringEditorOpen: boolean,
): number {
  if (current === STEP_FUNDING && shouldSkipScoringStep(values, scoringEditorOpen)) {
    return STEP_PRIZE;
  }
  return current - 1;
}

const RULES_PERIODS = new Set(['daily', 'weekly', 'monthly', 'once', '3x_week', 'custom']);

export function defaultRulesTargetCount(value: string | null | undefined): string {
  return String(value ?? '').trim() || '1';
}

export function consistencyCadenceReady(
  values: Pick<CreateChallengeValues, 'target_count' | 'rule_activity' | 'task' | 'frequency'>,
): boolean {
  const count = Number(defaultRulesTargetCount(values.target_count));
  const activity = (values.rule_activity || values.task || '').trim();
  return Number.isFinite(count) && count >= 1 && activity.length >= 2 && RULES_PERIODS.has(values.frequency);
}

type RulesStepValues = Pick<
  CreateChallengeValues,
  'challenge_type' | 'duration_type' | 'task' | 'tasks' | 'target_count' | 'rule_activity' | 'frequency'
>;

export type RulesStepIssue = { field: string; message: string };

/** Extra constraints are optional. Points Task 1 can come from Goal.task. */
export function rulesStepIsReady(values: RulesStepValues): boolean {
  return rulesStepBlockingIssue(values) == null;
}

/** Step 10 gate. Blank extra_rules, unused min_minutes, and leftover Goal proofs do not block. */
export function rulesStepBlockingIssue(values: RulesStepValues): RulesStepIssue | null {
  const seeded = seedPointsTasksFromGoal(values);
  const tasks = seeded ?? values.tasks ?? [];
  const next = { ...values, tasks };

  if (next.challenge_type === 'points' && next.duration_type !== 'unlimited') {
    const title = (tasks[0]?.title ?? next.task ?? '').trim();
    if (title.length < 2) {
      return { field: 'tasks.0.title', message: 'Give this task a short name' };
    }
    const points = Number(tasks[0]?.points);
    if (!Number.isFinite(points) || points < 1) {
      return { field: 'tasks.0.points', message: 'Point value must be at least 1' };
    }
    return null;
  }

  const activity = (next.rule_activity || next.task || '').trim();
  if (activity.length < 2) {
    return { field: 'task', message: 'Add a task' };
  }
  return null;
}
