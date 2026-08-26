export const DM_BLOCKED_COPY = 'You can’t message this person.';
export const DM_OPEN_FAILED_COPY = 'Couldn’t open this chat. Try again.';
export const DM_SELF_COPY = 'You can’t message yourself.';

const POSTGRES_NOISE =
  /\b(p0\d{3}|sqlstate|postgres|42p\d{2}|42883|42501|42703|pgrst\d+)\b/i;

export function isDmBlockedText(raw: string): boolean {
  const message = raw.toLowerCase();
  return (
    message.includes('can’t message this person') ||
    message.includes("can't message this person") ||
    message.includes('dm_blocked') ||
    message.includes('friendship_is_blocked') ||
    message.includes('direct_thread_is_blocked') ||
    (message.includes('blocked') &&
      (message.includes('message') || message.includes('chat') || message.includes('dm')))
  );
}

export function leaksPostgres(raw: string): boolean {
  return POSTGRES_NOISE.test(raw);
}

export function dmOpenUserMessage(raw: string): string {
  const message = raw.toLowerCase();
  if (isDmBlockedText(raw)) {
    return DM_BLOCKED_COPY;
  }
  if (message.includes('yourself')) {
    return DM_SELF_COPY;
  }
  if (message.includes('row-level security') && message.includes('messages')) {
    return DM_BLOCKED_COPY;
  }
  if (message.includes('isn’t on the map') || message.includes('isnt on the map')) {
    return DM_OPEN_FAILED_COPY;
  }
  if (leaksPostgres(raw) || message.includes('accepted friends')) {
    return DM_OPEN_FAILED_COPY;
  }
  const cleaned = raw.replace(POSTGRES_NOISE, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || leaksPostgres(cleaned)) {
    return DM_OPEN_FAILED_COPY;
  }
  return cleaned;
}

export function canStartDirectChat(input: { blocked?: boolean; self?: boolean }): boolean {
  return !input.blocked && !input.self;
}
