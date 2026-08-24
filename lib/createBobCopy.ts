import { CREATE_STEP_FIELDS, wizardStepIndex } from '@/lib/challengeTemplates';
import { CHALLENGE_CATEGORIES } from '@/lib/constants';
import type { ChallengeCategory } from '@/lib/types';
import type { CreateChallengeValues } from '@/utils/validators';

type BobTipPose = 'wave' | 'point' | 'trophy';

export type WizardBobTip = { pose: BobTipPose; tagline: string; example?: string };

export function bobExampleLine(example: string): string {
  const trimmed = example.trim();
  if (/^(example:|not allowed:)/i.test(trimmed)) {
    return trimmed;
  }
  return `Example: ${trimmed}`;
}

const GOAL_INTRO: WizardBobTip = {
  pose: 'wave',
  tagline: 'Pick a type so people know what kind of competition this is. Every challenge on blOb is a contest of effort and skill.',
};

const GOAL_TYPE_TIPS: Record<ChallengeCategory, WizardBobTip> = {
  fitness: {
    pose: 'point',
    tagline: 'Stay active together.',
    example: 'check in with 8,000 steps a day, or 30+ minutes with an elevated heart rate, several days a week.',
  },
  sports: {
    pose: 'point',
    tagline: 'Head-to-head or scored sport goals.',
    example: 'a climbing scoreboard with friends, or who posts the better 5K time this month—with proof.',
  },
  productivity: {
    pose: 'point',
    tagline: 'Work and habits you actually keep.',
    example: 'a friendly sales streak with a coworker, or wake up by 6 a.m. every weekday for a month.',
  },
  education: {
    pose: 'point',
    tagline: 'Practice with a purpose.',
    example: '25 minutes of intentional practice a day on a language, instrument, or new skill—and check in.',
  },
  creative: {
    pose: 'point',
    tagline: 'Make and show the work.',
    example: 'a writing or design group posts one new piece a day for 30 days.',
  },
  reading: {
    pose: 'point',
    tagline: 'Pages with accountability.',
    example: 'read 10 pages daily and drop a one-line summary as proof.',
  },
  gaming: {
    pose: 'point',
    tagline: 'Skill-based matches and climbs—not betting on random outcomes.',
    example: 'ranked wins with screenshots, or a points race for objectives you play.',
  },
  other: {
    pose: 'point',
    tagline: 'Anything you invent that’s a contest of personal effort and skill—training, building, performing, practicing.',
    example: 'Not allowed: gambling, pure chance, or risk with no real skill or personal effort. Those can get an account removed.',
  },
};

function goalTips(): WizardBobTip[] {
  return [GOAL_INTRO, ...CHALLENGE_CATEGORIES.map((key) => GOAL_TYPE_TIPS[key])];
}

export function wizardGoalTypeTipIndex(category: string): number {
  const index = (CHALLENGE_CATEGORIES as readonly string[]).indexOf(category);
  return index >= 0 ? index + 1 : 0;
}

export const ENTRY_TABS = ['coins', 'bucks', 'free'] as const;
export type EntryTab = (typeof ENTRY_TABS)[number];

export function entryTabFromValues(values: { buy_in: string; currency: string }): EntryTab {
  if (Math.max(Number(values.buy_in) || 0, 0) <= 0) {
    return 'free';
  }
  return values.currency === 'bucks' ? 'bucks' : 'coins';
}

export function wizardEntryTabTipIndex(tab: string): number {
  if (tab === 'coins') {
    return 1;
  }
  return 0;
}

const STEP_TIPS: Record<number, WizardBobTip[]> = {
  0: [
    {
      pose: 'wave',
      tagline:
        'Pick how this challenge works. Coin challenges are for practice and Coins. Private challenges are invite-only and you fund the prize.',
    },
  ],
  1: [{ pose: 'wave', tagline: 'Let’s build one.' }],
  2: goalTips(),
  3: [{ pose: 'point', tagline: 'Consistency is daily check-ins. Points is a score race. Pick what fits.' }],
  4: [
    { pose: 'point', tagline: 'Set start and end. Timed challenges close when time’s up.' },
    { pose: 'point', tagline: 'You can’t end a timed challenge early.' },
  ],
  5: [
    { pose: 'point', tagline: 'Blobs who complete the goal share the prize.' },
    { pose: 'point', tagline: 'Winner take all pays the top.' },
  ],
  6: [
    {
      pose: 'point',
      tagline: 'Comparable Points puts different kinds of work on one board. Configure it, or skip it.',
    },
  ],
  7: [{ pose: 'point', tagline: 'Who puts money in—the host, the competitors, or both?' }],
  8: [
    { pose: 'point', tagline: 'Anyone can join without paying.' },
    {
      pose: 'point',
      tagline: 'Each competitor pays Coins from their balance when they enter.',
    },
  ],
  9: [
    { pose: 'point', tagline: 'Write the rule like a sentence competitors can repeat.' },
    { pose: 'point', tagline: 'Add limits (separate days, min minutes) so people can’t game a single day.' },
    { pose: 'point', tagline: 'Video is OK when a photo isn’t enough.' },
  ],
  10: [{ pose: 'trophy', tagline: 'Check everything. Publish makes it live in the Lobby.' }],
};

