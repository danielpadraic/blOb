/** Task A, Task B, Task C… never “Workout B”. */
export function taskLetterLabel(index: number): string {
  const n = Math.max(Math.trunc(index) || 0, 0);
  if (n < 26) {
    return `Task ${String.fromCharCode(65 + n)}`;
  }
  return `Task ${n + 1}`;
}
