import type { LayoutRectangle } from 'react-native';

/** Rounded window: cards/pills use 20–22; tab icons stay circular-ish; wide rails stay capsules. */
export function holeRadius(hole: Pick<LayoutRectangle, 'width' | 'height'>): number {
  const raw = Math.max(20, Math.min(hole.width, hole.height) * 0.22);
  return Math.min(28, raw, hole.width / 2, hole.height / 2);
}

/** Outer screen clockwise, inner rounded hole counter-clockwise. SVG even-odd fill. */
export function dimWithRoundedHolePath(
  hole: Pick<LayoutRectangle, 'x' | 'y' | 'width' | 'height'>,
  screenW: number,
  screenH: number,
  radius = holeRadius(hole),
): string {
  const r = Math.min(radius, hole.width / 2, hole.height / 2);
  const x = hole.x;
  const y = hole.y;
  const w = hole.width;
  const h = hole.height;
  return [
    `M0,0H${screenW}V${screenH}H0Z`,
    `M${x + r},${y}`,
    `L${x + w - r},${y}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `L${x + w},${y + h - r}`,
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}`,
    `L${x + r},${y + h}`,
    `A${r},${r} 0 0 1 ${x},${y + h - r}`,
    `L${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
}
