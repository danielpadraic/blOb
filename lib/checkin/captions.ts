import { challengeTaskTitles } from '@/lib/challengeRuleCopy';

/** Feed post body: the share field, or Check-in Complete when that field is empty. */
export function checkinPostBody(userCaption?: string | null): string {
  return (userCaption ?? '').trim() || 'Check-in Complete';
}

export function checkinTaskLabel(challenge: {
  task?: string | null;
  tasks?: unknown[] | null;
  title?: string | null;
} | null | undefined): string {
  const titles = challengeTaskTitles({
    task: challenge?.task ?? null,
    tasks: challenge?.tasks ?? null,
  });
  const first = titles[0]?.trim();
  if (first) {
    return first;
  }
  return 'checking in';
}
