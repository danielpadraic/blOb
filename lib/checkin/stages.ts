import type { CheckinPhase } from '../challengeCheckin';

export const CHECKIN_STAGE_LABELS = {
  begin: 'Begin',
  continue: 'Continue',
  submit: 'Submit',
  done: 'Checked in',
} as const;

export type CheckinStageId = keyof typeof CHECKIN_STAGE_LABELS;

export function checkinStageFromPhase(phase: CheckinPhase): CheckinStageId {
  if (phase === 'submitted') {
    return 'done';
  }
  if (phase === 'ready') {
    return 'submit';
  }
  if (phase === 'in_progress') {
    return 'continue';
  }
  return 'begin';
}

export function checkinStageLabel(phase: CheckinPhase): string {
  return CHECKIN_STAGE_LABELS[checkinStageFromPhase(phase)];
}

export function checkinStageIndex(phase: CheckinPhase): number {
  if (phase === 'submitted') {
    return 3;
  }
  if (phase === 'ready') {
    return 2;
  }
  if (phase === 'in_progress') {
    return 1;
  }
  return 0;
}

export function checkinStageHint(phase: CheckinPhase, remaining: string[]): string {
  if (phase === 'submitted') {
    return 'Checked in for this window.';
  }
  if (remaining.length === 0) {
    return 'All proofs are in. Submit to put it on the board.';
  }
  if (phase === 'none') {
    return remaining.length === 1
      ? `Begin with ${remaining[0]}.`
      : `Begin. Still needed: ${remaining.join(', ')}.`;
  }
  return `Still needed: ${remaining.join(', ')}.`;
}

/** Grey Send tap: Alert title is “Still needed”; this is the name list only. */
export function checkinSendWhyNot(remaining: string[]): string {
  return remaining.filter(Boolean).join(', ');
}

/** Solid Send when honor-only or at least one required proof is attached. Extras never unlock Send. */
export function canSendCheckin(
  honorOnly: boolean,
  hasRequiredAttached: boolean,
  phase: CheckinPhase,
  busy: boolean,
): boolean {
  return (honorOnly || hasRequiredAttached) && !busy;
}
