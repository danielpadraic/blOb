/**
 * Pure parser for workout-summary screenshots (Apple Fitness / Health / Watch, Samsung Health,
 * Google Fit, Garmin, Fitbit, Strava).
 *
 * Engine-independent on purpose: it takes the flat text an OCR engine returned and never touches
 * pixels, so iOS, Android, Web and the backfill job all share one set of rules and one test suite.
 *
 * Field names map 1:1 onto the CheckinHealthProof jsonb the check-in already stores, so OCR does
 * not introduce a second vocabulary for the same numbers.
 */

export type ParsedWorkoutOcr = {
  durationSec?: number;
  activeEnergyKcal?: number;
  totalEnergyKcal?: number;
  minHrBpm?: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
  distanceMeters?: number;
  activityLabel?: string;
  /**
   * Wall-clock range the screen showed, when it showed one. Sent instead of the raw text so the
   * client can resolve an honest workout window without receiving the whole OCR dump.
   */
  clockRange?: OcrClockRange;
  /** Fraction of the five headline fields we actually found. */
  confidence: number;
};

/** Editor + parser clamps. Anything outside these is a misread, not a workout. */
export const OCR_LIMITS = {
  durationSec: { min: 60, max: 8 * 3600 },
  kcal: { min: 0, max: 5000 },
  hrBpm: { min: 30, max: 230 },
  distanceMiles: { min: 0, max: 300 },
  distanceKm: { min: 0, max: 500 },
} as const;

export const METERS_PER_MILE = 1609.344;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds and clamps, returning undefined when the value is outside a believable range. */
function accept(value: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(value) || value < min || value > max) {
    return undefined;
  }
  return Math.round(value);
}

/**
 * Body metrics and unrelated numerals we must never read as workout stats. Weight and BMI in
 * particular sit next to workout data on Samsung Health and Fitbit summary screens.
 */
const BANNED_LINE = /\b(bmi|body fat|bfp|body mass|weight|lbs?\b|resting|stand hours?|sleep|credit score|steps?)\b/i;

const ACTIVITY_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /outdoor run|trail run|\brun(ning)?\b/i, label: 'Run' },
  { pattern: /outdoor walk|\bwalk(ing)?\b|\bhik(e|ing)\b/i, label: 'Walk' },
  { pattern: /\bcycl(e|ing)\b|\bbike\b|\bride\b|\bspin\b/i, label: 'Ride' },
  { pattern: /high intensity interval|\bhiit\b/i, label: 'High Intensity Interval Training' },
  { pattern: /traditional strength|strength training|\bweight ?lift/i, label: 'Strength Training' },
  { pattern: /functional strength/i, label: 'Functional Strength Training' },
  { pattern: /\brow(ing|er)?\b/i, label: 'Rowing' },
  { pattern: /\bswim(ming)?\b/i, label: 'Swim' },
  { pattern: /\byoga\b/i, label: 'Yoga' },
  { pattern: /elliptical/i, label: 'Elliptical' },
  { pattern: /\bcore\b/i, label: 'Core Training' },
];

function normalize(raw: string): string {
  return String(raw ?? '')
    // OCR routinely reads O/o for zero inside digit runs and l/I for one next to colons.
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[·•]/g, ' ')
    .replace(/\r/g, '\n');
}

function usableLines(text: string): string[] {
  return normalize(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Strips wall-clock times ("7:33 AM - 8:14 AM") so they can never be read as a duration. Apple's
 * workout summary puts the session's clock range directly above its elapsed time.
 */
function withoutClockTimes(text: string): string {
  return text.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)/gi, ' ');
}

function timeTokenToSeconds(token: string): number | null {
  const parts = token.split(':').map((piece) => Number(piece));
  if (parts.some((piece) => !Number.isFinite(piece) || piece < 0)) {
    return null;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m > 59 || s > 59) {
      return null;
    }
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s > 59) {
      return null;
    }
    return m * 60 + s;
  }
  return null;
}

const DURATION_LABEL =
  /(total time|workout time|elapsed time|moving time|active time|duration|\btime\b)/i;

/**
 * Duration is the field most likely to collide with other numerals, so labelled matches win and a
 * bare h:mm:ss is only a fallback.
 */
