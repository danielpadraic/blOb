import { resolveChallengeProofs } from '@/lib/challengeProofs';
import { challengeDurationDays } from '@/lib/challengeGoal';
import {
  asRulePeriod,
  parseRulesStructured,
  periodCountInDuration,
  periodNoun,
  pluralizeActivity,
  type RulesStructured,
} from '@/lib/consistencyRules';
import type { ChallengeFrequency } from '@/lib/types';
import { challengeWindowDays } from '@/utils/format';

type RuleChallenge = {
  rules?: string | null;
  rules_list?: unknown;
  rules_structured?: unknown;
  frequency?: string | null;
  target_count?: number | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  is_official?: boolean | null;
  challenge_type?: string | null;
  min_minutes?: number | null;
  category?: string | null;
  tasks?: unknown[] | null;
  task?: string | null;
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
};

export type ChallengeRuleCopy = {
  primary: string | null;
  extras: string[];
  cadenceLabel: string;
  cadenceLong: string;
  totalHint: string | null;
  period: ChallengeFrequency | null;
  count: number;
  toFinish: string | null;
};

export type JoinedProgressCopy = {
  label: string;
  ratio: number;
};

function periodChip(period: ChallengeFrequency): string {
  if (period === 'once') return 'once';
  return periodNoun(period) ?? 'week';
}

const ACTIVITY_LABELS: Record<string, string> = {
  any_exercise: 'any exercise',
  hiit: 'HIIT',
};

/** Snake_case IDs never appear in UI. */
export function humanizeActivity(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }
  if (ACTIVITY_LABELS[trimmed]) {
    return ACTIVITY_LABELS[trimmed];
  }
  if (!trimmed.includes('_')) {
    return trimmed;
  }
  return trimmed
    .split('_')
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join(' ');
}

export function challengeTaskTitles(challenge: RuleChallenge): string[] {
  const primary = humanizeActivity(challenge.task);
  const fromTasks: string[] = [];
  if (Array.isArray(challenge.tasks)) {
    for (const row of challenge.tasks) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const title = humanizeActivity(String((row as { title?: unknown }).title ?? ''));
      if (title && !fromTasks.some((item) => item.toLowerCase() === title.toLowerCase())) {
        fromTasks.push(title);
      }
    }
  }
  if (fromTasks.length > 1) {
    return fromTasks;
  }
  if (primary) {
    return [primary];
  }
  if (fromTasks[0]) {
    return [fromTasks[0]];
  }
  const fallback = challengeTaskTitle(challenge);
  return fallback ? [fallback] : [];
}

export function challengeTaskTitle(challenge: RuleChallenge): string {
  const task = humanizeActivity(challenge.task);
  if (task) {
    return task;
  }
  if (Array.isArray(challenge.tasks) && challenge.tasks.length === 1) {
    const row = challenge.tasks[0];
    if (row && typeof row === 'object') {
      const title = humanizeActivity(String((row as { title?: unknown }).title ?? ''));
      if (title) {
        return title;
      }
    }
  }
  const rules = (challenge.rules ?? '').trim();
  if (
    rules &&
    !rules.includes('\n') &&
    !/^complete\s/i.test(rules) &&
    !/competitors must/i.test(rules) &&
    !/\d+\s*\/\s*(day|week|month)/i.test(rules) &&
    rules.length <= 80
  ) {
    return humanizeActivity(rules);
  }
  return '';
}

export function challengeUsesHonorProof(challenge: {
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
}): boolean {
  const proofs = resolveChallengeProofs(challenge);
  return proofs.length > 0 && proofs.every((proof) => proof.method === 'honor');
}

function frequencyClause(frequency: string | null | undefined): string {
  if (frequency === 'once') {
    return 'once during the challenge';
  }
  if (frequency === 'weekly' || frequency === 'week') {
    return 'each week of the challenge';
  }
  if (frequency === 'monthly' || frequency === 'month') {
    return 'each month of the challenge';
  }
  if (frequency === '3x_week') {
    return 'three times each week of the challenge';
  }
  return 'each day of the challenge';
}

