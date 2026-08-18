import { defaultSchedule, ensureSchedule, parseScheduleDate, scheduleRangeLabel, scheduleSummary } from '@/lib/challengeSchedule';

import {
  fundingModelSummary,
  lastManStandingRequirement,
  prizeStructureSummary,
} from '@/lib/challenges';
import { challengeCategoryLabel } from '@/lib/constants';
import type { ChallengeWithStats, ProofType } from '@/lib/types';
import {
  composeChallengeRules,
  consistencyRuleSentence,
  deriveFinishTarget,
  extraHasMinMinutes,
  extraRuleLines,
  emptyExtraRule,
  buildRulesStructured,
  type ExtraRule,
} from '@/lib/consistencyRules';
import { laneReviewLine, normalizeUserChallengeLane } from '@/lib/challengeLane';
import { formatWallet } from '@/lib/currency';
import { emptyChallengeTask, createChallengeSchema, type CreateChallengeValues } from '@/utils/validators';

const FITNESS_PROOFS: ProofType[] = ['pre_selfie', 'post_selfie', 'hr_monitor'];

export const CREATE_WIZARD_STEPS = [
  { key: 'lane', label: 'Lane' },
  { key: 'start', label: 'Start' },
  { key: 'goal', label: 'Goal' },
  { key: 'type', label: 'Type' },
  { key: 'duration', label: 'Duration' },
  { key: 'prize', label: 'Prize Structure' },
  { key: 'funding', label: 'Funding' },
  { key: 'entry', label: 'Entry & Limits' },
  { key: 'rules', label: 'Rules & Proof' },
  { key: 'review', label: 'Review' },
] as const;

export type CreateWizardStepKey = (typeof CREATE_WIZARD_STEPS)[number]['key'];

export function wizardStepIndex(key: CreateWizardStepKey): number {
  return CREATE_WIZARD_STEPS.findIndex((item) => item.key === key);
}

export const CREATE_STEP_FIELDS: Record<number, readonly (keyof CreateChallengeValues)[]> = {
  0: ['challenge_lane'],
  1: [],
  2: ['title', 'description', 'category', 'visibility'],
  3: ['challenge_type'],
  4: ['duration_type', 'duration_days', 'starts_at', 'ends_at', 'end_mode', 'duration_value', 'duration_unit', 'frequency', 'target_count'],
  5: ['prize_structure', 'top_places_mode', 'top_places_value', 'top_places_distribution'],
  6: ['funding_model', 'creator_contribution'],
  7: ['buy_in', 'currency', 'participant_cap', 'max_participants', 'creator_participating'],
  8: ['rules', 'proofs', 'tasks', 'frequency', 'target_count', 'rule_activity', 'extra_rules', 'min_minutes', 'cover_image_url', 'rules_video_url'],
  9: [],
};

export type ChallengeTemplateId =
  | 'weekly_consistency'
  | 'last_man_standing'
  | 'family'
  | 'office'
  | 'skill_showdown'
  | 'custom';

export type CreateStartPath = 'scratch' | 'template' | 'previous' | null;

export type ChallengeTemplate = {
  id: ChallengeTemplateId;
  title: string;
  eyebrow: string;
  blurb: string;
  means: string;
  values: CreateChallengeValues;
};

function task(title: string, points: string, proofRequired = true): CreateChallengeValues['tasks'][number] {
  return {
    ...emptyChallengeTask(),
    title,
    points,
    proof_required: proofRequired,
    proofs: proofRequired ? ['photo'] : [],
  };
}

function extra(kind: ExtraRule['kind']): ExtraRule {
  return emptyExtraRule(kind);
}

function values(partial: CreateChallengeValues): CreateChallengeValues {
  return {
    ...partial,
    proofs: [...partial.proofs],
    tasks: partial.tasks.map((item) => ({ ...item, proofs: [...(item.proofs ?? [])] })),
    extra_rules: (partial.extra_rules ?? []).map((item) => ({ ...item, proofs: [...(item.proofs ?? [])] })),
  };
}