export function parseOcrDuration(text: string): number | undefined {
  const scrubbed = withoutClockTimes(normalize(text));
  const lines = scrubbed.split('\n');

  // A labelled value may sit on the label's line or the line under it (stacked stat cards).
  for (let index = 0; index < lines.length; index += 1) {
    if (!DURATION_LABEL.test(lines[index]) || BANNED_LINE.test(lines[index])) {
      continue;
    }
    const window = `${lines[index]} ${lines[index + 1] ?? ''}`;
    const match = window.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if (match) {
      const seconds = timeTokenToSeconds(match[1]);
      const ok = seconds == null ? undefined : accept(seconds, OCR_LIMITS.durationSec.min, OCR_LIMITS.durationSec.max);
      if (ok != null) {
        return ok;
      }
    }
    // "45 min" / "1 hr 5 min" styles.
    const spelled = parseSpelledDuration(window);
    if (spelled != null) {
      return spelled;
    }
  }

  // Fallback: prefer a full h:mm:ss anywhere, then mm:ss.
  const triples = scrubbed.match(/\b\d{1,2}:\d{2}:\d{2}\b/g) ?? [];
  for (const token of triples) {
    const seconds = timeTokenToSeconds(token);
    const ok = seconds == null ? undefined : accept(seconds, OCR_LIMITS.durationSec.min, OCR_LIMITS.durationSec.max);
    if (ok != null) {
      return ok;
    }
  }
  const spelled = parseSpelledDuration(scrubbed);
  if (spelled != null) {
    return spelled;
  }
  // mm:ss only when it is a whole token. Without the guards this reads "12:30" out of the middle
  // of "12:30:00" and turns a rejected 12-hour misread into a plausible-looking 12m30s workout.
  const pairs = [...scrubbed.matchAll(/(?:^|[^\d:])(\d{1,2}:\d{2})(?![:\d])/gm)].map((match) => match[1]);
  for (const token of pairs) {
    const seconds = timeTokenToSeconds(token);
    const ok = seconds == null ? undefined : accept(seconds, OCR_LIMITS.durationSec.min, OCR_LIMITS.durationSec.max);
    if (ok != null) {
      return ok;
    }
  }
  return undefined;
}

function parseSpelledDuration(window: string): number | undefined {
  const hours = window.match(/(\d{1,2})\s*(?:hr?s?|hours?)\b/i);
  const minutes = window.match(/(\d{1,3})\s*(?:mins?|minutes?)\b/i);
  if (!hours && !minutes) {
    return undefined;
  }
  const total = (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0);
  return accept(total, OCR_LIMITS.durationSec.min, OCR_LIMITS.durationSec.max);
}

/** Reads a number that may carry OCR comma/space noise, e.g. "1,208". */
function numberNear(window: string, pattern: RegExp): number | null {
  const match = window.match(pattern);
  if (!match) {
    return null;
  }
  const raw = match[1].replace(/[,\s]/g, '');
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseOcrCalories(text: string): { active?: number; total?: number } {
  const lines = usableLines(text);
  const out: { active?: number; total?: number } = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (BANNED_LINE.test(line)) {
      continue;
    }
    const window = `${line} ${lines[index + 1] ?? ''}`;
    const isTotal = /total (energy|cal)/i.test(line);
    const isActive = /(active energy|active cal|\bmove\b|^active\b)/i.test(line);
    if (!isTotal && !isActive && !/\b(kcal|cal(ories)?)\b/i.test(line)) {
      continue;
    }
    const value =
      numberNear(window, /([\d,]{1,6}(?:\.\d+)?)\s*(?:k?cal|calories)\b/i) ??
      numberNear(window, /\b([\d,]{1,6}(?:\.\d+)?)\b/);
    if (value == null) {
      continue;
    }
    const ok = accept(value, OCR_LIMITS.kcal.min, OCR_LIMITS.kcal.max);
    if (ok == null) {
      continue;
    }
    if (isTotal && out.total == null) {
      out.total = ok;
    } else if (out.active == null) {
      out.active = ok;
    }
  }
  return out;
}

