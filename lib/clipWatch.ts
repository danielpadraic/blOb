import { copy } from '@/lib/copy';

export type VisualViewportBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Half-height comment sheet that cannot collapse to a title sliver. */
export function commentSheetHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 168;
  }
  const ideal = Math.round(viewportHeight * 0.42);
  const floor = Math.min(168, viewportHeight);
  return Math.max(floor, Math.min(ideal, viewportHeight));
}

/** One-line Round tile label: handle, else first name. Never wrap mid-word in the UI. */
export function roundRailLabel(profile?: {
  username?: string | null;
  display_name?: string | null;
} | null): string {
  const username = profile?.username?.trim();
  if (username) {
    return `@${username.replace(/^@/, '')}`;
  }
  const display = profile?.display_name?.trim();
  if (display) {
    return display.split(/\s+/)[0] ?? display;
  }
  return 'Blob';
}

/** Player chrome uses a real name. "Your Wave" is the Home rail caption only. */
export function waveWatchName(input: {
  isOwn?: boolean;
  groupName?: string | null;
  displayName?: string | null;
  username?: string | null;
}): string {
  if (input.isOwn || input.groupName === copy('wave.yours')) {
    return input.displayName?.trim() || input.username?.trim() || 'Blob';
  }
  return input.groupName?.trim() || input.displayName?.trim() || input.username?.trim() || 'Blob';
}