export const DEFAULT_CREATE_VALUES: CreateChallengeValues = {
  title: '',
  description: '',
  category: 'fitness',
  challenge_type: 'consistency',
  visibility: 'public',
  challenge_lane: 'coins',
  buy_in: '10',
  duration_type: 'fixed',
  ...defaultSchedule(),
  target_count: '6',
  frequency: 'weekly',
  rule_activity: 'workout',
  extra_rules: [],
  proofs: [...FITNESS_PROOFS],
  tasks: [emptyChallengeTask()],
  prize_structure: 'equal_split',
  top_places_mode: 'percent',
  top_places_value: '10',
  top_places_distribution: 'even',
  funding_model: 'participants',
  creator_contribution: '0',
  participant_cap: 'unlimited',
  max_participants: '20',
  currency: 'coins',
  creator_participating: true,
  min_minutes: '30',
  cover_image_url: '',
  rules_video_url: '',
  rules: '',
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'weekly_consistency',
    title: 'Weekly Consistency',
    eyebrow: '7 days · equal split',
    blurb: 'Show up six times this week. Everyone who finishes splits the pool.',
    means:
      'A 7-day fitness streak. Competitors log 6 days with pre/post selfies and heart-rate proof. Completers split the prize evenly.',
    values: values({
      ...DEFAULT_CREATE_VALUES,
      title: 'Weekly Consistency Challenge',
      description:
        'For anyone who wants a honest week of training. Win by completing 6 sessions in 7 days — finishers split the pool.',
      category: 'fitness',
      challenge_type: 'consistency',
      visibility: 'public',
      buy_in: '10',
      duration_days: '7',
      duration_type: 'fixed',
      target_count: '6',
      frequency: 'weekly',
      rule_activity: 'workout',
      extra_rules: [extra('separate_days'), extra('min_minutes')],
      proofs: [...FITNESS_PROOFS],
      prize_structure: 'equal_split',
      funding_model: 'participants',
      creator_contribution: '0',
      participant_cap: 'unlimited',
      rules:
        'Complete 6 workouts of at least 30 minutes in 7 days. Each log needs a pre-selfie, a post-selfie, and a heart-rate screenshot. Miss the target and you get 0.00 Coins. Finishers split the prize pool evenly.',
    }),
  },
  {
    id: 'last_man_standing',
    title: 'Last Man Standing',
    eyebrow: '∞ · winner takes all',
    blurb: 'No end date. Miss a week and you’re out. Last person standing takes the pool.',
    means:
      'Unlimited duration. Stay eligible with 5 logs every week. Miss a week and you’re eliminated. The last person still in wins everything.',
    values: values({
      ...DEFAULT_CREATE_VALUES,
      title: 'Last Man Standing',
      description:
        'For crews who want a long game. Stay eligible every week — the last person still meeting the bar wins the whole pool.',
      category: 'fitness',
      challenge_type: 'consistency',
      visibility: 'public',
      buy_in: '25',
      duration_days: '7',
      duration_type: 'unlimited',
      target_count: '5',
      frequency: 'weekly',
      rule_activity: 'workout',
      extra_rules: [extra('separate_days'), extra('min_minutes')],
      proofs: [...FITNESS_PROOFS],
      prize_structure: 'winner_take_all',
      funding_model: 'participants',
      creator_contribution: '0',
      participant_cap: 'unlimited',
      rules:
        'No end date. Log 5 honest sessions every week to stay eligible. Miss a week and you’re out. The last person still standing wins the entire prize pool.',
    }),
  },
  {
    id: 'family',
    title: 'Family / Parent',
    eyebrow: 'Private · you fund it',
    blurb: 'A household challenge. You put up the Coins; they just show up.',
    means:
      'Private, creator-funded, capped at 8. 14 days, photo proof, everyone who hits the target splits your prize.',
    values: values({
      ...DEFAULT_CREATE_VALUES,
      title: 'Family week — show up together',
      description:
        'For your household. Keep it kind and doable. A win is everyone logging the activity you agreed on for two weeks.',
      category: 'other',
      challenge_type: 'consistency',
      visibility: 'private',
      buy_in: '0',
      duration_days: '14',
      duration_type: 'fixed',
      target_count: '8',
      frequency: 'once',
      rule_activity: 'check-in',
      extra_rules: [extra('separate_days')],
      proofs: ['photo'],
      prize_structure: 'equal_split',
      funding_model: 'creator',
      creator_contribution: '50',
      participant_cap: 'limited',
      max_participants: '8',
      rules:
        'Household only — keep it kind. Log a photo of the activity you agreed on. Everyone who hits 8 logs in 14 days splits the pool. You fund the prize; competitors enter free.',
    }),
  },
  {
    id: 'office',
    title: 'Office / Team',
    eyebrow: '30 days · top 3',
    blurb: 'Work-hours friendly. You seed the pool, the team buys in, top 3 share it.',
    means:
      'Private 30-day team challenge. Three logs a week. You put in a base, competitors buy in, and the top 3 share the pool on a sliding scale.',
    values: values({
      ...DEFAULT_CREATE_VALUES,
      title: 'Office team challenge',
      description:
        'For your team or office crew. A win is three honest sessions a week for 30 days. Top 3 take the pool.',
      category: 'fitness',
      challenge_type: 'consistency',
      visibility: 'private',
      buy_in: '10',
      duration_days: '30',
      duration_type: 'fixed',
      target_count: '3',
      frequency: 'weekly',
      rule_activity: 'workout',
      extra_rules: [extra('separate_days')],
      proofs: ['photo'],
      prize_structure: 'top_places',
      top_places_mode: 'count',
      top_places_value: '3',
      top_places_distribution: 'scaled',
      funding_model: 'hybrid',
      creator_contribution: '100',
      participant_cap: 'limited',
      max_participants: '24',
      rules:
        'Three honest sessions a week for 30 days. Photo proof. Work-hours friendly — no 5am club required. You seed the pool; everyone also buys in. Top 3 share it on a sliding scale (1st earns the most).',
    }),
  },
  {
    id: 'skill_showdown',
    title: 'Skill Showdown',
    eyebrow: 'Points · winner takes all',
    blurb: 'A scored task list. Highest total wins the whole pool.',
    means:
      '14-day points challenge. Competitors complete scored tasks with proof. Highest point total takes the entire prize pool.',
    values: values({
      ...DEFAULT_CREATE_VALUES,
      title: 'Skill Showdown',
      description:
        'For people who want a scored contest, not a streak. A win is the highest point total on the task list before the window closes.',
      category: 'education',
      challenge_type: 'points',
      visibility: 'public',
      buy_in: '15',
      duration_days: '14',
      duration_type: 'fixed',
      target_count: '3',
      frequency: 'once',
      proofs: ['photo'],
      tasks: [
        task('Practice the skill and log the session', '10'),
        task('Share a before/after or progress clip', '20'),
        task('Hit a personal best or ship the work', '30'),
      ],
      prize_structure: 'winner_take_all',
      funding_model: 'participants',
      creator_contribution: '0',
      participant_cap: 'unlimited',
      rules:
        'Complete the scored tasks before the window closes. Attach proof when a task asks for it. Highest point total wins the entire prize pool.',
    }),
  },
  {
    id: 'custom',
    title: 'Start from scratch',
    eyebrow: 'You decide',
    blurb: 'Blank challenge. Later slides start with simple defaults you can change.',
    means: 'No preset story. You’ll set the goal, scoring, dates, prize, and proof one slide at a time.',
    values: values(DEFAULT_CREATE_VALUES),
  },
];

