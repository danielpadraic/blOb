import { challengeTaskTitles } from '@/lib/challengeRuleCopy';
import { locationCompleteCaption } from '@/lib/locationProof';

export function checkinBeginCaption(name: string, task: string): string {
  const who = name.trim() || 'Someone';
  const activity = task.trim() || 'checking in';
  return `${who} is ${activity}!`;
}

export function checkinCompleteCaption(name: string, challengeTitle: string): string {
  return locationCompleteCaption(name, challengeTitle);
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

export function checkinAutoNotes(input: {
  complete: boolean;
  caption?: string | null;
  name: string;
  task: string;
  challengeTitle: string;
}): string {
  const written = input.caption?.trim() ?? '';
  if (written) {
    return written;
  }
  if (input.complete) {
    return checkinCompleteCaption(input.name, input.challengeTitle);
  }
  return checkinBeginCaption(input.name, input.task);
}
