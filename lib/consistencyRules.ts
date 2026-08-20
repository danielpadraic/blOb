import { CREATE_PROOF_TYPES } from '@/lib/constants';
import type { ChallengeFrequency, ProofType } from '@/lib/types';
import type { CreateChallengeValues } from '@/utils/validators';

export const RULE_ACTIVITY_PRESETS = [
  'workout',
  'reading session',
  'practice block',
  'check-in',
] as const;

export type RuleActivityPreset = (typeof RULE_ACTIVITY_PRESETS)[number];

export const EXTRA_RULE_KINDS = ['separate_days', 'min_minutes', 'custom'] as const;
export type ExtraRuleKind = (typeof EXTRA_RULE_KINDS)[number];

export const EXTRA_RULE_PRESETS: { kind: Exclude<ExtraRuleKind, 'custom'>; text: string }[] = [
  { kind: 'separate_days', text: 'Check-ins must be on separate calendar days' },
  { kind: 'min_minutes', text: 'Share proof of at least 30 minutes of elevated heart rate.' },
];

export type ExtraRule = {
  id: string;
  kind: ExtraRuleKind;
  text: string;
  proofs: ProofType[];
};

export type RulesStructured = {
  primary: {
    count: number;
    activity: string;
    period: ChallengeFrequency;
    proof: string[];
  } | null;
  extras: { text: string; proof?: string[] }[];
};

const PROOF_SET = new Set<string>(CREATE_PROOF_TYPES);

export function emptyExtraRule(kind: ExtraRuleKind = 'custom'): ExtraRule {
  const preset = EXTRA_RULE_PRESETS.find((item) => item.kind === kind);
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: preset?.text ?? '',
    proofs: [],
  };
}

export function isActivityPreset(value: string): value is RuleActivityPreset {
  return (RULE_ACTIVITY_PRESETS as readonly string[]).includes(value);
}

export function asRulePeriod(value: unknown): ChallengeFrequency | null {
  if (value === 'daily' || value === 'day') return 'daily';
  if (value === 'weekly' || value === 'week') return 'weekly';
  if (value === 'monthly' || value === 'month') return 'monthly';
  if (value === 'once') return 'once';
  return null;
}

export function periodNoun(frequency: string | null | undefined): 'day' | 'week' | 'month' | null {
  if (frequency === 'daily' || frequency === 'day') return 'day';
  if (frequency === 'weekly' || frequency === 'week') return 'week';
  if (frequency === 'monthly' || frequency === 'month') return 'month';
  return null;
}

export function pluralizeActivity(activity: string, count: number): string {
  const trimmed = activity.trim() || 'workout';
  if (count === 1) {
    return trimmed;
  }
  if (/s$/i.test(trimmed)) {
    return trimmed;
  }
  if (/check-in$/i.test(trimmed)) {
    return `${trimmed}s`;
  }
  return `${trimmed}s`;
}

export function ruleCount(values: Pick<CreateChallengeValues, 'target_count'>): number {
  return Math.max(Number(values.target_count) || 1, 1);
}

export function consistencyRuleSentence(
  values: Pick<
    CreateChallengeValues,
    'target_count' | 'rule_activity' | 'frequency' | 'duration_type'
  >,
): string {
  const count = ruleCount(values);
  const activity = pluralizeActivity(values.rule_activity, count);
  if (values.frequency === 'once') {
    return `Competitors must check in ${count} ${activity} for the duration of the challenge.`;
  }
  const period = periodNoun(values.frequency) ?? 'week';
  if (values.duration_type === 'unlimited') {
    return `Competitors must check in ${count} ${activity} every ${period} to stay in the challenge.`;
  }
  return `Competitors must check in ${count} ${activity} every ${period} for the duration of the challenge.`;
}

export function extraRuleLines(values: Pick<CreateChallengeValues, 'extra_rules'>): string[] {
  return (values.extra_rules ?? []).map((rule) => rule.text.trim()).filter(Boolean);
}

export function primaryRuleComplete(
  values: Pick<CreateChallengeValues, 'target_count' | 'rule_activity' | 'frequency' | 'challenge_type' | 'duration_type'>,
): boolean {
  if (values.challenge_type === 'points' && values.duration_type !== 'unlimited') {
    return false;
  }
  const count = Number(values.target_count);
  const activity = (values.rule_activity ?? '').trim();
  const period = values.frequency;
  const validPeriod =
    period === 'daily' || period === 'weekly' || period === 'monthly' || period === 'once';
  return Number.isFinite(count) && count >= 1 && activity.length >= 2 && validPeriod;
}

export function hasDefinedRules(
  values: Pick<
    CreateChallengeValues,
    | 'rules'
    | 'target_count'
    | 'rule_activity'
    | 'frequency'
    | 'duration_type'
    | 'extra_rules'
    | 'challenge_type'
  > &
    Partial<Pick<CreateChallengeValues, 'task' | 'extra_tasks' | 'proofs' | 'challenge_proofs'>>,
): boolean {
  if ((values.rules ?? '').trim().length > 0) {
    return true;
  }
  if (extraRuleLines(values).length > 0) {
    return true;
  }
  if (primaryRuleComplete(values)) {
    return true;
  }
  return composeChallengeRules(values).trim().length > 0;
}

