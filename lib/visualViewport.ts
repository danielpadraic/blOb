/** Keyboard (or other chrome) covering the bottom of the visual viewport on web. */
export function visualViewportOcclusion(): number {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return 0;
  }
  const vv = window.visualViewport;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

export function subscribeVisualViewport(onChange: (occlusion: number) => void): () => void {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return () => undefined;
  }
  const vv = window.visualViewport;
  const sync = () => onChange(visualViewportOcclusion());
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
  return () => {
    vv.removeEventListener('resize', sync);
    vv.removeEventListener('scroll', sync);
  };
}