export function parseOcrHeartRate(text: string): { min?: number; avg?: number; max?: number } {
  const lines = usableLines(text);
  const out: { min?: number; avg?: number; max?: number } = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (BANNED_LINE.test(line)) {
      continue;
    }
    const window = `${line} ${lines[index + 1] ?? ''}`;
    const hasHrWord = /(heart ?rate|\bhr\b|\bbpm\b)/i.test(line);
    if (!hasHrWord) {
      continue;
    }
    const value =
      numberNear(window, /\b(\d{2,3})\s*bpm\b/i) ?? numberNear(window, /\b(\d{2,3})\b/);
    const ok = value == null ? undefined : accept(value, OCR_LIMITS.hrBpm.min, OCR_LIMITS.hrBpm.max);
    if (ok == null) {
      continue;
    }
    if (/\b(max|peak|high)\b/i.test(line)) {
      out.max = out.max ?? ok;
    } else if (/\b(min|low|lowest)\b/i.test(line)) {
      out.min = out.min ?? ok;
    } else if (/\b(avg|average|mean)\b/i.test(line) || out.avg == null) {
      out.avg = out.avg ?? ok;
    }
  }
  return out;
}

export function parseOcrDistance(text: string): number | undefined {
  const lines = usableLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (BANNED_LINE.test(line)) {
      continue;
    }
    const window = `${line} ${lines[index + 1] ?? ''}`;
    const miles = window.match(/([\d,]+(?:\.\d+)?)\s*(mi\b|miles?\b)/i);
    if (miles) {
      const value = Number(miles[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value >= OCR_LIMITS.distanceMiles.min && value <= OCR_LIMITS.distanceMiles.max) {
        return Math.round(value * METERS_PER_MILE);
      }
    }
    const km = window.match(/([\d,]+(?:\.\d+)?)\s*(km\b|kilomet(er|re)s?\b)/i);
    if (km) {
      const value = Number(km[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value >= OCR_LIMITS.distanceKm.min && value <= OCR_LIMITS.distanceKm.max) {
        return Math.round(value * 1000);
      }
    }
    // Bare metres only when the line is explicitly about distance, to avoid eating calorie counts.
    if (/distance/i.test(line)) {
      const metres = numberNear(window, /\b([\d,]{2,6})\s*m\b/i);
      if (metres != null && metres > 0 && metres <= OCR_LIMITS.distanceKm.max * 1000) {
        return Math.round(metres);
      }
    }
  }
  return undefined;
}

export type OcrClock = { hour: number; minute: number };
export type OcrClockRange = { start: OcrClock; end: OcrClock };

/**
 * Reads a real wall-clock range off the screen, e.g. Apple's "7:33 AM - 8:14 AM".
 *
 * This is the only honest source of a workout window for a screenshot. When it finds nothing the
 * caller must leave the window empty rather than substituting the current time.
 */
export function parseOcrClockRange(text: string): OcrClockRange | null {
  const scrubbed = normalize(text);
  const pattern =
    /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|to|–)\s*(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i;
  const match = scrubbed.match(pattern);
  if (!match) {
    return null;
  }
  const [, h1, m1, ap1, h2, m2, ap2] = match;
  // "7:33 - 8:14 PM" leaves the first meridiem implicit; it shares the second.
  const start = toClock(Number(h1), Number(m1), ap1 ?? ap2);
  const end = toClock(Number(h2), Number(m2), ap2);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function toClock(hour: number, minute: number, meridiem?: string): OcrClock | null {
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || minute < 0) {
    return null;
  }
  const suffix = (meridiem ?? '').toLowerCase().replace(/[^ap]/g, '');
  let resolved = hour;
  if (suffix === 'p') {
    if (hour < 1 || hour > 12) {
      return null;
    }
    resolved = hour === 12 ? 12 : hour + 12;
  } else if (suffix === 'a') {
    if (hour < 1 || hour > 12) {
      return null;
    }
    resolved = hour === 12 ? 0 : hour;
  } else if (hour > 23) {
    return null;
  }
  return { hour: resolved, minute };
}

export function parseOcrActivity(text: string): string | undefined {
  const scrubbed = normalize(text);
  for (const hint of ACTIVITY_HINTS) {
    if (hint.pattern.test(scrubbed)) {
      return hint.label;
    }
  }
  return undefined;
}

/**
 * Decides whether a still is a workout-summary screen at all. Used to skip selfies and social
 * photos when the proof slot's type is ambiguous, and to record a skip reason during backfill.
 */
export function classifyWorkoutScreen(text: string): { isWorkoutScreen: boolean; reason: string } {
  const scrubbed = normalize(text);
  if (scrubbed.trim().length < 8) {
    return { isWorkoutScreen: false, reason: 'no_text' };
  }
  const signals = [
    /\bbpm\b/i,
    /heart ?rate/i,
    /active (energy|cal)/i,
    /total (time|energy|cal)/i,
    /\bkcal\b/i,
    /workout/i,
    /\b\d{1,2}:\d{2}:\d{2}\b/,
    /(apple ?fitness|strava|garmin|fitbit|samsung health|google fit|health app)/i,
  ].filter((pattern) => pattern.test(scrubbed)).length;

  if (signals < 2) {
    return { isWorkoutScreen: false, reason: 'not_a_workout_screen' };
  }
  return { isWorkoutScreen: true, reason: 'ok' };
}

/**
 * Parses one OCR text blob. Low-confidence fields come back undefined rather than guessed, so a
 * partial read still produces a usable session instead of wrong numbers.
 */
export function parseWorkoutOcrText(text: string): ParsedWorkoutOcr {
  const durationSec = parseOcrDuration(text);
  const calories = parseOcrCalories(text);
  const hr = parseOcrHeartRate(text);
  const distanceMeters = parseOcrDistance(text);
  const activityLabel = parseOcrActivity(text);

  const found = [durationSec, calories.active, hr.avg, hr.max, distanceMeters].filter(
    (value) => value != null,
  ).length;

  const parsed: ParsedWorkoutOcr = { confidence: Number((found / 5).toFixed(2)) };
  if (durationSec != null) {
    parsed.durationSec = durationSec;
  }
  if (calories.active != null) {
    parsed.activeEnergyKcal = calories.active;
  }
  if (calories.total != null) {
    parsed.totalEnergyKcal = calories.total;
  }
  if (hr.min != null) {
    parsed.minHrBpm = hr.min;
  }
  if (hr.avg != null) {
    parsed.avgHrBpm = hr.avg;
  }
  if (hr.max != null) {
    parsed.maxHrBpm = hr.max;
  }
  if (distanceMeters != null) {
    parsed.distanceMeters = distanceMeters;
  }
  if (activityLabel) {
    parsed.activityLabel = activityLabel;
  }
  const clockRange = parseOcrClockRange(text);
  if (clockRange) {
    parsed.clockRange = clockRange;
  }
  return parsed;
}

/** True when there is at least one number worth showing as a chip. */
export function hasOcrNumbers(parsed?: ParsedWorkoutOcr | null): boolean {
  if (!parsed) {
    return false;
  }
  return (
    parsed.durationSec != null ||
    parsed.activeEnergyKcal != null ||
    parsed.avgHrBpm != null ||
    parsed.maxHrBpm != null ||
    parsed.distanceMeters != null
  );
}

/** Blur handler for the chip editors. Keeps a user correction inside the same sane ranges. */
export function clampOcrField(
  field: 'durationSec' | 'activeEnergyKcal' | 'totalEnergyKcal' | 'minHrBpm' | 'avgHrBpm' | 'maxHrBpm',
  value: number,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (field === 'durationSec') {
    return Math.round(clamp(value, OCR_LIMITS.durationSec.min, OCR_LIMITS.durationSec.max));
  }
  if (field === 'activeEnergyKcal' || field === 'totalEnergyKcal') {
    return Math.round(clamp(value, OCR_LIMITS.kcal.min, OCR_LIMITS.kcal.max));
  }
  return Math.round(clamp(value, OCR_LIMITS.hrBpm.min, OCR_LIMITS.hrBpm.max));
}

/** Distance editor clamp, in the unit the user is typing. Returns metres. */
export function clampOcrDistance(value: number, unit: 'mi' | 'km'): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  if (unit === 'mi') {
    return Math.round(clamp(value, OCR_LIMITS.distanceMiles.min, OCR_LIMITS.distanceMiles.max) * METERS_PER_MILE);
  }
  return Math.round(clamp(value, OCR_LIMITS.distanceKm.min, OCR_LIMITS.distanceKm.max) * 1000);
}
