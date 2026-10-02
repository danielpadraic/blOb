/** How long a cardio block lasted. A unit, not a bare clock. */
export function durationLabel(seconds: number): string {
  const total = Math.max(Math.round(Number(seconds) || 0), 0);
  if (total <= 0) {
    return '';
  }
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export type CheckinCollapseRow = {
  id: string;
  period_key: string;
  proof_parts: unknown;
};

function partHealth(parts: unknown): { source: string; workoutId: string; startedAt: string; durationSec: number } | null {
  if (!parts || typeof parts !== 'object') {
    return null;
  }
  for (const value of Object.values(parts as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const part = value as { health?: unknown; healthWorkoutId?: string };
    const health = part.health;
    if (!health || typeof health !== 'object') {
      continue;
    }
    const row = health as { source?: string; startedAt?: string; durationSec?: number };
    const source = String(row.source ?? '');
    if (source !== 'healthkit' && source !== 'health_connect') {
      continue;
    }
    return {
      source,
      workoutId: String(part.healthWorkoutId ?? '').trim(),
      startedAt: String(row.startedAt ?? '').trim(),
      durationSec: Number(row.durationSec) || 0,
    };
  }
  return null;
}

/** One row when Weekly and Monthly stored the same Health workout. */
export function collapseCheckinRows<T extends CheckinCollapseRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const health = partHealth(row.proof_parts);
    const key = health
      ? `${row.period_key}|${health.source}|${health.workoutId || health.startedAt || health.durationSec}`
      : row.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}
