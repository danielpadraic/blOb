import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { fetchChallengeById } from '@/lib/challenges';
import { formatCashCompact, isBucksChallenge } from '@/lib/currency';
import { armingCountdownLabel, officialContestantsNeeded } from '@/lib/officialSeries';
import { isJoinWindowOpen } from '@/lib/settlement';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown } from '@/utils/format';

const HEIGHT = 132;
const RADIUS = 16;
const OFFICIAL_BG = '#123832';

type LobbyChallengeCardProps = {
  challenge: ChallengeWithStats;
  joined?: boolean;
  hosting?: boolean;
  onPress?: () => void;
};

function isEndedStatus(status: string): boolean {
  return (
    status === 'settled' ||
    status === 'cancelled' ||
    status === 'cancelled_underfilled' ||
    status === 'judging' ||
    status === 'distributing'
  );
}

function isLiveStatus(status: string): boolean {
  return status === 'live' || status === 'in_progress';
}

export function lobbyCardStatus(challenge: ChallengeWithStats, nowMs = Date.now()): string {
  const status = String(challenge.status ?? '');
  if (isEndedStatus(status)) {
    return 'Ended';
  }
  if (isLiveStatus(status)) {
    return 'Live';
  }
  if (challenge.is_official) {
    const guarantee = Math.max(Number(challenge.host_budget ?? challenge.creator_contribution) || 0, 0);
    const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
    const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
    const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
    if (status === 'filling' && needed > 0) {
      return `Filling · ${needed} more needed`;
    }
    if (status === 'arming') {
      return armingCountdownLabel(challenge.armed_at, new Date(nowMs)) ?? 'Starts in 1h';
    }
  }
  const start = challenge.starts_at ? new Date(challenge.starts_at) : null;
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > nowMs) {
    const wait = compactCountdown(start, new Date(nowMs));
    if (wait !== 'now') {
      return `Starts in ${wait}`;
    }
  }
  return 'Open';
}

export function lobbyCardCanJoin(input: {
  challenge: ChallengeWithStats;
  joined?: boolean;
  hosting?: boolean;
}): boolean {
  if (input.joined || input.hosting) {
    return false;
  }
  return isJoinWindowOpen(input.challenge);
}

export function LobbyChallengeCard({
  challenge,
  joined = false,
  hosting = false,
  onPress,
}: LobbyChallengeCardProps) {
  const official = Boolean(challenge.is_official);
  const ticking =
    String(challenge.status) === 'arming' ||
    (challenge.starts_at != null && new Date(challenge.starts_at).getTime() > Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const joinSheet = useJoinConfirm();

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const status = lobbyCardStatus(challenge, nowMs);
  const canJoin = lobbyCardCanJoin({ challenge, joined, hosting });
  const cta = canJoin ? 'Join' : 'View';
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const muted = official ? 'rgba(231,247,243,0.72)' : THEME.textMuted;
  const stateTag = official ? null : joined ? 'You’re in' : hosting ? 'Hosting' : null;

  async function openDetail() {
    onPress?.();
  }

  async function onCta() {
    if (!canJoin) {
      await openDetail();
      return;
    }
    if (joining || joinSheet.loading) {
      return;
    }
    setJoining(true);
    try {
      joinSheet.open(await fetchChallengeById(challenge.id));
    } catch (error) {
      Alert.alert(getErrorMessage(error));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Pressable
      onPress={() => void openDetail()}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={{
        height: HEIGHT,
        maxHeight: 140,
        borderRadius: RADIUS,
        overflow: 'hidden',
        backgroundColor: official ? OFFICIAL_BG : THEME.surface,
        borderWidth: official ? 0 : 1,
        borderColor: THEME.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        justifyContent: 'space-between',
        ...(official ? null : themeShadow('card')),
      }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        {official ? <BlobMascot variant="logo" size={24} /> : null}
        {stateTag ? (
          <AppText
            className="text-[11px] font-extrabold"
            style={{ color: THEME.accent, flexShrink: 0 }}
            numberOfLines={1}>
            {stateTag}
          </AppText>
        ) : null}
        <AppText
          className="min-w-0 flex-1 text-right text-[12px] font-semibold"
          style={{ color: muted }}
          numberOfLines={1}>
          {status}
        </AppText>
      </View>

      <AppText
        className="text-[17px] font-semibold leading-5"
        style={{ color: titleColor }}
        numberOfLines={1}>
        {challenge.title}
      </AppText>

      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View className="min-w-0 flex-1">
          <EntryMark challenge={challenge} color={titleColor} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta}
          disabled={joining}
          onPress={(event) => {
            event.stopPropagation();
            void onCta();
          }}
          style={{
            minHeight: 44,
            minWidth: 72,
            paddingHorizontal: 14,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: canJoin ? THEME.accent : official ? 'rgba(255,255,255,0.12)' : THEME.surface,
            borderWidth: 1,
            borderColor: canJoin ? THEME.accent : official ? 'rgba(255,255,255,0.28)' : THEME.accent,
          }}>
          <AppText
            className="text-[14px] font-extrabold"
            style={{ color: canJoin ? THEME.accentForeground : official ? '#FFFFFF' : THEME.accent }}>
            {cta}
          </AppText>
        </Pressable>
      </View>
    </Pressable>
  );
}

function EntryMark({ challenge, color }: { challenge: ChallengeWithStats; color: string }) {
  const amount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className="text-[15px] font-extrabold" style={{ color }} numberOfLines={1}>
        {formatCashCompact(amount)}
      </AppText>
    );
  }
  return (
    <View className="flex-row items-center" style={{ gap: 5 }}>
      <CurrencyMark currency={challenge.currency} size={16} />
      <AppText className="text-[15px] font-extrabold" style={{ color }} numberOfLines={1}>
        {amount <= 0 ? '0' : Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}
      </AppText>
    </View>
  );
}
