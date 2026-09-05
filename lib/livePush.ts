import type { LiveMute } from '@/lib/types';

export type { LiveMute };

export const LIVE_MUTE_OPTIONS: { value: LiveMute; label: string; body: string }[] = [
  { value: 'all', label: 'All', body: 'Every Live line and check-in in this challenge.' },
  { value: 'mentions', label: 'Mentions only', body: '@tags and check-in receipts only.' },
  { value: 'off', label: 'Off', body: 'No Live alerts from this challenge.' },
];

export function asLiveMute(value: string | null | undefined): LiveMute {
  if (value === 'mentions' || value === 'off') {
    return value;
  }
  return 'all';
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
