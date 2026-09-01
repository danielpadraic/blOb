type TaskLike = {
  points?: number | string | null;
  once?: boolean | null;
};

export function taskPointValue(task: TaskLike | null | undefined): number {
  const points = Math.floor(Number(task?.points) || 0);
  return points > 0 ? points : 0;
}

/** Points one accepted check-in is worth from create tasks. Never 1 unless the task is 1. */
export function checkinPointValue(challenge: { tasks?: TaskLike[] | null } | null | undefined): number {
  const tasks = challenge?.tasks ?? [];
  const repeating = tasks.filter((task) => !task.once && taskPointValue(task) > 0);
  if (repeating.length > 0) {
    return taskPointValue(repeating[0]);
  }
  const scored = tasks.find((task) => taskPointValue(task) > 0);
  return scored ? taskPointValue(scored) : 0;
}
