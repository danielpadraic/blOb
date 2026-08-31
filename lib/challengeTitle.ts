const PLACEHOLDER_TITLES = new Set(['untitled challenge', 'unknown challenge', 'challenge']);

export function isPlaceholderChallengeTitle(value: string | null | undefined): boolean {
  return PLACEHOLDER_TITLES.has(String(value ?? '').trim().toLowerCase());
}

function firstTaskTitle(
  items: Array<{ title?: string | null } | string | null | undefined> | null | undefined,
): string {
  for (const item of items ?? []) {
    const label = typeof item === 'string' ? item.trim() : String(item?.title ?? '').trim();
    if (label && !isPlaceholderChallengeTitle(label)) {
      return label;
    }
  }
  return '';
}

/** Live name for header, Overview, InChallengeLine, and share cards. Never remaps ids. */
export function challengeDisplayTitle(row: {
  title?: string | null;
  task?: string | null;
  tasks?: Array<{ title?: string | null } | string> | null;
  extra_tasks?: Array<{ title?: string | null } | string> | null;
} | null | undefined): string {
  if (!row) {
    return '';
  }
  const title = String(row.title ?? '').trim();
  if (title && !isPlaceholderChallengeTitle(title)) {
    return title;
  }
  const task = String(row.task ?? '').trim();
  if (task && !isPlaceholderChallengeTitle(task)) {
    return task;
  }
  return firstTaskTitle(row.tasks) || firstTaskTitle(row.extra_tasks) || '';
}
