import type { VisualViewportBox } from '@/lib/clipWatch';

/** Keyboard (or other chrome) covering the bottom of the visual viewport on web. */
export function visualViewportOcclusion(): number {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return 0;
  }
  const vv = window.visualViewport;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

export function visualViewportBox(): VisualViewportBox {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

/** Phone-shell watch box: full visualViewport on a phone, centered max-width column on desktop. */
export function watchSurfaceBox(
  viewport: VisualViewportBox,
  shellMaxWidth: number,
): VisualViewportBox {
  const viewW = Math.max(0, viewport.width || 0);
  const cap = Number.isFinite(shellMaxWidth) && shellMaxWidth > 0 ? shellMaxWidth : viewW;
  const width = viewW > 0 ? Math.min(viewW, cap) : 0;
  const leftover = Math.max(0, viewW - width);
  return {
    top: viewport.top,
    left: viewport.left + leftover / 2,
    width,
    height: viewport.height,
  };
}

function bindViewport(sync: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const vv = window.visualViewport;
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('scroll', sync);
  sync();
  return () => {
    vv?.removeEventListener('resize', sync);
    vv?.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    window.removeEventListener('scroll', sync);
  };
}

export function subscribeVisualViewport(onChange: (occlusion: number) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  return bindViewport(() => onChange(visualViewportOcclusion()));
}

export function subscribeVisualViewportBox(onChange: (box: VisualViewportBox) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  return bindViewport(() => onChange(visualViewportBox()));
}
