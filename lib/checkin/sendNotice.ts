type Listener = (line: string) => void;

const listeners = new Map<string, Set<Listener>>();
// Live may not be mounted yet when a fast background step ends. The latest line waits for it.
const pending = new Map<string, string>();

/**
 * Work that finishes after Send has already opened Live (recap card, OCR) reports a problem here.
 * The open Live for that challenge shows it as its one-line notice.
 */
export function postSendNotice(challengeId: string, line: string): void {
  const id = challengeId.trim();
  const text = line.trim();
  if (!id || !text) {
    return;
  }
  const open = listeners.get(id);
  if (!open || open.size === 0) {
    pending.set(id, text);
    return;
  }
  open.forEach((listener) => listener(text));
}

export function subscribeSendNotice(challengeId: string, listener: Listener): () => void {
  const id = challengeId.trim();
  const set = listeners.get(id) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(id, set);
  const waiting = pending.get(id);
  if (waiting) {
    pending.delete(id);
    listener(waiting);
  }
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(id);
    }
  };
}