export function templateById(id: ChallengeTemplateId | null): ChallengeTemplate | null {
  if (!id) {
    return null;
  }
  return CHALLENGE_TEMPLATES.find((item) => item.id === id) ?? null;
}

export function cloneTemplateValues(source: CreateChallengeValues): CreateChallengeValues {
  const proofs = Array.isArray(source?.proofs) ? [...source.proofs] : [...DEFAULT_CREATE_VALUES.proofs];
  const tasks =
    Array.isArray(source?.tasks) && source.tasks.length > 0
      ? source.tasks.map((item) => ({
          id: item?.id || emptyChallengeTask().id,
          title: typeof item?.title === 'string' ? item.title : '',
          points: item?.points != null ? String(item.points) : '10',
          proof_required: Boolean(item?.proof_required),
          proofs:
            Array.isArray(item?.proofs) && item.proofs.length > 0
              ? [...item.proofs]
              : item?.proof_required
                ? (['photo'] as CreateChallengeValues['proofs'])
                : [],
        }))
      : DEFAULT_CREATE_VALUES.tasks.map((task) => ({ ...task, id: emptyChallengeTask().id }));
  const extra_rules = Array.isArray(source?.extra_rules)
    ? source.extra_rules.map((item) => ({
        ...item,
        proofs: [...(item.proofs ?? [])],
      }))
    : [];
  return {
    ...DEFAULT_CREATE_VALUES,
    ...source,
    proofs: proofs.length > 0 ? proofs : [...DEFAULT_CREATE_VALUES.proofs],
    tasks,
    extra_rules,
    rule_activity: source?.rule_activity?.trim() || DEFAULT_CREATE_VALUES.rule_activity,
  };
}

