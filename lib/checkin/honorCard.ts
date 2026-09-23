import { zonedDateTimeToUtc } from '@/lib/challengeTimezone';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import {
  comparableLogFields,
  formatIncrementCount,
  formatMoneySentenceAmount,
  parseComparablePointsConfig,
  parseMetricValues,
  scoringLaneLabel,
  shortComparableBoardLabel,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';
import { uniqueProofUrls } from '@/lib/challengeProofs';
import type { ScoringIconKey } from '@/lib/scoringIcons';

/** Stable mark on `posts.checkin_stats` so backfill can find honor recap posts. */
export const HONOR_CARD_SOURCE = 'honor_card';

/** Client-only slide when a JPEG is not on the post yet. Never a HealthKit token. */
export const HONOR_CARD_SLIDE = 'blob:honor-card';

/** Storage path prefix for rasterized honor recaps (`user/honor_card-<stamp>.jpg`). */
export const HONOR_CARD_PATH_PREFIX = 'honor_card-';

const HONOR_CARD_PATH_RE = /\/honor_card-\d+\.(jpe?g|png|webp)$/i;

export const HONOR_CARD_WIDTH = 1080;
export const HONOR_CARD_HEIGHT = 1350;

/** Card-local Board chrome. Do not add these to `lib/theme.ts`. */
export const HONOR_CARD_INK = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  line: '#E8EBE8',
  teal: '#2C9B89',
  tealSoft: '#E7F7F3',
  ink: '#151716',
  muted: '#7F8581',
} as const;

export type HonorCardField = {
  key: string;
  label: string;
  chipLabel: string;
  value: number;
  kind: 'count' | 'money';
  iconKey: ScoringIconKey;
};

export type HonorCardModel = {
  title: string;
  laneLabel: string | null;
  fields: HonorCardField[];
  periodLabel: string;
};

export type HonorSlide = {
  url: string;
  card: HonorCardModel;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isHonorCardSource(value: unknown): boolean {
  return String(value ?? '').trim() === HONOR_CARD_SOURCE;
}

export function parseHonorCardFields(value: unknown): HonorCardField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const fields: HonorCardField[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const key = String(row.key ?? '').trim();
    const label = String(row.label ?? '').trim();
    if (!key || !label) {
      continue;
    }
    const raw = Number(row.value);
    const valueN = Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : 0;
    const kind = row.kind === 'money' ? 'money' : 'count';
    const iconKey = (String(row.icon_key ?? row.iconKey ?? 'generic').trim() || 'generic') as ScoringIconKey;
    fields.push({
      key,
      label,
      chipLabel: String(row.chip_label ?? row.chipLabel ?? '').trim() || shortComparableBoardLabel(label),
      value: valueN,
      kind,
      iconKey,
    });
  }
  return fields;
}

export function isHonorCardStats(stats?: CheckinProofStats | null): boolean {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return false;
  }
  if (isHonorCardSource(stats.source)) {
    return true;
  }
  return parseHonorCardFields(stats.honor_fields).length > 0;
}

export function honorCardFieldsFromLog(
  config: ComparablePointsConfig,
  metrics: Record<string, number>,
): HonorCardField[] {
  const fields: HonorCardField[] = [];
  for (const field of comparableLogFields(config)) {
    if (field.kind !== 'activity' && field.kind !== 'multiplier') {
      continue;
    }
    const raw = Number(metrics[field.key]);
    const value = Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : 0;
    fields.push({
      key: field.key,
      label: field.label,
      chipLabel: shortComparableBoardLabel(field.label),
      value,
      kind: field.inputKind === 'money' ? 'money' : 'count',
      iconKey: field.iconKey,
    });
  }
  return fields;
}

export function honorPeriodLabel(periodKey: string, timeZone: string): string {
  const match = String(periodKey ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return '';
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const zone = String(timeZone ?? '').trim() || 'UTC';
  try {
    const at = zonedDateTimeToUtc(year, month, day, 12, 0, zone);
    return at.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: zone,
    });
  } catch {
    return `${match[2]}/${match[3]}`;
  }
}

export function formatHonorFieldValue(field: Pick<HonorCardField, 'kind' | 'value'>): string {
  if (field.kind === 'money') {
    return formatMoneySentenceAmount(field.value);
  }
  return formatIncrementCount(field.value);
}

export function honorStatChipLabel(field: HonorCardField): string {
  if (field.kind === 'money') {
    const money = formatMoneySentenceAmount(field.value);
    const name = field.chipLabel.trim();
    return name && !money.includes(name) ? `${money} ${name}` : money;
  }
  return `${formatIncrementCount(field.value)} ${field.chipLabel}`.trim();
}

export function honorStatChips(stats?: CheckinProofStats | null): { key: string; label: string }[] {
  if (!isHonorCardStats(stats)) {
    return [];
  }
  return parseHonorCardFields(stats?.honor_fields).map((field) => ({
    key: field.key,
    label: honorStatChipLabel(field),
  }));
}

export function buildHonorProofCard(input: {
  config: ComparablePointsConfig;
  metrics: Record<string, number>;
  laneId?: string | null;
  title: string;
  periodKey: string;
  timeZone: string;
}): HonorCardModel | null {
  const fields = honorCardFieldsFromLog(input.config, input.metrics);
  if (fields.length === 0) {
    return null;
  }
  const title = String(input.title ?? '').trim();
  return {
    title: title || 'Check-in',
    laneLabel: scoringLaneLabel(input.config, input.laneId),
    fields,
    periodLabel: honorPeriodLabel(input.periodKey, input.timeZone),
  };
}

