/** One voice for challenge, check-in, miss, settle, join, tag, and friend alerts. */

import { asCopyTone, type CopyTone } from '@/lib/copy';

export const ALERT_MAX = 100;

const SERMON =
  /does not save you a seat|podium photos are for|people in fourth|will still like you|\bi believe\b|i am proud|i will be here|i noticed|i am glad|i respect|saved your spot|i like this version|most people talk|nobody clapped|do not donate|i will also say/i;

const STACKED = /\band \d+ others?\b/i;

export function clipAlert(text: string): string {
  const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= ALERT_MAX) {
    return cleaned;
  }
  if (ALERT_MAX <= 1) {
    return '…';
  }
  return `${cleaned.slice(0, ALERT_MAX - 1).trimEnd()}…`;
}

export function checkinNudgeLine(tone: CopyTone, challenge: string, hours?: number | null): string {
  const name = challenge.trim() || 'this challenge';
  if (hours === 2) {
    return clipAlert(
      tone === 'honest'
        ? `${name}: 2 hours. Check in or miss the day.`
        : `2 hours left to check in to ${name}.`,
    );
  }
  if (hours === 4) {
    return clipAlert(
      tone === 'honest'
        ? `${name}: 4 hours. Check in or miss the day.`
        : `4 hours left to check in to ${name}.`,
    );
  }
  return clipAlert(tone === 'honest' ? `${name}: check in today.` : `Time to check in to ${name}.`);
}

export function joinAlertLine(tone: CopyTone, challenge: string): string {
  const name = challenge.trim() || 'this challenge';
  return clipAlert(
    tone === 'honest' ? `${name}: you are in. Check in today.` : `You are in on ${name}. Keep the streak.`,
  );
}

export function missAlertLine(tone: CopyTone, challenge: string, removed: boolean): string {
  const name = challenge.trim() || 'this challenge';
  if (removed) {
    return clipAlert(tone === 'honest' ? `${name}: a miss is a miss.` : `You are out of ${name}.`);
  }
  return clipAlert(
    tone === 'honest' ? `${name}: a miss is a miss.` : `You missed a day on ${name}. You are still in.`,
  );
}

export function settleAlertLine(tone: CopyTone, challenge: string): string {
  const name = challenge.trim() || 'this challenge';
  return clipAlert(tone === 'honest' ? `${name}: settled.` : `${name} is settled.`);
}

function hoursOf(explicit: number | null | undefined, text: string): number | null {
  if (explicit === 2 || explicit === 4 || explicit === 8) {
    return explicit;
  }
  if (/\b(2|two) hours?\b/i.test(text)) {
    return 2;
  }
  if (/\b(4|four) hours?\b/i.test(text)) {
    return 4;
  }
  return null;
}

function challengeFrom(text: string, explicit?: string | null): string {
  const given = String(explicit ?? '').trim();
  if (given) {
    return given;
  }
  const patterns = [
    /^(.*?) does not save you a seat/i,
    /skip on (.+?)(?:\.|$)/i,
    /if you skip (.+?) now/i,
    /last check-in on (.+?)(?:\.|$)/i,
    /check in for (.+?)(?: —| –|-|\.)/i,
    /^(.+?) is still open/i,
    /checked in to (.+?)(?:\.|$)/i,
    /on (.+?)(?:\.|$)/i,
  ];
  for (const pattern of patterns) {
    const hit = text.match(pattern)?.[1]?.replace(/[“”"]/g, '').trim();
    if (hit && hit.length > 1 && hit.length < 72 && !/i will|people |podium /i.test(hit)) {
      return hit;
    }
  }
  return '';
}

export function rewriteUserAlert(input: {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  challengeTitle?: string | null;
  actorName?: string | null;
  tone?: string | null;
  offsetHours?: number | null;
  category?: string | null;
}): string | null {
  const type = String(input.type ?? '');
  const raw = `${input.title ?? ''} ${input.body ?? ''}`.replace(/\s+/g, ' ').trim();
  const titleOnly = String(input.title ?? '').replace(/\s+/g, ' ').trim();
  const tone = asCopyTone(input.tone);
  const sermon = SERMON.test(raw);
  if (STACKED.test(titleOnly) && !sermon) {
    return clipAlert(titleOnly);
  }

  const challenge = challengeFrom(raw, input.challengeTitle);
  const actor = String(input.actorName ?? '').trim() || 'Someone';
  const category = String(input.category ?? '');

  if (type === 'friend_request') {
    return clipAlert(`${actor} sent you a friend request.`);
  }
  if (type === 'friend_accepted') {
    return clipAlert(`${actor} accepted your friend request.`);
  }
  if (type === 'challenge_checkin' || type === 'live_checkin') {
    if (/^\d+ friends checked in/i.test(titleOnly)) {
      return clipAlert(titleOnly.replace(/ checked in on /i, ' checked in to '));
    }
    if (!challenge) {
      return null;
    }
    return clipAlert(`${actor} checked in to ${challenge}.`);
  }
  if (type === 'post_reaction') {
    if (/reacted to your/i.test(titleOnly)) {
      return clipAlert(titleOnly);
    }
    return clipAlert(`${actor} reacted to your post.`);
  }
  if (type === 'tagged' || type === 'mentioned') {
    if (/tagged you/i.test(titleOnly)) {
      return clipAlert(titleOnly);
    }
    return clipAlert(challenge ? `${actor} tagged you in ${challenge}.` : `${actor} tagged you.`);
  }
  if (type === 'challenge_joined' || type === 'challenge_join_confirmed') {
    return challenge ? joinAlertLine(tone, challenge) : null;
  }
  if (type === 'challenge_settled' || type === 'challenge_won' || type === 'challenge_placed') {
    return challenge ? settleAlertLine(tone, challenge) : null;
  }
  if (type === 'challenge_eliminated' || type === 'competitor_dropped' || type === 'challenge_lost') {
    return challenge ? missAlertLine(tone, challenge, true) : null;
  }

  const nudge =
    type === 'challenge_checkin_reminder' ||
    type === 'health_begin' ||
    type === 'health_checkout' ||
    type === 'bob_encouragement' ||
    type === 'challenge_starting' ||
    sermon;
  if (!nudge || !challenge) {
    return null;
  }
  if (category === 'miss_removed' || type === 'challenge_eliminated') {
    return missAlertLine(tone, challenge, true);
  }
  if (category === 'miss_still_in') {
    return missAlertLine(tone, challenge, false);
  }
  if (category === 'checkin_streak_5plus' || category === 'checkin_streak_2') {
    return clipAlert(tone === 'honest' ? `${challenge}: keep the streak.` : `You are in on ${challenge}. Keep the streak.`);
  }
  return checkinNudgeLine(tone, challenge, hoursOf(input.offsetHours, raw));
}
