export const HOST_RIGOR_VALUES = ['friendly', 'normal', 'strict'] as const;

export type HostRigor = (typeof HOST_RIGOR_VALUES)[number];

export const DEFAULT_HOST_RIGOR: HostRigor = 'normal';

export const HOST_RIGOR_OPTIONS: { value: HostRigor; label: string; help: string }[] = [
  {
    value: 'friendly',
    label: 'Friendly',
    help: 'Host can add people and fix the board.',
  },
  {
    value: 'normal',
    label: 'Normal',
    help: 'Host can excuse a miss or count a day. Rules otherwise stand.',
  },
  {
    value: 'strict',
    label: 'Strict',
    help: 'The published rules only.',
  },
];

const ENDED = new Set([
  'ended',
  'settled',
  'settling',
  'judging',
  'distributing',
  'cancelled',
  'cancelled_underfilled',
]);

export function asHostRigor(value?: string | null): HostRigor {
  const next = String(value ?? '').toLowerCase();
  return HOST_RIGOR_VALUES.includes(next as HostRigor) ? (next as HostRigor) : DEFAULT_HOST_RIGOR;
}

/** Existing live challenges with a null rigor read as Normal. */
export function hostRigorOf(challenge?: { host_rigor?: string | null } | null): HostRigor {
  if (!challenge || challenge.host_rigor == null || challenge.host_rigor === '') {
    return DEFAULT_HOST_RIGOR;
  }
  return asHostRigor(challenge.host_rigor);
}

export function hostRigorLabel(value?: string | null): string {
  const rigor = asHostRigor(value);
  return HOST_RIGOR_OPTIONS.find((item) => item.value === rigor)?.label ?? 'Normal';
}

export function hostRigorHelp(value?: string | null): string {
  const rigor = asHostRigor(value);
  return HOST_RIGOR_OPTIONS.find((item) => item.value === rigor)?.help ?? HOST_RIGOR_OPTIONS[1].help;
}

export function isOfficialCashChallenge(challenge?: {
  is_official?: boolean | null;
  currency?: string | null;
  challenge_lane?: string | null;
} | null): boolean {
  if (!challenge?.is_official) {
    return false;
  }
  const currency = String(challenge.currency ?? '').toLowerCase();
  const lane = String(challenge.challenge_lane ?? '').toLowerCase();
  return currency === 'bucks' || currency === 'cash' || currency === 'usd' || lane === 'bucks' || lane === 'cash';
}

export function isOfficialCoinsChallenge(challenge?: {
  is_official?: boolean | null;
  currency?: string | null;
  challenge_lane?: string | null;
} | null): boolean {
  return Boolean(challenge?.is_official) && !isOfficialCashChallenge(challenge);
}

export function officialCashStrictCopy(): string {
  return 'Official cash contests stay Strict.';
}

export function hostRigorControlState(challenge?: {
  is_official?: boolean | null;
  currency?: string | null;
  challenge_lane?: string | null;
  host_rigor?: string | null;
} | null): {
  value: HostRigor;
  disabled: boolean;
  options: HostRigor[];
  helper: string;
} {
  if (isOfficialCashChallenge(challenge)) {
    return {
      value: 'strict',
      disabled: true,
      options: ['strict'],
      helper: officialCashStrictCopy(),
    };
  }
  if (isOfficialCoinsChallenge(challenge)) {
    const value = hostRigorOf(challenge);
    const next = value === 'strict' ? 'normal' : value;
    return {
      value: next,
      disabled: false,
      options: ['friendly', 'normal'],
      helper: hostRigorHelp(next),
    };
  }
  const value = hostRigorOf(challenge);
  return {
    value,
    disabled: false,
    options: [...HOST_RIGOR_VALUES],
    helper: hostRigorHelp(value),
  };
}

export function hostRigorForPublish(input: {
  hostRigor?: string | null;
  isOfficial?: boolean | null;
  currency?: string | null;
  challengeLane?: string | null;
}): HostRigor {
  const locked = hostRigorControlState({
    is_official: input.isOfficial,
    currency: input.currency,
    challenge_lane: input.challengeLane,
    host_rigor: input.hostRigor,
  });
  if (locked.disabled) {
    return locked.value;
  }
  if (!locked.options.includes(asHostRigor(input.hostRigor))) {
    return locked.value;
  }
  return asHostRigor(input.hostRigor);
}

export function officialCashPublishRejected(input: {
  isOfficial?: boolean | null;
  currency?: string | null;
  challengeLane?: string | null;
  hostRigor?: string | null;
}): boolean {
  return (
    isOfficialCashChallenge({
      is_official: input.isOfficial,
      currency: input.currency,
      challenge_lane: input.challengeLane,
    }) && asHostRigor(input.hostRigor) !== 'strict'
  );
}

export function hostRigorReviewLine(value?: string | null): string {
  const rigor = asHostRigor(value);
  if (rigor === 'friendly') {
    return 'Friendly — host can add people and fix the board.';
  }
  if (rigor === 'strict') {
    return 'Strict — the published rules only.';
  }
  return 'Normal — host can excuse a miss or count a day. Rules otherwise stand.';
}

export function challengeIsSettledForRigor(status?: string | null): boolean {
  return ENDED.has(String(status ?? '').toLowerCase());
}

export function viewerCanUseHostBoardTools(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
    is_official?: boolean | null;
    series_id?: string | null;
    host_budget?: number | null;
  } | null;
  viewerId?: string | null;
  officialOps?: boolean | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || challengeIsSettledForRigor(challenge.status)) {
    return false;
  }
  if (input.officialOps) {
    return true;
  }
  if (!input.viewerId || challenge.created_by !== input.viewerId) {
    return false;
  }
  return hostRigorOf(challenge) !== 'strict';
}

export function viewerCanFriendlyHostAdd(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
  } | null;
  viewerId?: string | null;
  officialOps?: boolean | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || challengeIsSettledForRigor(challenge.status)) {
    return false;
  }
  if (input.officialOps) {
    return true;
  }
  return Boolean(input.viewerId && challenge.created_by === input.viewerId && hostRigorOf(challenge) === 'friendly');
}

export function viewerCanNormalHostAdjust(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
  } | null;
  viewerId?: string | null;
  officialOps?: boolean | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || challengeIsSettledForRigor(challenge.status)) {
    return false;
  }
  if (input.officialOps) {
    return true;
  }
  if (!input.viewerId || challenge.created_by !== input.viewerId) {
    return false;
  }
  const rigor = hostRigorOf(challenge);
  return rigor === 'normal' || rigor === 'friendly';
}

export function viewerCanEditBoardScore(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
  } | null;
  viewerId?: string | null;
  officialOps?: boolean | null;
}): boolean {
  return viewerCanFriendlyHostAdd(input);
}