export function challengeRulesSentence(
  task: string,
  frequency: string | null | undefined,
  honor: boolean,
): string {
  const title = humanizeActivity(task) || 'the task';
  const cadence = frequencyClause(frequency);
  if (honor) {
    return `Complete “${title}” ${cadence}. Proof is on your honor.`;
  }
  return `Complete “${title}” ${cadence} and submit the required proof.`;
}

export type RuleTaskInput = {
  title: string;
  once?: boolean;
};

export function challengeRulesFromTasks(
  tasks: RuleTaskInput[],
  frequency: string | null | undefined,
  honor: boolean,
): string {
  const named = tasks
    .map((item) => ({
      title: humanizeActivity(item.title),
      once: Boolean(item.once),
    }))
    .filter((item) => item.title);
  if (named.length <= 1) {
    return challengeRulesSentence(named[0]?.title ?? 'the task', named[0]?.once ? 'once' : frequency, honor);
  }
  const daily = named.filter((item) => !item.once);
  const once = named.filter((item) => item.once);
  const quoted = (items: { title: string }[]) => items.map((item) => `“${item.title}”`).join('; ');
  const proof = honor ? 'Proof is on your honor.' : 'Submit proof where required.';
  if (frequency === 'once' || daily.length === 0) {
    return `Complete: ${quoted(named)}. ${proof}`;
  }
  if (once.length === 0) {
    return `Each day, complete: ${quoted(named)}. ${proof}`;
  }
  return `Each day, complete: ${quoted(daily)}. Also complete ${quoted(once)} once. ${proof}`;
}

export function challengeRulesFromCreateValues(values: {
  task?: string | null;
  extra_tasks?: Array<{ title?: string | null; once?: boolean | null; proof_method?: string | null }> | null;
  frequency?: string | null;
  proofs?: string[] | null;
  challenge_proofs?: Array<{ method?: string | null }> | null;
  rule_activity?: string | null;
}): string {
  const extra = (values.extra_tasks ?? [])
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      once: Boolean(item.once),
      proof_method: item.proof_method ?? null,
    }))
    .filter((item) => item.title);
  const primary = String(values.task ?? '').trim();
  const tasks: RuleTaskInput[] = primary
    ? [{ title: primary, once: false }, ...extra]
    : extra.length > 0
      ? extra
      : [{ title: humanizeActivity(values.rule_activity) || 'the task', once: false }];
  const named = values.challenge_proofs ?? [];
  const primaryHonor =
    named.length > 0
      ? named.every((proof) => proof.method === 'honor')
      : (values.proofs ?? []).length === 0;
  const extraRequiresProof = extra.some((item) => item.proof_method && item.proof_method !== 'honor');
  const extraHonor = extra.every((item) => item.proof_method === 'honor');
  const honor = extra.length === 0 ? primaryHonor : primaryHonor && extraHonor && !extraRequiresProof;
  return challengeRulesFromTasks(tasks, values.frequency, honor);
}