const LIVE_TIP: WizardBobTip = { pose: 'trophy', tagline: 'Your challenge is live.' };

export function wizardBobTips(
  step: number,
  live: boolean,
  lane?: string | null,
): WizardBobTip[] {
  if (live) {
    return [LIVE_TIP];
  }
  if (step === wizardStepIndex('funding') && lane === 'private') {
    return [
      {
        pose: 'point',
        tagline: 'You fund the prize in Coins or $. Competitors are not charged an entry fee.',
      },
    ];
  }
  if (step === wizardStepIndex('entry') && lane === 'private') {
    return [
      {
        pose: 'point',
        tagline: 'Invite-only. No competitor entry fee for the prize. Set a competitor cap if you want one.',
      },
    ];
  }
  return STEP_TIPS[step] ?? STEP_TIPS[wizardStepIndex('review')];
}

const OOPS_PREFIXES = ['Oops —', 'Not so fast —', 'Almost —', 'Hold up —'] as const;

const FIELD_OOPS: Record<string, string> = {
  start: 'pick scratch, a template, or a draft first.',
  challenge_lane: 'choose Coin Challenge or Private Challenge.',
  title: 'this one needs a name before we go on.',
  description: 'tell people who it’s for and what a win looks like.',
  category: 'pick a type so competitors know what they’re signing up for.',
  visibility: 'choose public or private.',
  privacy_mode: 'choose public, private, or Private Corporate.',
  challenge_type: 'pick Consistency or Points so we know how to score it.',
  duration_type: 'Set when this challenge starts and ends.',
  duration_days: 'keep it to 365 days or less.',
  starts_at: 'Set when this challenge starts and ends.',
  ends_at: 'End is the start plus the duration in days.',
  end_mode: 'Pick how many days it runs.',
  duration_value: 'Pick 1, 7, 30, or a custom number of days.',
  duration_unit: 'Duration is in days.',
  frequency: 'pick how often people need to check in.',
  target_count: 'say how many times they must check in.',
  rule_activity: 'name the activity they check in for.',
  extra_rules: 'that extra rule needs a line of text.',
  prize_structure: 'pick how the prize is split.',
  top_places_mode: 'pick percent or a count for top places.',
  top_places_value: 'say how many places share the prize.',
  top_places_distribution: 'pick how those places split the prize.',
  funding_model: 'who puts money in—the host, the competitors, or both?',
  creator_contribution: 'add how much you’re putting in the prize.',
  currency: 'pick Free or Coins.',
  buy_in: 'set a Coin amount to enter, or pick Free.',
  participant_cap: 'pick a competitor cap or leave it unlimited.',
  max_participants: 'set a competitor cap number.',
  creator_participating: 'say whether you’re playing too.',
  rules: 'add the check-in rule (count, activity, and how often).',
  proofs: 'pick at least one proof type.',
  tasks: 'add a task with a name before we go on.',
  scoring_method: 'save Comparable Points, or leave it unconfigured.',
  scoring_config: 'name at least one activity and set a full-value quantity.',
  min_minutes: 'set a minimum minutes per check-in.',
  cover_image_url: 'that cover needs a full http(s) link.',
  rules_video_url: 'that video needs a full http(s) link.',
  bucks: 'check all three $ confirmations before we publish.',
  wallet: 'you don’t have enough in your wallet to fund this prize.',
  skill: 'confirm this is a contest of personal effort and skill.',
  publish: 'we couldn’t publish this challenge. Check the red note and try again.',
};

export function wizardBobOops(field: string, rotate = 0): string {
  const root = field.split('.')[0] || field;
  if (root === 'rules') {
    return 'Not so fast — add the check-in rule (count, activity, and how often).';
  }
  const body = FIELD_OOPS[root] ?? 'this one needs a look before we go on.';
  const prefix = OOPS_PREFIXES[Math.abs(rotate) % OOPS_PREFIXES.length];
  return `${prefix} ${body}`;
}

export function wizardStepForField(field: string, values?: CreateChallengeValues): number {
  const root = field.split('.')[0] || field;
  if (root === 'challenge_lane') {
    return 0;
  }
  if (root === 'start') {
    return 1;
  }
  if (root === 'bucks' || root === 'skill' || root === 'publish') {
    return wizardStepIndex('review');
  }
  if (root === 'wallet') {
    return wizardStepIndex('funding');
  }
  if ((root === 'frequency' || root === 'target_count') && values) {
    return values.duration_type === 'unlimited' ? wizardStepIndex('duration') : wizardStepIndex('rules');
  }
  let found = wizardStepIndex('review');
  for (const [index, fields] of Object.entries(CREATE_STEP_FIELDS)) {
    if (fields.includes(root as keyof CreateChallengeValues)) {
      found = Math.min(found, Number(index));
    }
  }
  return found;
}