export function honorCardModelFromStats(
  stats?: CheckinProofStats | null,
  title?: string | null,
): HonorCardModel | null {
  if (!isHonorCardStats(stats)) {
    return null;
  }
  const fields = parseHonorCardFields(stats?.honor_fields);
  if (fields.length === 0) {
    return null;
  }
  const storedTitle = String(stats?.challenge_title ?? title ?? '').trim();
  return {
    title: storedTitle || 'Check-in',
    laneLabel: String(stats?.lane_label ?? '').trim() || null,
    fields,
    periodLabel: String(stats?.period_label ?? '').trim(),
  };
}

export function honorCardStatsPayload(input: {
  fields: HonorCardField[];
  laneId?: string | null;
  laneLabel?: string | null;
  title?: string | null;
  periodLabel?: string | null;
  cardUrl?: string | null;
}): CheckinProofStats {
  return {
    source: HONOR_CARD_SOURCE,
    honor_fields: input.fields.map((field) => ({
      key: field.key,
      label: field.label,
      chip_label: field.chipLabel,
      value: field.value,
      kind: field.kind,
      icon_key: field.iconKey,
    })),
    scoring_lane: input.laneId ? String(input.laneId) : null,
    lane_label: input.laneLabel ? String(input.laneLabel) : null,
    challenge_title: input.title ? String(input.title) : null,
    period_label: input.periodLabel ? String(input.periodLabel) : null,
    card_url: input.cardUrl ? String(input.cardUrl) : null,
  };
}

export function isHonorCardSlide(url?: string | null): boolean {
  return String(url ?? '').split('?')[0] === HONOR_CARD_SLIDE;
}

export function isHonorCardStoragePath(url?: string | null): boolean {
  return HONOR_CARD_PATH_RE.test(String(url ?? '').split('?')[0]);
}

export function namedHonorCardUrl(stats?: CheckinProofStats | null): string {
  if (!isHonorCardStats(stats)) {
    return '';
  }
  const cardUrl = String(stats?.card_url ?? '').trim();
  if (!cardUrl || cardUrl.startsWith('health:') || cardUrl === HONOR_CARD_SLIDE) {
    return '';
  }
  return cardUrl;
}

export function isHonorCardUrl(url?: string | null, cardUrl?: string | null): boolean {
  if (isHonorCardSlide(url) || isHonorCardStoragePath(url)) {
    return true;
  }
  const file = String(url ?? '').split('?')[0];
  const named = String(cardUrl ?? '').split('?')[0];
  return file.length > 0 && named.length > 0 && file === named;
}

/**
 * Stored recap JPEG on this post — not the client-only `blob:honor-card` slide.
 * Backfill and same-day replace use this so a second card is never appended.
 */
export function hasHonorRecapUrl(
  media?: Array<string | null | undefined> | null,
  stats?: CheckinProofStats | null,
): boolean {
  const named = namedHonorCardUrl(stats);
  if (named) {
    return true;
  }
  return uniqueProofUrls(media).some((url) => isHonorCardStoragePath(url));
}

export function honorSlideForPost(input: {
  stats?: CheckinProofStats | null;
  challengeTitle?: string | null;
}): HonorSlide | null {
  const card = honorCardModelFromStats(input.stats, input.challengeTitle);
  if (!card) {
    return null;
  }
  const url = namedHonorCardUrl(input.stats) || HONOR_CARD_SLIDE;
  return { url, card };
}

/** User stills first, one honor recap last. Injects the drawable token when no JPEG exists. */
export function pagerUrlsWithHonorCard(urls: string[], stats?: CheckinProofStats | null): string[] {
  if (!isHonorCardStats(stats)) {
    return uniqueProofUrls(urls).filter((url) => !isHonorCardSlide(url));
  }
  const named = namedHonorCardUrl(stats);
  const stills: string[] = [];
  const cards: string[] = [];
  for (const url of uniqueProofUrls(urls)) {
    if (isHonorCardSlide(url)) {
      continue;
    }
    if (isHonorCardStoragePath(url) || (named && url.split('?')[0] === named.split('?')[0])) {
      cards.push(url);
      continue;
    }
    stills.push(url);
  }
  const recap = (named && cards.find((url) => url.split('?')[0] === named.split('?')[0])) || cards[0] || named || HONOR_CARD_SLIDE;
  return uniqueProofUrls([...stills, recap]);
}

export function unionHonorCardMedia(input: {
  existing: Array<string | null | undefined> | null | undefined;
  nextCardUrl: string;
  previousCardUrl?: string | null;
}): string[] {
  const next = String(input.nextCardUrl ?? '').trim();
  const previous = String(input.previousCardUrl ?? '').trim();
  const kept = uniqueProofUrls(input.existing).filter((url) => {
    if (isHonorCardSlide(url) || isHonorCardStoragePath(url)) {
      return false;
    }
    if (previous && url.split('?')[0] === previous.split('?')[0]) {
      return false;
    }
    return true;
  });
  return uniqueProofUrls([...kept, next]);
}

export function comparableConfigFromChallenge(value: {
  scoring_config?: unknown;
  comparable_points_config?: unknown;
} | null | undefined): ComparablePointsConfig | null {
  return parseComparablePointsConfig(value?.scoring_config ?? value?.comparable_points_config ?? null);
}

export function honorMetricsFromCheckin(value: unknown): Record<string, number> {
  return parseMetricValues(value);
}