function readStructured(raw: unknown): RulesStructured | null {
  if (typeof raw === 'string') {
    try {
      return parseRulesStructured(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  return parseRulesStructured(raw);
}

export function formatPrimaryRuleSentence(
  primary: { count: number; activity: string; period: ChallengeFrequency },
  unlimited = false,
): string {
  const count = Math.max(Number(primary.count) || 1, 1);
  const activity = pluralizeActivity(humanizeActivity(primary.activity) || 'workout', count);
  if (primary.period === 'once') {
    return `Competitors must check in ${count} ${activity} once during the challenge.`;
  }
  const period = periodNoun(primary.period) ?? 'week';
  if (unlimited) {
    return `Competitors must check in ${count} ${activity} every ${period} to stay in the challenge.`;
  }
  return `Competitors must check in ${count} ${activity} every ${period} for the duration of the challenge.`;
}

function splitRulesText(rules: string): { primary: string; extras: string[] } {
  const blocks = rules
    .split(/\n\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    return {
      primary: blocks[0],
      extras: blocks.slice(1).flatMap((block) =>
        block
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    };
  }
  const lines = rules
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return { primary: lines[0], extras: lines.slice(1) };
  }
  return { primary: rules.trim(), extras: [] };
}

function extrasFromPayload(raw: unknown): string[] {
  const structured = readStructured(raw);
  if (structured) {
    return structured.extras.map((item) => item.text);
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) {
      return [item.trim()];
    }
    if (item && typeof item === 'object') {
      const text = (item as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) {
        return [text.trim()];
      }
    }
    return [];
  });
}

function mergeExtras(primary: string | null, groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const primaryKey = primary?.trim().toLowerCase() ?? '';
  for (const group of groups) {
    for (const line of group) {
      const trimmed = line.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || key === primaryKey || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function perPeriodCount(
  challenge: RuleChallenge,
  period: ChallengeFrequency,
  storedTarget: number,
): number {
  if (period === 'once' || challenge.is_unlimited) {
    return storedTarget;
  }
  const days = challengeWindowDays(challenge.starts_at ?? '', challenge.ends_at);
  const periods = periodCountInDuration(Math.max(days, 1), period);
  if (period === 'daily') {
    if (days > 1 && storedTarget === days) {
      return 1;
    }
    if (days > 1 && storedTarget > days && storedTarget % days === 0) {
      return storedTarget / days;
    }
    return storedTarget;
  }
  if (periods > 1 && storedTarget >= periods && storedTarget % periods === 0) {
    return storedTarget / periods;
  }
  if (periods > 1 && storedTarget > periods) {
    return Math.max(1, Math.round(storedTarget / periods));
  }
  return storedTarget;
}

function cadenceParts(
  count: number,
  period: ChallengeFrequency,
  activity?: string | null,
): { cadenceLabel: string; cadenceLong: string } {
  const noun = periodChip(period);
  const label = period === 'once' ? `${count} once` : `${count} / ${noun}`;
  const activityLabel = activity?.trim()
    ? pluralizeActivity(humanizeActivity(activity) || activity, count)
    : count === 1
      ? 'check-in'
      : 'check-ins';
  const long =
    period === 'once'
      ? `${count} ${activityLabel} once during the challenge`
      : `${count} ${activityLabel} every ${noun}`;
  return { cadenceLabel: label, cadenceLong: long };
}

function cadenceFromSentence(
  text: string,
): { count: number; period: ChallengeFrequency; activity: string | null } | null {
  const every = text.match(/(?:check[- ]?in|log)\s+(\d+)\s+(.+?)\s+every\s+(day|week|month)\b/i);
  if (every) {
    const count = Math.max(Number(every[1]) || 1, 1);
    const period: ChallengeFrequency =
      every[3] === 'day' ? 'daily' : every[3] === 'week' ? 'weekly' : 'monthly';
    return { count, period, activity: every[2].trim() || null };
  }
  const once = text.match(/(?:check[- ]?in|log)\s+(\d+)\s+(.+?)\s+once\b/i);
  if (once) {
    return {
      count: Math.max(Number(once[1]) || 1, 1),
      period: 'once',
      activity: once[2].trim() || null,
    };
  }
  return null;
}

export function challengeRuleCopy(challenge: RuleChallenge): ChallengeRuleCopy {
  const structured: RulesStructured | null =
    readStructured(challenge.rules_list) ?? readStructured(challenge.rules_structured);
  const storedTarget = Math.max(Number(challenge.target_count || challenge.days_required) || 1, 1);
  const unlimited = Boolean(challenge.is_unlimited);
  const rulesText = (challenge.rules ?? '').trim();
  const split = rulesText ? splitRulesText(rulesText) : { primary: '', extras: [] };

  const fromSentence = cadenceFromSentence(split.primary || rulesText);
  const freq =
    asRulePeriod(structured?.primary?.period) ??
    fromSentence?.period ??
    asRulePeriod(challenge.frequency);

  const perCount = structured?.primary
    ? structured.primary.count
    : fromSentence
      ? fromSentence.count
      : freq
        ? perPeriodCount(challenge, freq, storedTarget)
        : storedTarget;
  const activity = humanizeActivity(structured?.primary?.activity ?? fromSentence?.activity ?? null);
  const cadence = freq
    ? cadenceParts(perCount, freq, activity)
    : { cadenceLabel: `${storedTarget} check-ins`, cadenceLong: `${storedTarget} check-ins` };

  const totalHint =
    !unlimited && freq && freq !== 'once' && freq !== 'daily' && storedTarget > perCount
      ? `About ${storedTarget} check-ins over the full window if every ${periodChip(freq)} is completed`
      : null;

  const taskTitle = challengeTaskTitle(challenge);
  const taskTitles = challengeTaskTitles(challenge);
  const honor = challengeUsesHonorProof(challenge);
  const taskRows: RuleTaskInput[] = Array.isArray(challenge.tasks)
    ? (challenge.tasks as Array<{ title?: unknown; once?: unknown }>).flatMap((row) => {
        const title = humanizeActivity(String(row?.title ?? ''));
        return title ? [{ title, once: Boolean(row?.once) }] : [];
      })
    : [];
  const generated =
    taskTitles.length > 0 && challenge.challenge_type !== 'points'
      ? challengeRulesFromTasks(
          taskRows.length > 0 ? taskRows : taskTitles.map((title) => ({ title, once: false })),
          challenge.frequency ?? freq,
          honor,
        )
      : null;

  const extras = mergeExtras(generated ?? split.primary, [
    split.extras,
    structured?.extras.map((item) => item.text) ?? [],
    extrasFromPayload(challenge.rules_list),
    extrasFromPayload(challenge.rules_structured),
  ]).filter(
    (line) =>
      !/\d+\s*\/\s*(day|week|month)/i.test(line) &&
      !/any_exercise/i.test(line) &&
      !/competitors must (?:check in|log)/i.test(line),
  );

  const storedLooksBroken =
    Boolean(split.primary) &&
    (/_/.test(split.primary) ||
      /\d+\s*\/\s*(day|week|month)/i.test(split.primary) ||
      /competitors must log/i.test(split.primary) ||
      /any_exercise/i.test(split.primary));

  const primary = generated
    ? generated
    : rulesText && !storedLooksBroken
      ? split.primary
      : structured?.primary
        ? formatPrimaryRuleSentence(structured.primary, unlimited)
        : extras.length > 0
          ? null
          : freq && freq !== 'daily'
            ? `Competitors must check in ${cadence.cadenceLong} for the duration of the challenge.`
            : `Complete ${storedTarget} check-in${storedTarget === 1 ? '' : 's'} in this challenge.`;

  return {
    primary,
    extras: rulesText || structured?.primary || extras.length > 0 ? extras : [],
    cadenceLabel: cadence.cadenceLabel,
    cadenceLong: cadence.cadenceLong,
    totalHint,
    period: freq,
    count: perCount,
    toFinish: taskTitles.length > 1 ? taskTitles.join(' · ') : taskTitle || null,
  };
}

function compactCadence(count: number, period: ChallengeFrequency): string {
  if (period === 'once') return `${count} once`;
  if (period === 'weekly') return `${count}/week`;
  if (period === 'monthly') return `${count}/month`;
  return `${count}/day`;
}

export function joinedProgressCopy(
  challenge: RuleChallenge,
  daysCompleted = 0,
): JoinedProgressCopy {
  const logged = Math.max(0, Math.floor(Number(daysCompleted) || 0));
  if (challenge.challenge_type === 'points' && !challenge.is_unlimited) {
    const target = Math.max(Array.isArray(challenge.tasks) ? challenge.tasks.length : 1, 1);
    return { label: `${logged}/${target} tasks`, ratio: logged / Math.max(target, 1) };
  }

  const copy = challengeRuleCopy(challenge);
  const count = Math.max(copy.count, 1);

  if (copy.period === 'weekly' || copy.period === 'monthly') {
    return {
      label: `${compactCadence(count, copy.period)} · ${logged} checked in`,
      ratio: 0,
    };
  }

  if (copy.period === 'once') {
    return { label: `${logged}/${count} check-ins`, ratio: logged / count };
  }

  const total = challengeDurationDays(challenge);
  return { label: `${logged}/${total} check-ins`, ratio: logged / total };
}
