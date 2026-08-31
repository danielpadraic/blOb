export const PRIVACY_MODES = ['public', 'private', 'private_corporate'] as const;

export type PrivacyMode = (typeof PRIVACY_MODES)[number];

export type ContentAudience = 'public' | 'friends' | 'challenge_only';

export const PRIVATE_CORPORATE_LABEL = 'Private Corporate';

export const PRIVATE_CORPORATE_HELPER =
  'Only participants can see activity. Nothing leaves the Lobby. Required for most company-sponsored contests.';

export const PRIVACY_MODE_LOCKED_MESSAGE =
  'Privacy is locked. After someone joins, you cannot turn off or downgrade this setting.';

export function isPrivacyMode(value: unknown): value is PrivacyMode {
  return value === 'public' || value === 'private' || value === 'private_corporate';
}

export function asPrivacyMode(
  value: unknown,
  visibility?: string | null,
  challengeLane?: string | null,
): PrivacyMode {
  if (isPrivacyMode(value)) {
    return value;
  }
  return inferPrivacyMode(visibility, challengeLane);
}

export function inferPrivacyMode(
  visibility?: string | null,
  challengeLane?: string | null,
): PrivacyMode {
  if (challengeLane === 'private') {
    return 'private';
  }
  const vis = String(visibility ?? '').toLowerCase();
  if (vis === 'private' || vis === 'invite') {
    return 'private';
  }
  return 'public';
}

export function isPrivateCorporate(
  value: { privacy_mode?: unknown; privacyMode?: unknown } | string | null | undefined,
): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return value === 'private_corporate';
  }
  return value.privacy_mode === 'private_corporate' || value.privacyMode === 'private_corporate';
}

/** Corporate lobby posts stay off Home, even for participants. */
export function homeFeedAllowsChallengeContent(privacyMode?: string | null): boolean {
  return privacyMode !== 'private_corporate';
}

/** Future posts and check-ins stay inside the Lobby when corporate. */
export function contentAudienceForPrivacyMode(mode: PrivacyMode): ContentAudience {
  if (mode === 'private_corporate') {
    return 'challenge_only';
  }
  if (mode === 'private') {
    return 'friends';
  }
  return 'public';
}

export function visibilityForPrivacyMode(
  mode: PrivacyMode,
  challengeLane?: string | null,
): 'public' | 'private' | 'friends' | 'invite' {
  if (mode === 'private_corporate' || mode === 'private') {
    return challengeLane === 'private' ? 'private' : 'invite';
  }
  return 'public';
}

export function privacyModeLabel(mode: PrivacyMode): string {
  if (mode === 'private_corporate') {
    return PRIVATE_CORPORATE_LABEL;
  }
  if (mode === 'private') {
    return 'Private';
  }
  return 'Public';
}

export const LOCKED_AFTER_JOIN_FIELDS = ['privacy_mode'] as const;

export function canChangePrivacyMode(input: {
  current: PrivacyMode;
  next: PrivacyMode;
  participantCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.current === input.next) {
    return { ok: true };
  }
  if (input.participantCount < 1) {
    return { ok: true };
  }
  return { ok: false, message: PRIVACY_MODE_LOCKED_MESSAGE };
}

/** After someone joins, reject the tap and keep the saved value. One-line error. */
export function rejectLockedAfterJoinField(input: {
  field: (typeof LOCKED_AFTER_JOIN_FIELDS)[number];
  participantCount: number;
  current: unknown;
  next: unknown;
}): { ok: true } | { ok: false; message: string } {
  if (input.field === 'privacy_mode') {
    return canChangePrivacyMode({
      current: asPrivacyMode(input.current),
      next: asPrivacyMode(input.next),
      participantCount: input.participantCount,
    });
  }
  return { ok: true };
}

export function applyPrivacyModeSelection(
  mode: PrivacyMode,
  input: {
    challenge_lane?: string | null;
    visibility?: string | null;
  },
): {
  privacy_mode: PrivacyMode;
  visibility: 'public' | 'private' | 'friends' | 'invite';
  discoverability: 'invite_only' | 'friends_of_friends' | null;
} {
  if (mode === 'private_corporate') {
    return {
      privacy_mode: 'private_corporate',
      visibility: visibilityForPrivacyMode('private_corporate', input.challenge_lane),
      discoverability: 'invite_only',
    };
  }
  if (mode === 'private') {
    return {
      privacy_mode: 'private',
      visibility: visibilityForPrivacyMode('private', input.challenge_lane),
      discoverability: 'invite_only',
    };
  }
  const vis = String(input.visibility ?? 'public').toLowerCase();
  return {
    privacy_mode: 'public',
    visibility: vis === 'friends' ? 'friends' : 'public',
    discoverability: null,
  };
}
