import { hostAdjustLivePostRow } from '@/lib/hostAdjust';
import { officialOpsAddError, type OfficialOpsBuyIn } from '@/lib/officialOps';
import { searchPeople } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export function houseAddPeopleLabel(count: number, title: string): string {
  const n = Math.max(count, 0);
  const name = title.trim() || 'this challenge';
  if (n === 1) {
    return `Add 1 person to ${name}?`;
  }
  return `Add ${n} people to ${name}?`;
}

export function houseAddLiveNote(hostName: string, names: string[]): string {
  const host = hostName.trim() || 'Host';
  const list = names.map((name) => name.trim()).filter(Boolean);
  if (list.length === 0) {
    return `${host} added people.`;
  }
  if (list.length === 1) {
    return `${host} added ${list[0]}.`;
  }
  if (list.length === 2) {
    return `${host} added ${list[0]} and ${list[1]}.`;
  }
  return `${host} added ${list[0]}, ${list[1]}, and ${list.length - 2} others.`;
}

export function parsePastedUsernames(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of value.split(/[\n,]+/)) {
    const handle = line.replace(/^@/, '').trim().toLowerCase();
    if (!handle || seen.has(handle)) {
      continue;
    }
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

export function personDisplayName(profile: Pick<PublicProfile, 'display_name' | 'username'>): string {
  return profile.display_name?.trim() || profile.username || 'Someone';
}

export async function resolvePastedUsernames(
  value: string,
  currentUserId: string,
): Promise<{ found: PublicProfile[]; unknown: string[] }> {
  const handles = parsePastedUsernames(value);
  const found: PublicProfile[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const handle of handles) {
    const hits = await searchPeople(handle, currentUserId);
    const match =
      hits.find((row) => row.username?.trim().toLowerCase() === handle) ??
      hits.find((row) => row.display_name?.trim().toLowerCase() === handle) ??
      null;
    if (!match || seen.has(match.id)) {
      unknown.push(handle);
      continue;
    }
    seen.add(match.id);
    found.push(match);
  }
  return { found, unknown };
}

export function houseAddLivePostRow(input: {
  authorId: string;
  challengeId: string;
  content: string;
}): Record<string, unknown> {
  return hostAdjustLivePostRow(input);
}

export function houseAddUnknownLine(unknown: string[]): string {
  const names = unknown.map((name) => `@${name.replace(/^@/, '')}`).filter(Boolean);
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return `Couldn’t find ${names[0]}.`;
  }
  return `Couldn’t find ${names.join(', ')}.`;
}

export function isHouseAddAlreadyIn(message: string): boolean {
  return officialOpsAddError(message) === 'They’re already in.';
}

export async function seatOneHouseAdd(input: {
  challengeId: string;
  userId: string;
  hostMode: boolean;
  buyIn: OfficialOpsBuyIn;
}): Promise<'added' | 'already'> {
  const { error } = input.hostMode
    ? await supabase.rpc('host_add_participant', {
        p_challenge_id: input.challengeId,
        p_user_id: input.userId,
      })
    : await supabase.rpc('official_add_participant', {
        p_challenge_id: input.challengeId,
        p_user_id: input.userId,
        p_buy_in: input.buyIn,
      });
  if (!error) {
    return 'added';
  }
  const message = officialOpsAddError(getErrorMessage(error));
  if (isHouseAddAlreadyIn(message)) {
    return 'already';
  }
  throw new Error(message);
}
