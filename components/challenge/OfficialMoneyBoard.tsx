import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { BuckUsdAmount } from '@/components/currency/CurrencyMark';
import { EntryFeeAmount } from '@/components/currency/EntryFeeAmount';
import { entryFieldNote, prizeFieldNote, type FieldNoteKey } from '@/lib/challengeFieldNotes';
import { cashPrizeLabel } from '@/lib/currency';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  officialContestantsNeeded,
  officialGuaranteeAmount,
  officialStartNeededLabel,
  showsGuaranteedPrize,
} from '@/lib/officialSeries';
import { THEME } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

export function officialGuarantee(
  challenge: Pick<ChallengeWithStats, 'host_budget' | 'creator_contribution'>,
): number {
  return officialGuaranteeAmount(challenge);
}

export function OfficialMoneyBoard({
  challenge,
  finished = 0,
  onInvite,
}: {
  challenge: ChallengeWithStats;
  finished?: number;
  onInvite?: () => void;
}) {
  const filling = isOfficialJoinable(challenge);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!filling || challenge.status !== 'arming') {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [filling, challenge.status]);

  const guarantee = officialGuarantee(challenge);
  const showGuarantee = showsGuaranteedPrize(challenge);
  const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
  const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const joined = Math.max(Number(challenge.participant_count) || 0, 0);
  const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
  const startLine =
    needed > 0
      ? officialStartNeededLabel(needed)
      : challenge.status === 'arming'
        ? armingCountdownLabel(challenge.armed_at, new Date(nowMs))
        : null;

  return (
    <View
      className="mt-3 gap-2"
      style={{
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: THEME.radius,
        backgroundColor: THEME.surface,
        padding: 12,
      }}>
      {filling ? (
        <>
          <View className="flex-row" style={{ gap: 8 }}>
            <Stat
              label={buyIn <= 0 ? 'Entry' : copy('create.buyIn')}
              value={
                <EntryFeeAmount
                  amount={buyIn}
                  currency={challenge.currency}
                  textClassName="text-[13px] font-extrabold text-charcoal"
                  labeled
                />
              }
              note={entryFieldNote(challenge)}
            />
            {showGuarantee ? (
              <Stat label={copy('board.guarantee')} value={<BuckUsdAmount amount={guarantee} size={16} />} />
            ) : null}
            <Stat label={copy('board.pot')} value={cashPrizeLabel(pot)} note={prizeFieldNote(challenge)} />
          </View>
          {startLine ? (
            <View className="flex-row items-start" style={{ gap: 6 }}>
              <FieldNoteLabel
                note="startNeeded"
                textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Start
              </FieldNoteLabel>
              <AppText className="min-w-0 flex-1 text-[12px] leading-5 text-muted">{startLine}</AppText>
            </View>
          ) : null}
          <OfficialInviteButton
            challengeId={challenge.id}
            challengeTitle={challenge.title}
            onOpenPicker={onInvite}
          />
        </>
      ) : (
        <View className="flex-row" style={{ gap: 6 }}>
          <Stat label={copy('board.joined')} value={String(joined)} />
          <Stat label={copy('board.finished')} value={String(Math.max(finished, 0))} />
          <Stat label={copy('board.pot')} value={cashPrizeLabel(pot)} note={prizeFieldNote(challenge)} />
          {showGuarantee ? (
            <Stat label={copy('board.guarantee')} value={<BuckUsdAmount amount={guarantee} size={16} />} />
          ) : null}
        </View>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: FieldNoteKey;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {note ? (
        <FieldNoteLabel
          note={note}
          numberOfLines={1}
          textClassName="text-[9px] font-semibold uppercase text-muted"
          textStyle={{ letterSpacing: 0.2 }}>
          {label}
        </FieldNoteLabel>
      ) : (
        <AppText
          className="text-[9px] font-semibold uppercase text-muted"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ letterSpacing: 0.2 }}>
          {label}
        </AppText>
      )}
      {typeof value === 'string' ? (
        <AppText className="mt-0.5 text-[13px] font-extrabold text-charcoal" numberOfLines={1}>
          {value}
        </AppText>
      ) : (
        <View className="mt-0.5">{value}</View>
      )}
    </View>
  );
}
