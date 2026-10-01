/**
 * Home and Live ask for a redraw when they open. The host lives on the tab layout, which does not
 * remount between those screens, so a signal is what starts the next pass.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function requestWorkoutCardRedraw(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function onWorkoutCardRedraw(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
