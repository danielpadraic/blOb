/** Task noun + Points-to-win copy. No silent “workout” default. */

export function ruleActivityNoun(
  task?: string | null,
  ruleActivity?: string | null,
): string {
  return (task ?? '').trim() || (ruleActivity ?? '').trim() || 'task';
}

export function pluralizeRuleActivity(activity: string, count: number): string {
  const trimmed = activity.trim() || 'task';
  if (count === 1) {
    return trimmed;
  }
  if (/s$/i.test(trimmed)) {
    return trimmed;
  }
  if (/check-in$/i.test(trimmed)) {
    return `${trimmed}s`;
  }
  return `${trimmed}s`;
}

export function consistencyHowOftenSentence(values: {
  task?: string | null;
  rule_activity?: string | null;
  target_count?: string | number | null;
  frequency?: string | null;
  duration_type?: string | null;
}): string {
  const count = Math.max(Number(values.target_count) || 1, 1);
  const activity = pluralizeRuleActivity(ruleActivityNoun(values.task, values.rule_activity), count);
  if (values.frequency === 'once') {
    return `Competitors must check in ${count} ${activity} for the duration of the challenge.`;
  }
  const period =
    values.frequency === 'daily' || values.frequency === 'day'
      ? 'day'
      : values.frequency === 'monthly' || values.frequency === 'month'
        ? 'month'
        : 'week';
  if (values.duration_type === 'unlimited') {
    return `Competitors must check in ${count} ${activity} every ${period} to stay in the challenge.`;
  }
  return `Competitors must check in ${count} ${activity} every ${period} for the duration of the challenge.`;
}

export function sumTaskPoints(
  tasks: Array<{ points?: string | number | null }> | null | undefined,
): number {
  const sum = (tasks ?? []).reduce((total, task) => total + Math.max(Number(task.points) || 0, 0), 0);
  return Math.max(sum, 1);
}

export function pointsToWinOf(values: {
  points_to_win?: string | number | null;
  target_count?: string | number | null;
  tasks?: Array<{ points?: string | number | null; title?: string | null }> | null;
}): number {
  const explicit = Number(values.points_to_win);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.floor(explicit);
  }
  return sumTaskPoints(values.tasks);
}

export function namedTaskTitles(
  tasks: Array<{ title?: string | null }> | null | undefined,
): string[] {
  return (tasks ?? []).map((task) => (task.title ?? '').trim()).filter(Boolean);
}

export function pointsWinRulesSentence(values: {
  points_to_win?: string | number | null;
  target_count?: string | number | null;
  tasks?: Array<{ points?: string | number | null; title?: string | null }> | null;
}): string {
  const n = pointsToWinOf(values);
  const titles = namedTaskTitles(values.tasks);
  const list = titles.length > 0 ? ` Tasks: ${titles.join('; ')}.` : '';
  return `Win by reaching ${n} points.${list}`;
}

export function pointsToWinHelper(n: number): string {
  return `Competitors stay in the challenge no matter how often they check in. Anyone who reaches ${n} points before it ends is a winner. Ties split.`;
}
