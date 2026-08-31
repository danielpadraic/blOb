import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { currentRequiredPeriodWindow, type CheckinPeriodChallenge } from '@/lib/checkinPeriod';
import { copy } from '@/lib/copy';
import { countdownTo } from '@/lib/officialDays';
import { THEME } from '@/lib/theme';

export function PeriodCheckinDue({
  challenge,
  submitted = false,
  nowMs,
  compact = false,
  align = 'left',
}: {
  challenge?: CheckinPeriodChallenge | null;
  submitted?: boolean;
  nowMs?: number;
  compact?: boolean;
  align?: 'left' | 'center';
}) {
  const [tick, setTick] = useState(() => Date.now());
  const window = currentRequiredPeriodWindow(challenge, new Date(nowMs ?? tick));
  const endsAtMs = window?.endsAt.getTime() ?? 0;

  useEffect(() => {
    if (submitted || !endsAtMs) {
      return;
    }
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAtMs, submitted]);

  if (!window) {
    return null;
  }

  const remaining = submitted ? null : countdownTo(window.endsAt, new Date(nowMs ?? tick));
  const alignSelf = align === 'center' ? 'center' : 'flex-start';
  const textAlign = align === 'center' ? 'center' : 'left';

  return (
    <View style={{ alignSelf, gap: compact ? 0 : 2 }}>
      <AppText
        className={compact ? 'text-[12px] font-semibold' : 'text-[13px] font-semibold'}
        style={{ color: THEME.textMuted, textAlign }}>
        {submitted ? copy('checkin.checkedIn') : copy('detail.checkinDue')}
      </AppText>
      {submitted ? (
        <AppText
          className={compact ? 'text-[12px] font-semibold' : 'text-[13px] leading-5'}
          style={{ color: THEME.accent, textAlign }}>
          {copy('detail.caughtUp')}
        </AppText>
      ) : !remaining ? null : (
        <AppText
          className={compact ? 'text-[13px] font-extrabold' : 'text-[16px] font-extrabold'}
          style={{ color: THEME.textPrimary, fontVariant: ['tabular-nums'], textAlign }}>
          {remaining}
        </AppText>
      )}
    </View>
  );
}
