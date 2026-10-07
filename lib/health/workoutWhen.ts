/**
 * When a Health workout finished, in a named timezone.
 * The completed day is `endedAt`. A missing clock stays blank. UTC is never used.
 */

type ZonedClock = {
  year: string;
  month: string;
  day: string;
  weekday: string;
  hour: string;
  minute: string;
  dayPeriod: string;
  key: string;
};

function namedZone(timeZone?: string | null): string {
  const named = String(timeZone ?? '').trim();
  if (!named || named.toUpperCase() === 'UTC') {
    return '';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: named }).format(new Date());
    return named;
  } catch {
    return '';
  }
}

/** Challenge zone when it is a real place. Otherwise the phone's zone. Never UTC. */
export function workoutTimeZone(preferred?: string | null): string {
  const named = namedZone(preferred);
  if (named) {
    return named;
  }
  try {
    return namedZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return '';
  }
}

function zonedClock(date: Date, timeZone: string): ZonedClock | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h12',
    }).formatToParts(date);
    const bag: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        bag[part.type] = part.value;
      }
    }
    const monthNum = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const nums: Record<string, string> = {};
    for (const part of monthNum) {
      if (part.type !== 'literal') {
        nums[part.type] = part.value;
      }
    }
    if (!bag.weekday || !bag.month || !bag.day || !bag.hour || !bag.minute || !nums.year) {
      return null;
    }
    return {
      year: nums.year,
      month: bag.month,
      day: bag.day,
      weekday: bag.weekday,
      hour: bag.hour,
      minute: bag.minute,
      dayPeriod: String(bag.dayPeriod ?? '').toUpperCase(),
      key: `${nums.year}-${nums.month}-${nums.day}`,
    };
  } catch {
    return null;
  }
}

function clock(part: ZonedClock, withMeridiem: boolean): string {
  const face = `${part.hour}:${part.minute}`;
  const meridiem = part.dayPeriod.replace(/\s+/g, '');
  return withMeridiem && meridiem ? `${face} ${meridiem}` : face;
}

function dayLabel(part: ZonedClock): string {
  return `${part.weekday}, ${part.month} ${part.day}`;
}

/** "Wed, Oct 1" from the moment the workout ended. Blank when the clock or the zone is missing. */
export function formatCompletedDay(endedAt?: string | null, timeZone?: string | null): string {
  const zone = workoutTimeZone(timeZone);
  const end = endedAt ? new Date(endedAt) : null;
  if (!zone || !end || Number.isNaN(end.getTime())) {
    return '';
  }
  const part = zonedClock(end, zone);
  return part ? dayLabel(part) : '';
}

function oneClockLine(instant: Date, zone: string): string {
  const part = zonedClock(instant, zone);
  return part ? `${dayLabel(part)} · ${clock(part, true)}` : '';
}

/**
 * Same calendar day: "Wed, Oct 1 · 7:23–8:14 AM".
 * Crosses midnight: "Tue, Sep 30, 11:40 PM – Wed, Oct 1, 12:10 AM".
 * One clock is enough: the day and that time still print. Blank only when both are missing.
 */
export function formatWorkoutWhen(input: {
  startedAt?: string | null;
  endedAt?: string | null;
  timeZone?: string | null;
}): string {
  const zone = workoutTimeZone(input.timeZone);
  if (!zone) {
    return '';
  }
  const start = input.startedAt ? new Date(input.startedAt) : null;
  const end = input.endedAt ? new Date(input.endedAt) : null;
  const startOk = Boolean(start && !Number.isNaN(start.getTime()));
  const endOk = Boolean(end && !Number.isNaN(end.getTime()));
  if (!startOk && !endOk) {
    return '';
  }
  if (!startOk || !endOk) {
    return oneClockLine((startOk ? start : end) as Date, zone);
  }
  const startPart = zonedClock(start as Date, zone);
  const endPart = zonedClock(end as Date, zone);
  if (!startPart || !endPart) {
    return oneClockLine((endPart ? end : start) as Date, zone);
  }
  if (startPart.key === endPart.key) {
    const shared = startPart.dayPeriod && startPart.dayPeriod === endPart.dayPeriod;
    return `${dayLabel(endPart)} · ${clock(startPart, !shared)}–${clock(endPart, true)}`;
  }
  return `${dayLabel(startPart)}, ${clock(startPart, true)} – ${dayLabel(endPart)}, ${clock(endPart, true)}`;
}
