import { isOfflineError } from './errors';

export type ProofUploadJob<T> = {
  key: string;
  /** What the person calls this file ("Start selfie"). Named in the failure line. */
  label: string;
  run: () => Promise<T>;
};

export class ProofUploadError extends Error {
  readonly labels: string[];

  constructor(labels: string[]) {
    super(proofUploadFailureLine(labels));
    this.name = 'ProofUploadError';
    this.labels = labels;
  }
}

export function proofUploadFailureLine(labels: string[]): string {
  const names = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (names.length === 0) {
    return 'Couldn’t upload that photo. It’s still here. Try Send again.';
  }
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Couldn’t upload ${list}. ${names.length === 1 ? 'It’s' : 'They’re'} still here. Try Send again.`;
}

/**
 * Runs every upload at once. All of them settle before this returns or throws, so a failed Send
 * never leaves an upload running behind it. One failure fails the whole batch with a line that
 * names the files; an offline failure is rethrown as-is so the offline copy shows instead.
 */
export async function runProofUploads<T>(jobs: ProofUploadJob<T>[]): Promise<Map<string, T>> {
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const out = new Map<string, T>();
  const failed: ProofUploadJob<T>[] = [];
  let offline: unknown = null;
  settled.forEach((result, index) => {
    const job = jobs[index];
    if (result.status === 'fulfilled') {
      out.set(job.key, result.value);
      return;
    }
    failed.push(job);
    if (!offline && isOfflineError(result.reason)) {
      offline = result.reason;
    }
  });
  if (failed.length > 0) {
    if (offline) {
      throw offline;
    }
    throw new ProofUploadError(failed.map((job) => job.label));
  }
  return out;
}
