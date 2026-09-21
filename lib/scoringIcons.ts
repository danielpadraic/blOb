export const SCORING_ICON_KEYS = [
  'calls',
  'presentation',
  'money',
  'star',
  'checklist',
  'calendar',
  'camera',
  'timer',
  'steps',
  'route',
  'strength',
  'heart',
  'fire',
  'hydration',
  'reading',
  'writing',
  'learning',
  'trophy',
  'generic',
] as const;

export type ScoringIconKey = (typeof SCORING_ICON_KEYS)[number];

export type ScoringIconMeta = {
  key: ScoringIconKey;
  label: string;
};

export const SCORING_ICON_REGISTRY: ScoringIconMeta[] = [
  { key: 'calls', label: 'Calls' },
  { key: 'presentation', label: 'Presentations' },
  { key: 'money', label: 'Money' },
  { key: 'star', label: 'Points' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'calendar', label: 'Attendance' },
  { key: 'camera', label: 'Photos' },
  { key: 'timer', label: 'Timed activity' },
  { key: 'steps', label: 'Steps' },
  { key: 'route', label: 'Route' },
  { key: 'strength', label: 'Strength' },
  { key: 'heart', label: 'Cardio' },
  { key: 'fire', label: 'Streak' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'reading', label: 'Reading' },
  { key: 'writing', label: 'Writing' },
  { key: 'learning', label: 'Learning' },
  { key: 'trophy', label: 'Achievement' },
  { key: 'generic', label: 'Generic score' },
];

export function isScoringIconKey(value: unknown): value is ScoringIconKey {
  return typeof value === 'string' && (SCORING_ICON_KEYS as readonly string[]).includes(value);
}

export function scoringIconLabel(key: ScoringIconKey): string {
  return SCORING_ICON_REGISTRY.find((item) => item.key === key)?.label ?? 'Score';
}

const LABEL_RULES: { test: RegExp; key: ScoringIconKey }[] = [
  { test: /\b(dials?|calls?|phone)\b/, key: 'calls' },
  { test: /\b(presentations?|demos?|pitch(?:es)?)\b/, key: 'presentation' },
  { test: /\b(ap|premium|revenue|sales?|money|usd|tickets?)\b/, key: 'money' },
  { test: /\b(photos?|camera|proof|selfie)\b/, key: 'camera' },
  { test: /\b(minutes?|timer|timed|duration|hours?)\b/, key: 'timer' },
  { test: /\b(steps?|walks?)\b/, key: 'steps' },
  { test: /\b(runs?|miles?|route|distance|visits?|location)\b/, key: 'route' },
  { test: /\b(lifts?|strength|gym|workouts?|reps?)\b/, key: 'strength' },
  { test: /\b(heart|cardio|pulse)\b/, key: 'heart' },
  { test: /\b(streaks?|fire)\b/, key: 'fire' },
  { test: /\b(water|hydrat)/, key: 'hydration' },
  { test: /\b(read|book)/, key: 'reading' },
  { test: /\b(writ|journal|notes?)\b/, key: 'writing' },
  { test: /\b(learn|class|study|school)/, key: 'learning' },
  { test: /\b(check|tasks?|todo|list)\b/, key: 'checklist' },
  { test: /\b(days?|attend|calendar)\b/, key: 'calendar' },
  { test: /\b(trophy|achieve|win)\b/, key: 'trophy' },
  { test: /\b(points?|score|star)\b/, key: 'star' },
];

/** Obvious label / money-kind fallback. Unknown names stay generic. */
export function inferScoringIconKey(label: string, inputKind?: string | null): ScoringIconKey {
  if (inputKind === 'money') {
    return 'money';
  }
  const hay = String(label ?? '')
    .trim()
    .toLowerCase();
  if (!hay) {
    return 'generic';
  }
  for (const rule of LABEL_RULES) {
    if (rule.test.test(hay)) {
      return rule.key;
    }
  }
  return 'generic';
}

export function resolveScoringIconKey(input: {
  icon_key?: string | null;
  name?: string | null;
  label?: string | null;
  unit?: string | null;
  input_kind?: string | null;
}): ScoringIconKey {
  if (isScoringIconKey(input.icon_key)) {
    return input.icon_key;
  }
  return inferScoringIconKey(input.name ?? input.label ?? '', input.input_kind);
}
