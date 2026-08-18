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
  starts_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  challenge_type?: string | null;
  min_minutes?: number | null;
  category?: string | null;
  tasks?: unknown[] | null;
};

export type ChallengeRuleCopy = {
  primary: string | null;
  extras: string[];
  cadenceLabel: string;
  cadenceLong: string;
  totalHint: string | null;
  period: ChallengeFrequency | null;
  count: number;
};

export type JoinedProgressCopy = {
  label: string;
  ratio: number;
};

function periodChip(period: ChallengeFrequency): string {
  if (period === 'once') return 'once';
  return periodNoun(period) ?? 'week';
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
  const activity = pluralizeActivity(primary.activity || 'workout', count);
  if (primary.period === 'once') {
    return `Competitors must log ${count} ${activity} once during the challenge.`;
  }
  const period = periodNoun(primary.period) ?? 'week';
  if (unlimited) {
    return `Competitors must log ${count} ${activity} every ${period} to stay in the challenge.`;
  }
  return `Competitors must log ${count} ${activity} every ${period} for the duration of the challenge.`;
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
    ? pluralizeActivity(activity, count)
    : count === 1
      ? 'log'
      : 'logs';
  const long =
    period === 'once'
      ? `${count} ${activityLabel} once during the challenge`
      : `${count} ${activityLabel} every ${noun}`;
  return { cadenceLabel: label, cadenceLong: long };
}

function cadenceFromSentence(
  text: string,
): { count: number; period: ChallengeFrequency; activity: string | null } | null {
  const every = text.match(/log\s+(\d+)\s+(.+?)\s+every\s+(day|week|month)\b/i);
  if (every) {
    const count = Math.max(Number(every[1]) || 1, 1);
    const period: ChallengeFrequency =
      every[3] === 'day' ? 'daily' : every[3] === 'week' ? 'weekly' : 'monthly';
    return { count, period, activity: every[2].trim() || null };
  }
  const once = text.match(/log\s+(\d+)\s+(.+?)\s+once\b/i);
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
  const activity = structured?.primary?.activity ?? fromSentence?.activity ?? null;
  const cadence = freq
    ? cadenceParts(perCount, freq, activity)
    : { cadenceLabel: `${storedTarget} logs`, cadenceLong: `${storedTarget} logs` };

  const totalHint =
    !unlimited && freq && freq !== 'once' && storedTarget > perCount
      ? `About ${storedTarget} logs over the full window if every ${periodChip(freq)} is completed`
      : null;

  const extras = mergeExtras(split.primary, [
    split.extras,
    structured?.extras.map((item) => item.text) ?? [],
    extrasFromPayload(challenge.rules_list),
    extrasFromPayload(challenge.rules_structured),
  ]);

  const primary = rulesText
    ? split.primary
    : structured?.primary
      ? formatPrimaryRuleSentence(structured.primary, unlimited)
      : extras.length > 0
        ? null
        : freq && freq !== 'daily'
          ? `Competitors must log ${cadence.cadenceLong} for the duration of the challenge.`
          : `Complete ${storedTarget} log${storedTarget === 1 ? '' : 's'} in this challenge.`;

  return {
    primary,
    extras: rulesText || structured?.primary || extras.length > 0 ? extras : [],
    cadenceLabel: cadence.cadenceLabel,
    cadenceLong: cadence.cadenceLong,
    totalHint,
    period: freq,
    count: perCount,
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
      label: `${compactCadence(count, copy.period)} · ${logged} logged`,
      ratio: 0,
    };
  }

  if (copy.period === 'once') {
    return { label: `${logged}/${count} logs`, ratio: logged / count };
  }

  const total = Math.max(Number(challenge.days_required || challenge.target_count) || 1, 1);
  return { label: `${logged}/${total} logs`, ratio: logged / total };
}
