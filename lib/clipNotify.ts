export function clipReactionNotifyCopy(data?: {
  href?: string | null;
  story_id?: string | null;
  reel_id?: string | null;
}): { one: string; many: string } {
  const href = typeof data?.href === 'string' ? data.href : '';
  if (data?.reel_id || href.startsWith('/round/')) {
    return { one: 'reacted to your Round', many: 'reacted to your Round' };
  }
  if (data?.story_id || href.startsWith('/wave/')) {
    return { one: 'reacted to your Wave', many: 'reacted to your Wave' };
  }
  return { one: 'reacted to your post', many: 'reacted to your post' };
}
