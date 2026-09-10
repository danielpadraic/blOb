type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

/** Live / Circle chat owns this. Home comments and Simple create do not. */
export function setLiveComposerKeyboardOpen(next: boolean): void {
  if (open === next) {
    return;
  }
  open = next;
  listeners.forEach((fn) => fn());
}

export function isLiveComposerKeyboardOpen(): boolean {
  return open;
}

export function subscribeLiveComposerKeyboard(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