export function isPointsDraft(values: Pick<CreateChallengeValues, 'challenge_type' | 'duration_type'>): boolean {
  return values.challenge_type === 'points' && values.duration_type !== 'unlimited';
}

export function isUnlimitedDraft(values: Pick<CreateChallengeValues, 'duration_type'>): boolean {
  return values.duration_type === 'unlimited';
}

export function wizardMeans(
  step: number,
  values: CreateChallengeValues,
  template: ChallengeTemplate | null,
): string {
  const buyIn = Math.max(Number(values.buy_in) || 0, 0);
  const contribution = Math.max(Number(values.creator_contribution) || 0, 0);
  const days = Math.max(Number(values.duration_days) || 7, 1);
  const target = Math.max(Number(values.target_count) || 1, 1);
  const points = isPointsDraft(values);
  const unlimited = isUnlimitedDraft(values);

  switch (step) {
    case 0:
      return normalizeUserChallengeLane(values.challenge_lane) === 'private'
        ? 'Private challenge. Invite-only, and you fund the prize.'
        : 'Coin challenge. Practice and Coins, listed in the Lobby if you keep it public.';
    case 1:
      if (template?.id && template.id !== 'custom') {
        return template.means;
      }
      return 'Start blank, pick a template, or copy a challenge you’ve hosted or joined. Every later slide stays editable.';
    case 2: {
      const vis =
        values.visibility === 'private'
          ? 'Only invited people will see it.'
          : 'Anyone in the Lobby can find and join it.';
      const name = (typeof values.title === 'string' ? values.title.trim() : '') || 'Your challenge';
      return `${name} is a ${challengeCategoryLabel(values.category)} challenge. ${vis}`;
    }
    case 3:
      if (unlimited) {
        return 'Last-man-standing uses Consistency so everyone is judged on staying eligible — not on a point total.';
      }
      if (points) {
        const total = values.tasks.reduce((sum, task) => sum + Math.max(Number(task.points) || 0, 0), 0);
        return `Competitors earn points from your task list (${values.tasks.length} task${
          values.tasks.length === 1 ? '' : 's'
        }, ${total} pts). Highest totals rank when it ends.`;
      }
      return consistencyRuleSentence(values);
    case 4:
      if (unlimited) {
        return `${lastManStandingRequirement({
          frequency: values.frequency,
          target_count: target,
        })} There is no end date until one person remains.`;
      }
      if (parseScheduleDate(values.starts_at) && parseScheduleDate(values.ends_at)) {
        return `${scheduleSummary(values.starts_at, values.ends_at)}. Then judging and payout.`;
      }
      return `It runs ${days} day${days === 1 ? '' : 's'}, then judging and payout.`;
    case 5:
      return prizeStructureSummary({
        prize_structure: unlimited ? 'winner_take_all' : values.prize_structure,
        top_places_mode: values.top_places_mode,
        top_places_value: values.top_places_value,
        top_places_distribution: values.top_places_distribution,
        is_unlimited: unlimited,
      });
    case 6:
      return fundingModelSummary({
        funding_model: values.funding_model,
        creator_contribution: values.funding_model === 'participants' ? 0 : contribution,
        buy_in_amount: buyIn,
        currency: values.currency,
      });
    case 7: {
      const entry = buyIn > 0 ? `Buy-in is ${formatWallet(buyIn, values.currency)} per competitor.` : 'Competitors enter free.';
      const cap =
        values.participant_cap === 'limited'
          ? `Max ${Math.max(Number(values.max_participants) || 0, 0)} competitors.`
          : 'Unlimited competitors.';
      return `${entry} ${cap}`;
    }
    case 8:
      if (points) {
        const needingProof = values.tasks.filter((task) => task.proof_required || (task.proofs?.length ?? 0) > 0).length;
        return `${values.tasks.length} task${values.tasks.length === 1 ? '' : 's'}. ${needingProof} require proof.`;
      }
      return composeChallengeRules(values);
    case 9:
      return 'This is the contract competitors see. Publishing creates a real, joinable challenge. You are not entered automatically.';
    default:
      return '';
  }
}

