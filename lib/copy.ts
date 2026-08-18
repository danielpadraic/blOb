export const COPY_TONES = ['gentle', 'neutral', 'honest'] as const;

export type CopyTone = (typeof COPY_TONES)[number];

const STRINGS = {
  'bfp.sliderHint': {
    gentle: 'Move this until this Blob looks like you do right now.',
    neutral: 'Match the slider to your current body fat, or type the exact %.',
    honest: 'This is what you look like today, not what you wish. Slide until it matches, or type the number if you have it.',
  },
  'bfp.enterExact': 'Enter exact %',
  'bfp.exactLabel': 'Exact body fat %',
  'training.lastDoneHint': 'When is the last time you participated in these activities?',
  'profile.update': 'Update profile',
  'profile.saved': 'Saved.',
  'profile.toneLabel': 'How should Bob talk to you?',
  'profile.toneGentle': 'Gentle',
  'profile.toneNeutral': 'Neutral',
  'profile.toneHonest': 'Honest',
  'error.uploadPhoto': 'Couldn’t upload photo. Try again.',
  'error.notEnoughPeople': 'Not enough people joined.',
  'post.deleteConfirm': 'Delete?',
  'post.delete': 'Delete',
  'error.deletePost': 'Couldn’t delete.',
} as const;

export type CopyKey = keyof typeof STRINGS;

type CopyNode = string | { readonly [K in CopyTone]: string };

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

export function asCopyTone(value: unknown): CopyTone {
  if (value === 'gentle' || value === 'neutral' || value === 'honest') {
    return value;
  }
  return 'neutral';
}

export function copy(key: CopyKey, tone: CopyTone = 'neutral', vars?: Record<string, string | number>): string {
  const node = STRINGS[key] as CopyNode;
  const template = typeof node === 'string' ? node : (node[tone] ?? node.neutral);
  return interpolate(template, vars);
}

export const COPY_TONE_OPTIONS: { value: CopyTone; key: CopyKey }[] = [
  { value: 'gentle', key: 'profile.toneGentle' },
  { value: 'neutral', key: 'profile.toneNeutral' },
  { value: 'honest', key: 'profile.toneHonest' },
];
