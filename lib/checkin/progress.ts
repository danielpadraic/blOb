export type CheckinBoardRow = {
  userId: string;
  daysCompleted: number;
  submittedThisWindow?: boolean;
};

/** Server is source of truth. This only paints the local board immediately. */
export function applyLocalCheckinProgress<T extends CheckinBoardRow>(
  rows: T[],
  userId: string,
): T[] {
  return rows.map((row) => {
    if (row.userId !== userId) {
      return row;
    }
    if (row.submittedThisWindow) {
      return row;
    }
    return {
      ...row,
      daysCompleted: Math.max(0, Number(row.daysCompleted) || 0) + 1,
      submittedThisWindow: true,
    };
  });
}

export function incrementDaysCompleted(current: number, alreadySubmitted: boolean): number {
  const days = Math.max(0, Number(current) || 0);
  if (alreadySubmitted) {
    return days;
  }
  return days + 1;
}

export function boardProgressLabel(completed: number, target: number): string {
  const have = Math.max(0, Number(completed) || 0);
  const need = Math.max(1, Number(target) || 1);
  return `${have}/${need}`;
}

export function didAdvanceBoard(before: number, after: number): boolean {
  return Math.max(0, after) === Math.max(0, before) + 1;
}