export function composeChallengeRules(
  values: Pick<
    CreateChallengeValues,
    'target_count' | 'rule_activity' | 'frequency' | 'duration_type' | 'extra_rules' | 'challenge_type'
  > &
    Partial<Pick<CreateChallengeValues, 'task' | 'extra_tasks' | 'proofs' | 'challenge_proofs' | 'rules'>>,
): string {
  if (values.challenge_type === 'points' && values.duration_type !== 'unlimited') {
    return extraRuleLines(values).join('\n\n');
  }
  const { challengeRulesFromCreateValues } = require('./challengeRuleCopy') as typeof import('./challengeRuleCopy');
  const english = challengeRulesFromCreateValues(values);
  return [english, ...extraRuleLines(values)].filter(Boolean).join('\n\n');
}

export function periodCountInDuration(durationDays: number, frequency: ChallengeFrequency): number {
  const days = Math.max(durationDays || 1, 1);
  if (frequency === 'once') {
    return 1;
  }
  if (frequency === 'daily') {
    return days;
  }
  if (frequency === 'monthly') {
    return Math.max(1, Math.round(days / 30));
  }
  return Math.max(1, Math.round(days / 7));
}

export function deriveFinishTarget(
  values: Pick<
    CreateChallengeValues,
    'challenge_type' | 'duration_type' | 'duration_days' | 'frequency' | 'target_count' | 'tasks'
  >,
): number {
  if (values.challenge_type === 'points' && values.duration_type !== 'unlimited') {
    return Math.max(values.tasks?.length || 1, 1);
  }
  const count = ruleCount(values);
  if (values.duration_type === 'unlimited') {
    return count;
  }
  const days = Math.max(Number(values.duration_days) || 7, 1);
  return count * periodCountInDuration(days, values.frequency);
}

export function buildRulesStructured(
  values: Pick<
    CreateChallengeValues,
    | 'challenge_type'
    | 'duration_type'
    | 'target_count'
    | 'rule_activity'
    | 'frequency'
    | 'proofs'
    | 'extra_rules'
  >,
): RulesStructured {
  const extras = (values.extra_rules ?? []).flatMap((rule) => {
    const text = rule.text.trim();
    if (!text) {
      return [];
    }
    const proof = (rule.proofs ?? []).filter(Boolean);
    return proof.length > 0 ? [{ text, proof }] : [{ text }];
  });
  if (values.challenge_type === 'points' && values.duration_type !== 'unlimited') {
    return { primary: null, extras };
  }
  return {
    primary: {
      count: ruleCount(values),
      activity: values.rule_activity.trim() || 'workout',
      period: values.frequency,
      proof: [...(values.proofs ?? [])],
    },
    extras,
  };
}

export function extraHasMinMinutes(values: Pick<CreateChallengeValues, 'extra_rules'>): boolean {
  return (values.extra_rules ?? []).some((rule) => rule.kind === 'min_minutes');
}

function asProofList(value: unknown): ProofType[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === 'string' && PROOF_SET.has(item)) {
      return [item as ProofType];
    }
    if (item && typeof item === 'object') {
      const type = (item as { type?: unknown }).type;
      if (typeof type === 'string' && PROOF_SET.has(type)) {
        return [type as ProofType];
      }
    }
    return [];
  });
}

export function asExtraRules(value: unknown): ExtraRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) {
        return [];
      }
      return [
        {
          id: `rule-${index + 1}`,
          kind: 'custom' as const,
          text,
          proofs: [],
        },
      ];
    }
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    const kind = EXTRA_RULE_KINDS.includes(row.kind as ExtraRuleKind)
      ? (row.kind as ExtraRuleKind)
      : 'custom';
    const preset = EXTRA_RULE_PRESETS.find((item) => item.kind === kind);
    const text =
      typeof row.text === 'string' && row.text.trim()
        ? row.text.trim()
        : preset?.text ?? '';
    if (!text && kind === 'custom') {
      return [];
    }
    return [
      {
        id: typeof row.id === 'string' && row.id ? row.id : `rule-${index + 1}`,
        kind,
        text,
        proofs: asProofList(row.proofs ?? row.proof),
      },
    ];
  });
}

export function parseRulesStructured(raw: unknown): RulesStructured | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const primaryRaw = row.primary;
  let primary: RulesStructured['primary'] = null;
  if (primaryRaw && typeof primaryRaw === 'object' && !Array.isArray(primaryRaw)) {
    const item = primaryRaw as Record<string, unknown>;
    const period = asRulePeriod(item.period);
    const activity = typeof item.activity === 'string' ? item.activity.trim() : '';
    if (period && activity) {
      primary = {
        count: Math.max(Number(item.count) || 1, 1),
        activity,
        period,
        proof: asProofList(item.proof ?? item.proofs),
      };
    }
  }
  const extrasRaw = Array.isArray(row.extras) ? row.extras : [];
  const extras = extrasRaw.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) {
      return [{ text: item.trim() }];
    }
    if (!item || typeof item !== 'object') {
      return [];
    }
    const extra = item as Record<string, unknown>;
    const text = typeof extra.text === 'string' ? extra.text.trim() : '';
    if (!text) {
      return [];
    }
    const proof = asProofList(extra.proof ?? extra.proofs);
    return proof.length > 0 ? [{ text, proof }] : [{ text }];
  });
  if (!primary && extras.length === 0) {
    return null;
  }
  return { primary, extras };
}

export function extraRulesFromStructured(structured: RulesStructured | null): ExtraRule[] {
  if (!structured) {
    return [];
  }
  return structured.extras.map((item, index) => {
    const preset = EXTRA_RULE_PRESETS.find((row) => row.text === item.text);
    return {
      id: `rule-${index + 1}`,
      kind: preset?.kind ?? 'custom',
      text: item.text,
      proofs: (item.proof ?? []).filter((type): type is ProofType => PROOF_SET.has(type)),
    };
  });
}
