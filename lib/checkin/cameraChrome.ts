/** One short line under the status bar. The chip still says Pre, Post, or Workout. */
export function cameraStatusLine(slotLabel: string): string {
  if (slotLabel === 'Pre') {
    return 'Pre selfie';
  }
  if (slotLabel === 'Post') {
    return 'Post selfie';
  }
  if (slotLabel === 'Workout') {
    return 'Workout';
  }
  const line = slotLabel.trim();
  return line || 'Photo';
}

/** The shutter is the camera button. The slot name never goes on it. */
export function cameraShutterLabel(): string {
  return 'Take photo';
}

/**
 * Distance from the bottom of the preview to the chip row.
 * The shutter row is the safe area, its padding, and the round button.
 */
export function chipRowBottom(insetBottom: number): number {
  const safe = Math.max(insetBottom, 16);
  return safe + 98;
}