export function challengeReviewSections(values: CreateChallengeValues): { title: string; body: string }[] {
  const buyIn = Math.max(Number(values.buy_in) || 0, 0);
  const contribution =
    values.funding_model === 'participants' ? 0 : Math.max(Number(values.creator_contribution) || 0, 0);
  const days = Math.max(Number(values.duration_days) || 7, 1);
  const points = isPointsDraft(values);
  const unlimited = isUnlimitedDraft(values);
  const vis = laneReviewLine(values);

  const duration = unlimited
    ? `Unlimited (Last Man Standing). ${lastManStandingRequirement({
        frequency: values.frequency,
        target_count: Math.max(Number(values.target_count) || 1, 1),
      })}`
    : parseScheduleDate(values.starts_at) && parseScheduleDate(values.ends_at)
      ? scheduleSummary(values.starts_at, values.ends_at)
      : `Fixed ${days}-day window.`;

  const scoring = points
    ? `Points. Competitors complete ${values.tasks.length} task${
        values.tasks.length === 1 ? '' : 's'
      } totaling ${values.tasks.reduce((sum, task) => sum + Math.max(Number(task.points) || 0, 0), 0)} pts.`
    : unlimited
      ? 'Consistency. Stay eligible on the cadence above or you’re eliminated.'
      : consistencyRuleSentence(values);

  const proof = points
    ? values.tasks
        .map((task, index) => {
          const proofs = task.proofs?.length ? task.proofs.join(', ') : task.proof_required ? 'photo' : '';
          return `${index + 1}. ${task.title.trim() || 'Untitled'} (${task.points} pts${proofs ? `, ${proofs}` : ''})`;
        })
        .join('\n')
    : `Proof each log: ${values.proofs.join(', ') || 'none'}.`;

  const entry =
    values.participant_cap === 'limited'
      ? `${buyIn > 0 ? `${formatWallet(buyIn, values.currency)} to enter` : 'Free to enter'}. Max ${Math.max(
          Number(values.max_participants) || 0,
          0,
        )} competitors.`
      : `${buyIn > 0 ? `${formatWallet(buyIn, values.currency)} to enter` : 'Free to enter'}. Unlimited competitors.`;

  return [
    { title: 'Who it’s for', body: `${values.title.trim()}\n${values.description.trim()}\n${vis}` },
    { title: 'How you win', body: scoring },
    { title: 'How long it runs', body: duration },
    {
      title: 'How the prize is paid',
      body: prizeStructureSummary({
        prize_structure: unlimited ? 'winner_take_all' : values.prize_structure,
        top_places_mode: values.top_places_mode,
        top_places_value: values.top_places_value,
        top_places_distribution: values.top_places_distribution,
        is_unlimited: unlimited,
      }),
    },
    {
      title: 'Who funds it',
      body: fundingModelSummary({
        funding_model: values.funding_model,
        creator_contribution: contribution,
        buy_in_amount: buyIn,
        currency: values.currency,
      }),
    },
    { title: 'Entry & limits', body: entry },
    {
      title: 'You’re in it',
      body: values.creator_participating ? 'You’re competing too.' : 'You’re hosting only',
    },
    { title: 'Rules & proof', body: [proof, composeChallengeRules(values)].filter(Boolean).join('\n\n') },
  ];
}

