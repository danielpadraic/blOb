import { isPointsChallenge } from '@/lib/challenges';

export type ChallengeTagKind =
  | 'official'
  | 'public'
  | 'private'
  | 'joined'
  | 'notJoined'
  | 'live'
  | 'notStarted'
  | 'consistency'
  | 'points';

export type ChallengeTagSpec = {
  kind: ChallengeTagKind;
  label: string;
};

type TagChallenge = {
  is_official?: boolean | null;
  visibility?: string | null;
  status?: string | null;
  challenge_type?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
};

function formatStartWhen(startsAt?: string | null, timeZone?: string | null): string | null {
  if (!startsAt) {
    return null;
  }
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timeZone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function phaseKind(status: string | null | undefined): 'live' | 'notStarted' | null {
  const value = String(status ?? '').toLowerCase();
  if (value === 'live' || value === 'in_progress') {
    return 'live';
  }
  if (
    value === 'filling' ||
    value === 'open' ||
    value === 'upcoming' ||
    value === 'starting' ||
    value === 'arming' ||
    value === 'judging'
  ) {
    return 'notStarted';
  }
  return null;
}

export function challengeCardTags(input: {
  challenge: TagChallenge;
  hosting?: boolean;
  joined?: boolean;
  invited?: boolean;
  showNotJoined?: boolean;
}): ChallengeTagSpec[] {
  const { challenge } = input;
  const tags: ChallengeTagSpec[] = [];

  if (challenge.is_official) {
    tags.push({ kind: 'official', label: 'Official' });
  }

  const visibility = String(challenge.visibility ?? 'public').toLowerCase();
  if (visibility === 'private' || visibility === 'invite') {
    tags.push({
      kind: 'private',
      label: visibility === 'invite' ? 'Invite only' : 'Private',
    });
  } else {
    tags.push({ kind: 'public', label: 'Public' });
  }

  if (input.joined || input.hosting) {
    tags.push({ kind: 'joined', label: 'You’re in' });
  } else {
    tags.push({ kind: 'notJoined', label: 'Not joined' });
  }

  const phase = phaseKind(challenge.status);
  if (phase === 'live') {
    tags.push({ kind: 'live', label: 'Live — in progress' });
  } else if (phase === 'notStarted') {
    const when = formatStartWhen(challenge.starts_at, challenge.timezone);
    tags.push({
      kind: 'notStarted',
      label: when ? `Not started · ${when}` : 'Not started',
    });
  }

  if (isPointsChallenge(challenge)) {
    tags.push({ kind: 'points', label: 'Points' });
  } else {
    tags.push({ kind: 'consistency', label: 'Consistency' });
  }

  return tags;
}
