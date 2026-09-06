import type { Href } from 'expo-router';

import type { LiveMute } from '@/lib/types';

export type { LiveMute };

export const LIVE_MUTE_OPTIONS: { value: LiveMute; label: string; body: string }[] = [
  { value: 'all', label: 'All', body: 'Chat, check-ins, and @mentions in this lobby.' },
  {
    value: 'mentions',
    label: 'Mentions only',
    body: '@me, replies to my Live lines, and replies on my check-ins.',
  },
  { value: 'off', label: 'Off', body: 'Nothing from this lobby.' },
];

export const LIVE_MUTE_REMINDER_LINE =
  'Check-in reminders stay on so you don’t miss a day.';

export function asLiveMute(value: string | null | undefined): LiveMute {
  if (value === 'mentions' || value === 'off') {
    return value;
  }
  return 'all';
}

/** Off skips Live. Mentions-only only if @mentioned or parent author of a reply. */
export function liveMuteAllowsRecipient(
  mute: LiveMute,
  opts: { mentioned?: boolean; parentAuthor?: boolean },
): boolean {
  if (mute === 'off') {
    return false;
  }
  if (mute === 'all') {
    return true;
  }
  return Boolean(opts.mentioned || opts.parentAuthor);
}

export function liveChatSnippet(text: string | null | undefined, max = 80): string {
  const cleaned = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max);
}

export function liveChatPushCopy(input: {
  name: string;
  challengeTitle: string;
  text?: string | null;
  hasMedia?: boolean;
}): { title: string; body: string } {
  const name = input.name.trim() || 'Someone';
  const challenge = input.challengeTitle.trim() || 'this challenge';
  const snippet = liveChatSnippet(input.text);
  const body = snippet || (input.hasMedia ? 'Photo' : `${name} in ${challenge}`);
  return { title: `${name} in ${challenge}`, body };
}

export const LIVE_FOCUS_HEARTBEAT_MS = 25_000;

export function isLivePushType(type?: string | null): boolean {
  return type === 'live_message' || type === 'live_checkin' || type === 'live_reply';
}

export function challengeIdFromLiveUrl(url?: string | null): string | undefined {
  const match = String(url ?? '').match(/\/challenges\/([^/?#]+)/);
  const id = String(match?.[1] ?? '').trim();
  return id || undefined;
}

export function isLiveChallengeUrl(url?: string | null): boolean {
  const raw = String(url ?? '');
  if (!/\/challenges\/[^/?#]+/.test(raw) || /\/submit(?:\?|$|#)/.test(raw)) {
    return false;
  }
  return /(?:\?|&)tab=(?:live|feed)(?:&|$|#)/.test(raw);
}

/** Live chat / check-in / reply taps. Never Overview, never /submit, never reminder href. */
export function liveChallengeHref(
  challengeId: string,
  extra?: { postId?: string | null; commentId?: string | null },
): Href {
  const id = String(challengeId ?? '').trim();
  const qs = new URLSearchParams();
  qs.set('tab', 'live');
  const postId = String(extra?.postId ?? '').trim();
  if (postId) {
    qs.set('postId', postId);
  }
  const commentId = String(extra?.commentId ?? '').trim();
  if (commentId) {
    qs.set('comments', '1');
    qs.set('commentId', commentId);
  }
  return `/challenges/${id}?${qs.toString()}` as Href;
}

export function liveNotificationHref(data: {
  type?: string | null;
  challenge_id?: string | null;
  challengeId?: string | null;
  post_id?: string | null;
  postId?: string | null;
  comment_id?: string | null;
  commentId?: string | null;
  href?: string | null;
  url?: string | null;
}): Href | null {
  const url = data.url || data.href;
  if (!isLivePushType(data.type) && !isLiveChallengeUrl(url)) {
    return null;
  }
  const challengeId =
    String(data.challenge_id ?? data.challengeId ?? '').trim() || challengeIdFromLiveUrl(url);
  if (!challengeId) {
    return null;
  }
  return liveChallengeHref(challengeId, {
    postId: data.post_id ?? data.postId,
    commentId: data.comment_id ?? data.commentId,
  });
}
