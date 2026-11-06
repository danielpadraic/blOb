type Listener = () => void;

let open = false;
let holds = 0;
const listeners = new Set<Listener>();

/** Live / Circle chat owns this. Home comments and Simple create do not. */
export function setLiveComposerKeyboardOpen(next: boolean): void {
  if (open === next) {
    return;
  }
  open = next;
  listeners.forEach((fn) => fn());
}

/**
 * A full-bleed sheet (Lift Share) keeps the pill tab bar out of the way while it is open,
 * whatever the keyboard is doing. Counted, so two holders never release each other.
 */
export function holdTabBarHidden(): () => void {
  const wasHidden = isLiveComposerKeyboardOpen();
  holds += 1;
  if (!wasHidden) {
    listeners.forEach((fn) => fn());
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holds = Math.max(0, holds - 1);
    if (!isLiveComposerKeyboardOpen()) {
      listeners.forEach((fn) => fn());
    }
  };
}

export function isLiveComposerKeyboardOpen(): boolean {
  return open || holds > 0;
}

export function subscribeLiveComposerKeyboard(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