function shortPrizeLabel(values: CreateChallengeValues): string {
  if (isUnlimitedDraft(values) || values.prize_structure === 'winner_take_all') {
    return 'Winner take all';
  }
  if (values.prize_structure === 'top_places') {
    return 'Top places';
  }
  return 'Equal split';
}

export function challengeContractRows(values: CreateChallengeValues): { label: string; body: string }[] {
  const lane = normalizeUserChallengeLane(values.challenge_lane);
  const buyIn = Math.max(Number(values.buy_in) || 0, 0);
  const points = isPointsDraft(values);
  const unlimited = isUnlimitedDraft(values);
  const typeLabel = points ? 'Points' : 'Consistency';
  const rules = points
    ? [
        `Points race. ${values.tasks.length} task${values.tasks.length === 1 ? '' : 's'}.`,
        ...extraRuleLines(values),
      ]
        .filter(Boolean)
        .join('\n')
    : [consistencyRuleSentence(values), ...extraRuleLines(values)].filter(Boolean).join('\n');
  const schedule = unlimited
    ? 'No end date until one person remains.'
    : scheduleRangeLabel(values.starts_at, values.ends_at);
  const visibility =
    lane === 'private'
      ? 'Invite-only'
      : values.visibility === 'private'
        ? 'Unlisted'
        : 'Public';
  const competitors =
    values.participant_cap === 'limited'
      ? `Max ${Math.max(Number(values.max_participants) || 0, 0)}`
      : 'Unlimited';

  return [
    { label: 'Lane', body: lane === 'private' ? 'Private Challenge' : 'Coin Challenge' },
    { label: 'Title', body: values.title.trim() || 'Untitled challenge' },
    { label: 'Type', body: `${typeLabel} / ${challengeCategoryLabel(values.category)}` },
    { label: 'Rules', body: rules || 'Set what competitors must log.' },
    { label: 'Schedule', body: schedule },
    { label: 'Entry', body: buyIn > 0 ? formatWallet(buyIn, lane === 'private' ? values.currency : 'coins') : 'Free' },
    { label: 'Prize structure', body: shortPrizeLabel(values) },
    { label: 'Visibility', body: visibility },
    { label: 'Competitors', body: competitors },
    {
      label: 'You',
      body: values.creator_participating ? 'You’re competing too.' : 'You’re hosting only',
    },
  ];
}

