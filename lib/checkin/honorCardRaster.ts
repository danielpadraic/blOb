import type { HonorCardModel } from '@/lib/checkin/honorCard';

type RasterJob = {
  card: HonorCardModel;
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
};

const queue: RasterJob[] = [];
let listener: ((job: RasterJob | null) => void) | null = null;
let active: RasterJob | null = null;

export function subscribeHonorCardRaster(next: (job: RasterJob | null) => void): () => void {
  listener = next;
  if (!active && queue[0]) {
    active = queue[0];
    next(active);
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

export function rasterHonorProofCard(card: HonorCardModel): Promise<string> {
  return new Promise((resolve, reject) => {
    const job: RasterJob = { card, resolve, reject };
    queue.push(job);
    if (!active && listener) {
      active = job;
      listener(job);
    }
  });
}

export function honorCardRasterSucceeded(uri: string) {
  const job = active;
  if (queue[0] === job) {
    queue.shift();
  }
  active = null;
  job?.resolve(uri);
  const next = queue[0] ?? null;
  if (next && listener) {
    active = next;
    listener(next);
  }
}

export function honorCardRasterFailed(message: string) {
  const job = active;
  if (queue[0] === job) {
    queue.shift();
  }
  active = null;
  job?.reject(new Error(message || 'Could not build that check-in card.'));
  const next = queue[0] ?? null;
  if (next && listener) {
    active = next;
    listener(next);
  }
}

export function resetHonorCardRasterForTests() {
  queue.splice(0, queue.length);
  active = null;
  listener = null;
}
