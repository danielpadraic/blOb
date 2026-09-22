import { allowsMultiCheckin } from '@/lib/loggable';
import { usesPointsBoard, usesQuantityScoring } from '@/lib/challengeExperience';
import {
  challengeIsSettledForRigor,
  hostRigorOf,
  viewerCanNormalHostAdjust,
  viewerIsChallengeStaff,
} from '@/lib/hostRigor';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';

export type ChallengeModRow = {
  user_id: string;
  assigned_by?: string | null;
  assigned_at?: string | null;
  profile?: PublicProfile | null;
};

export function viewerCanAppointModerators(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
    is_official?: boolean | null;
    currency?: string | null;
    challenge_lane?: string | null;
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

export function viewerCanProxyCheckin(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
  } | null;
  viewerId?: string | null;
  moderatorIds?: readonly string[] | null;
  officialOps?: boolean | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || challengeIsSettledForRigor(challenge.status)) {
    return false;
  }
  if (String(challenge.status ?? '').toLowerCase() !== 'live') {
    return false;
  }
  return viewerIsChallengeStaff(input);
}

export function proxyCheckinBlockedReason(input: {
  challenge?: {
    created_by?: string | null;
    host_rigor?: string | null;
    status?: string | null;
    challenge_type?: string | null;
    format?: string | null;
    scoring_method?: string | null;
    comparable_points_config?: unknown;
    metrics?: unknown;
    cumulative_target?: number | string | null;
    frequency?: string | null;
  } | null;
  viewerId?: string | null;
  moderatorIds?: readonly string[] | null;
  officialOps?: boolean | null;
  participantStatus?: string | null;
  eliminatedAt?: string | null;
  periodComplete?: boolean;
}): string | null {
  if (!viewerCanProxyCheckin(input)) {
    return 'This challenge has already ended.';
  }
  const dropped =
    Boolean(input.eliminatedAt) ||
    ['eliminated', 'failed', 'withdrawn', 'refunded_pre_start'].includes(
      String(input.participantStatus ?? '').toLowerCase(),
    );
  if (dropped) {
    const canBringBack = viewerCanNormalHostAdjust({
      challenge: input.challenge,
      viewerId: input.viewerId,
      moderatorIds: input.moderatorIds,
      officialOps: input.officialOps,
    });
    if (!canBringBack) {
      return 'They already dropped.';
    }
  }
  const multi =
    allowsMultiCheckin(input.challenge) &&
    (usesQuantityScoring(input.challenge) || usesPointsBoard(input.challenge));
  if (input.periodComplete && !multi) {
    return 'They already checked in this period.';
  }
  return null;
}

export function proxyCheckinLiveBody(input: {
  actorName?: string | null;
  participantName?: string | null;
  caption?: string | null;
}): string {
  const actor = String(input.actorName ?? '').trim() || 'Someone';
  const who = String(input.participantName ?? '').trim() || 'Someone';
  const sentence = `${actor} checked in for ${who}.`;
  const caption = String(input.caption ?? '').trim();
  return caption && caption !== 'Check-in Complete' ? `${sentence}\n\n${caption}` : sentence;
}

export function proxyLoggedByLine(actorName?: string | null): string {
  const actor = String(actorName ?? '').trim() || 'Someone';
  return `Logged by ${actor}`;
}

export function splitProxyCheckinContent(content?: string | null): {
  sentence: string | null;
  caption: string;
} {
  const text = String(content ?? '').trim();
  const match = text.match(/^(.+ checked in for .+?\.)(?:\n\n([\s\S]+))?$/i);
  if (!match) {
    return { sentence: null, caption: text };
  }
  return { sentence: match[1], caption: String(match[2] ?? '').trim() };
}

export function loggedByNameFromStats(stats?: { logged_by_name?: string | null } | null): string | null {
  const name = String(stats?.logged_by_name ?? '').trim();
  return name || null;
}

export async function fetchChallengeModeratorIds(challengeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('challenge_moderators')
    .select('user_id')
    .eq('challenge_id', challengeId);
  if (error) {
    return [];
  }
  return [...new Set((data ?? []).map((row) => String((row as { user_id: string }).user_id)).filter(Boolean))];
}

export async function fetchChallengeModerators(challengeId: string): Promise<ChallengeModRow[]> {
  const { data, error } = await supabase
    .from('challenge_moderators')
    .select('user_id, assigned_by, assigned_at')
    .eq('challenge_id', challengeId)
    .order('assigned_at', { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => ({
    user_id: String((row as { user_id: string }).user_id),
    assigned_by: (row as { assigned_by?: string | null }).assigned_by ?? null,
    assigned_at: (row as { assigned_at?: string | null }).assigned_at ?? null,
  }));
}

/** Host, roster, and assigned mods — even when a mod is not competing. */
export function challengeMentionMemberIds(input: {
  createdBy?: string | null;
  rosterUserIds?: readonly (string | null | undefined)[] | null;
  moderatorIds?: readonly (string | null | undefined)[] | null;
}): string[] {
  const ids = new Set<string>();
  if (input.createdBy) {
    ids.add(input.createdBy);
  }
  for (const id of input.rosterUserIds ?? []) {
    if (id) {
      ids.add(id);
    }
  }
  for (const id of input.moderatorIds ?? []) {
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
}

export async function appointChallengeModerator(challengeId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('appoint_challenge_moderator', {
    p_challenge_id: challengeId,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeChallengeModerator(challengeId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_challenge_moderator', {
    p_challenge_id: challengeId,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
