/** Lobby MediaPanel: 38% of a ~360pt card, 160pt tall after vertical padding. */
export const LOBBY_COVER_ASPECT_WIDTH = 17;
export const LOBBY_COVER_ASPECT_HEIGHT = 20;
export const LOBBY_COVER_ASPECT = LOBBY_COVER_ASPECT_WIDTH / LOBBY_COVER_ASPECT_HEIGHT;

export function centerCropRect(
  width: number,
  height: number,
  aspect = LOBBY_COVER_ASPECT,
): { originX: number; originY: number; width: number; height: number } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const imageAspect = safeW / safeH;
  if (imageAspect > aspect) {
    const cropW = Math.max(1, Math.round(safeH * aspect));
    return {
      originX: Math.max(0, Math.round((safeW - cropW) / 2)),
      originY: 0,
      width: Math.min(cropW, safeW),
      height: safeH,
    };
  }
  const cropH = Math.max(1, Math.round(safeW / aspect));
  return {
    originX: 0,
    originY: Math.max(0, Math.round((safeH - cropH) / 2)),
    width: safeW,
    height: Math.min(cropH, safeH),
  };
}