export function previewFromValues(values: CreateChallengeValues): ChallengeWithStats {
  const unlimited = isUnlimitedDraft(values);
  const points = isPointsDraft(values);
  const schedule = ensureSchedule(values);
  const tasks = Array.isArray(values?.tasks) ? values.tasks : [];
  const proofs = Array.isArray(values?.proofs) ? values.proofs : [];
  const title = typeof values?.title === 'string' ? values.title : '';
  const parsedTasks = tasks.map((task, index) => ({
    id: task?.id || `preview-${index}`,
    title: String(task?.title ?? '').trim() || `Task ${index + 1}`,
    points: Number(task?.points) || 0,
    proof_required: Boolean(task?.proof_required) || (task?.proofs?.length ?? 0) > 0,
    proof_types: (task?.proofs?.length ? task.proofs : task?.proof_required ? ['photo'] : []) as string[],
  }));
  const target = deriveFinishTarget(values);
  const cap =
    values.participant_cap === 'limited' && Number(values.max_participants) > 0
      ? Number(values.max_participants)
      : null;
  const buyIn = Math.max(Number(values.buy_in) || 0, 0);
  const contribution =
    values.funding_model === 'participants' ? 0 : Math.max(Number(values.creator_contribution) || 0, 0);

  return {
    id: 'preview',
    title: title.trim() || 'Your challenge title',
    description: typeof values.description === 'string' ? values.description.trim() || null : null,
    rules: composeChallengeRules(values) || null,
    is_official: false,
    created_by: null,
    buy_in_amount: buyIn,
    days_required: target,
    min_minutes: extraHasMinMinutes(values)
      ? 30
      : Math.max(Number(values.min_minutes) || (values.category === 'fitness' ? 30 : 1), 1),
    proof_requirements: proofs.map((type) => ({ type, required: true })),
    target_count: target,
    frequency: points ? 'once' : values.frequency,
    tasks: points ? parsedTasks : [],
    status: 'open',
    starts_at: schedule.starts_at,
    ends_at: unlimited ? null : schedule.ends_at,
    prize_pool: contribution,
    prize_structure: unlimited ? 'winner_take_all' : values.prize_structure,
    top_places_mode: values.prize_structure === 'top_places' ? values.top_places_mode : null,
    top_places_value: values.prize_structure === 'top_places' ? Number(values.top_places_value) || null : null,
    top_places_distribution:
      values.prize_structure === 'top_places' ? values.top_places_distribution : null,
    funding_model: values.funding_model,
    creator_contribution: contribution,
    max_participants: cap,
    is_unlimited: unlimited,
    category: values.category,
    challenge_type: unlimited ? 'consistency' : values.challenge_type,
    visibility: values.visibility,
    challenge_lane: values.challenge_lane === 'private' ? 'private' : 'coins',
    currency: values.challenge_lane === 'private' && values.currency === 'bucks' ? 'bucks' : 'coins',
    creator_participating: values.creator_participating !== false,
    cover_image_url: values.cover_image_url?.trim() || null,
    rules_video_url: values.rules_video_url?.trim() || null,
    rules_list: buildRulesStructured(values),
    created_at: schedule.starts_at,
    updated_at: schedule.starts_at,
    participant_count: 0,
  };
}

export function coinFlowLines(values: CreateChallengeValues): { label: string; body: string }[] {
  const buyIn = Math.max(Number(values.buy_in) || 0, 0);
  const contribution =
    values.funding_model === 'participants' ? 0 : Math.max(Number(values.creator_contribution) || 0, 0);
  const money = (amount: number) => formatWallet(amount, values.currency);
  const noun = values.currency === 'bucks' ? 'Bucks' : 'Coins';
  const lines: { label: string; body: string }[] = [];

  if (contribution > 0) {
    lines.push({
      label: 'You, on publish',
      body: `${money(contribution)} leave your wallet and start the prize pool.`,
    });
  } else {
    lines.push({
      label: 'You, on publish',
      body: `0.00 ${noun}. The pool starts empty until people join.`,
    });
  }

  if (buyIn > 0) {
    lines.push({
      label: 'Each competitor',
      body: `${money(buyIn)} moves from their wallet into the prize pool. Not refundable.`,
    });
  } else {
    lines.push({
      label: 'Each competitor',
      body: `Enters free. They don’t add ${noun} to the pool.`,
    });
  }

  return lines;
}

if (__DEV__) {
  for (const template of CHALLENGE_TEMPLATES) {
    if (template.id === 'custom') {
      continue;
    }
    const parsed = createChallengeSchema.safeParse(template.values);
    if (!parsed.success) {
      console.warn(
        '[blob:templates]',
        template.id,
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
  }
}
