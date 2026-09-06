import { usesQuantityScoring } from '@/lib/challengeExperience';
import {
  filledCumulativeMetrics,
  formatMetricProgress,
  loggedMetricAmount,
  metricUnitLabel,
  resolveCumulativeMetrics,
  type CumulativeMetric,
} from '@/lib/cumulativeMetrics';

export type QuantityProgress = {
  logged: number;
  target: number;
  unit: string;
  label: string;
  done: boolean;
};

function primaryQuantityMetric(challenge: Parameters<typeof resolveCumulativeMetrics>[0]): CumulativeMetric | null {
  return filledCumulativeMetrics(resolveCumulativeMetrics(challenge))[0] ?? null;
}

export function boardQuantityProgress(
  challenge: Parameters<typeof resolveCumulativeMetrics>[0] | null | undefined,
  extras?: {
    distanceMeters?: number | null;
    metricTotals?: Record<string, number> | null;
    points?: number | null;
  },
): QuantityProgress | null {
  if (!challenge || !usesQuantityScoring(challenge)) {
    return null;
  }
  const metric = primaryQuantityMetric(challenge);
  if (!metric) {
    return null;
  }
  const logged = loggedMetricAmount(metric, extras?.metricTotals, extras?.distanceMeters ?? 0);
  const unit = metricUnitLabel(metric);
  return {
    logged,
    target: metric.target,
    unit,
    label: formatMetricProgress(logged, metric),
    done: metric.target > 0 && logged >= metric.target,
  };
}
