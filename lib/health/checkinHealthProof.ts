/** Structured Health proof stored on the check-in (`proof_parts`), not a profile field. */
export type CheckinHealthProof = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  activityType: string;
  sourceName: string;
  avgHrBpm?: number;
  maxHrBpm?: number;
  /** From the HR sample series, so it is only present when samples were read. */
  minHrBpm?: number;
  activeEnergyKcal?: number;
  totalEnergyKcal?: number;
  distanceMeters?: number;
};

export function parseCheckinHealthProof(value: unknown): CheckinHealthProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const startedAt = typeof row.startedAt === 'string' ? row.startedAt : null;
  const endedAt = typeof row.endedAt === 'string' ? row.endedAt : null;
  const durationSec = Number(row.durationSec);
  const activityType = typeof row.activityType === 'string' ? row.activityType : null;
  const sourceName = typeof row.sourceName === 'string' ? row.sourceName : null;
  if (!startedAt || !endedAt || !Number.isFinite(durationSec) || durationSec < 0 || !activityType || !sourceName) {
    return null;
  }
  const snapshot: CheckinHealthProof = {
    startedAt,
    endedAt,
    durationSec,
    activityType,
    sourceName,
  };
  const avg = Number(row.avgHrBpm);
  const max = Number(row.maxHrBpm);
  const kcal = Number(row.activeEnergyKcal);
  const distance = Number(row.distanceMeters);
  if (Number.isFinite(avg) && avg > 0) {
    snapshot.avgHrBpm = Math.round(avg);
  }
  if (Number.isFinite(max) && max > 0) {
    snapshot.maxHrBpm = Math.round(max);
  }
  if (Number.isFinite(kcal) && kcal > 0) {
    snapshot.activeEnergyKcal = Math.round(kcal);
  }
  if (Number.isFinite(distance) && distance > 0) {
    snapshot.distanceMeters = Math.round(distance);
  }
  return snapshot;
}
