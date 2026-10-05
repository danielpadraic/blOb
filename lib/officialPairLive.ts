export type OfficialPairRoom = 'Weekly' | 'Monthly';

/** The other Official room, named the way the failure line names it. */
export function officialPairSiblingRoom(
  kind?: 'coin_weekly' | 'coin_monthly' | null,
): OfficialPairRoom | null {
  if (kind === 'coin_weekly') {
    return 'Monthly';
  }
  if (kind === 'coin_monthly') {
    return 'Weekly';
  }
  return null;
}

export function officialPairLiveFailure(room: OfficialPairRoom): string {
  return `Couldn’t post to ${room}`;
}

export function officialPairLiveMiss(value: unknown): OfficialPairRoom | null {
  return value === 'Weekly' || value === 'Monthly' ? value : null;
}
