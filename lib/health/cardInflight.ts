/**
 * One recap card per check-in, no matter which screen draws it.
 *
 * The check-in screen draws a card as soon as Health is attached. If Send is tapped while that draw is
 * still running, the screen leaves and the app-level redraw host finishes it from the stored workout
 * summary. Both paths end in the same append, so the only way to get a second card is for both to run
 * at once. This registry is how each one knows the other has it.
 */

const INFLIGHT_TTL_MS = 90_000;

const inflight = new Map<string, number>();
const handoffRooms = new Set<string>();

function clean(value?: string | null): string {
  return String(value ?? '').trim();
}

/** A draw or upload for this check-in is running somewhere. Expires so a crash cannot block it forever. */
export function beginCardInflight(checkinId?: string | null, now: number = Date.now()): void {
  const id = clean(checkinId);
  if (id) {
    inflight.set(id, now + INFLIGHT_TTL_MS);
  }
}

export function endCardInflight(checkinId?: string | null): void {
  const id = clean(checkinId);
  if (id) {
    inflight.delete(id);
  }
}

export function isCardInflight(checkinId?: string | null, now: number = Date.now()): boolean {
  const id = clean(checkinId);
  const until = id ? inflight.get(id) : undefined;
  if (until === undefined) {
    return false;
  }
  if (until <= now) {
    inflight.delete(id);
    return false;
  }
  return true;
}

/** Send left while the card was still drawing. A failure for this room becomes a notice on its Live. */
export function watchCardHandoff(challengeIds: Array<string | null | undefined>): void {
  for (const challengeId of challengeIds) {
    const id = clean(challengeId);
    if (id) {
      handoffRooms.add(id);
    }
  }
}

/** True once per handed-off room: the caller reports the outcome and the watch ends. */
export function takeCardHandoff(challengeId?: string | null): boolean {
  const id = clean(challengeId);
  return id ? handoffRooms.delete(id) : false;
}

export function resetCardInflightForTests(): void {
  inflight.clear();
  handoffRooms.clear();
}
