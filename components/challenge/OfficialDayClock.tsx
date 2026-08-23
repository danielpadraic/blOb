import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { officialBob } from '@/copy/officialBob';
import { copy, interpolateCopy } from '@/lib/copy';
import {
  countdownTo,
  formatLocalClock,
  officialCurrentWindow,
  officialWindowsFor,
} from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import type { Challenge } from '@/lib/types';

type OfficialDayClockProps = {
  challenge: Pick<
    Challenge,
    | 'is_official'
    | 'series_id'
    | 'status'
    | 'starts_at'
    | 'timezone'
    | 'days_required'
    | 'target_count'
    | 'day_windows'
  >;
  now?: Date;
  variant?: 'hero' | 'page' | 'card';
  tone?: 'light' | 'dark';
};

export function OfficialDayClock({
  challenge,
  now = new Date(),
  variant = 'page',
  tone,
}: OfficialDayClockProps) {
  if (!isOfficialSeriesChallenge(challenge)) {
    return null;
  }

  const windows = officialWindowsFor(challenge);
  const current = officialCurrentWindow(challenge, now);
  const total = Math.max(windows.length, Number(challenge.days_required) || 7);
  const dark = tone === 'dark' || (tone == null && variant === 'hero');
  const color = dark ? 'rgba(255,255,255,0.86)' : undefined;
  const titleColor = dark ? '#fff' : undefined;
  const mutedClass = dark ? undefined : 'text-muted';
  const titleClass = dark ? undefined : 'text-charcoal';
  const compact = variant === 'card';

  return (
    <View className={compact ? 'gap-0.5' : 'gap-0.5'}>
      {current ? (
        <>
          <AppText
            className={compact ? `text-[12px] font-extrabold ${titleClass}` : `text-[15px] font-extrabold ${titleClass}`}
            style={{ color: titleColor }}>
            {interpolateCopy(copy('official.dayOf'), { n: current.day, total })}
          </AppText>
          <AppText
            className={compact ? `text-[11px] font-semibold ${mutedClass}` : `text-[13px] leading-5 ${mutedClass}`}
            style={{ color }}>
            {copy('official.dayEndsCentral')}
          </AppText>
          {compact ? null : (
            <AppText className={`text-[13px] leading-5 ${mutedClass}`} style={{ color }}>
              {interpolateCopy(copy('official.dayEndsLocal'), { time: formatLocalClock(current.endsAt) })}
            </AppText>
          )}
          {countdownTo(current.endsAt, now) ? (
            <AppText
              className={compact ? `text-[11px] font-semibold ${mutedClass}` : `text-[13px] leading-5 ${mutedClass}`}
              style={{ color }}>
              {interpolateCopy(copy('official.dayCountdown'), { time: countdownTo(current.endsAt, now) ?? '' })}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText
          className={compact ? `text-[11px] leading-4 ${mutedClass}` : `text-[13px] leading-5 ${mutedClass}`}
          style={{ color }}>
          {officialBob('legalDays')}
        </AppText>
      )}
    </View>
  );
}
