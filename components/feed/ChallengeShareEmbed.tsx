import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { fetchChallengeById } from '@/lib/challenges';
import { formatCashCompact, isBucksChallenge } from '@/lib/currency';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown } from '@/utils/format';

export type ShareEmbedChallenge = {
  id: string;
  title: string;
  status: string;
  is_official?: boolean | null;
  buy_in_amount?: number | null;
  currency?: string | null;
  created_by?: string | null;
  starts_at?: string | null;
  series_id?: string | null;
  visibility?: string | null;
  challenge_lane?: unknown;
};

export type ShareEmbedHost = {
  name: string;
  avatarUrl?: string | null;
};

type JoinState = 'joinable' | 'joined' | 'closed';
type StatusText = 'Open' | 'Live' | 'Full' | `Starts in ${string}`;

const HEIGHT = 80;
const RADIUS = 16;
const OFFICIAL_BG = '#123832';
const USER_JOINABLE = ['open', 'upcoming', 'starting', 'filling', 'arming'] as const;

function isLiveStatus(status: string): boolean {
  return status === 'live' || status === 'in_progress';
}

function isClosedStatus(status: string): boolean {
  return (
    status === 'judging' ||
    status === 'settled' ||
    status === 'cancelled' ||
    status === 'cancelled_underfilled' ||
    status === 'distributing'
  );
}

export function shareEmbedJoinState(input: {
  challenge: ShareEmbedChallenge;
  joined?: boolean;
}): JoinState {
  if (input.joined) {
    return 'joined';
  }
  const status = String(input.challenge.status ?? '').toLowerCase();
  if (isLiveStatus(status) || isClosedStatus(status)) {
    return 'closed';
  }
  if (input.challenge.is_official) {
    return status === 'filling' || status === 'arming' ? 'joinable' : 'closed';
  }
  return (USER_JOINABLE as readonly string[]).includes(status) ? 'joinable' : 'closed';
}

export function shareEmbedStatusText(challenge: ShareEmbedChallenge, now = Date.now()): StatusText {
  const status = String(challenge.status ?? '').toLowerCase();
  if (isLiveStatus(status)) {
    return 'Live';
  }
  const start = challenge.starts_at ? new Date(challenge.starts_at) : null;
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now) {
    const wait = compactCountdown(start, new Date(now));
    if (wait !== 'now') {
      return `Starts in ${wait}`;
    }
  }
  return 'Open';
}

type ChallengeShareEmbedProps = {
  challenge: ShareEmbedChallenge;
  joined?: boolean;
  host?: ShareEmbedHost | null;
  onPress?: () => void;
};

export function ChallengeShareEmbed({
  challenge,
  joined: joinedProp,
  host,
  onPress,
}: ChallengeShareEmbedProps) {
  const official = Boolean(challenge.is_official);
  const { user } = useAuth();
  const mine = useMyChallengeProgress();
  const joined =
    joinedProp ??
    Boolean(user?.id && mine.data?.some((row) => row.challenge_id === challenge.id));
  const joinState = shareEmbedJoinState({ challenge, joined });
  const statusText = shareEmbedStatusText(challenge);
  const joinSheet = useJoinConfirm();
  const openTag = useOpenChallengeFromTag();
  const [joining, setJoining] = useState(false);
  const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const canJoin = joinState === 'joinable';
  const ctaLabel = canJoin ? (buyIn > 0 && bucks ? `Join ${formatCashCompact(buyIn)}` : 'Join') : 'View';
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const metaColor = official ? 'rgba(231,247,243,0.78)' : THEME.textMuted;
  const showHost = !official && Boolean(host);

  async function openDetail() {
    if (onPress) {
      onPress();
      return;
    }
    await openTag({
      challengeId: challenge.id,
      visibility: challenge.visibility,
      challenge_lane: challenge.challenge_lane,
      is_official: challenge.is_official,
      created_by: challenge.created_by,
      isParticipant: joined,
    });
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
      const full = await fetchChallengeById(challenge.id);
      joinSheet.open(full);
    } catch (error) {
      Alert.alert(getErrorMessage(error) || copy('geo.unavailable'));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Pressable
      onPress={() => void openDetail()}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      className="flex-row overflow-hidden"
      style={{
        height: HEIGHT,
        borderRadius: RADIUS,
        backgroundColor: official ? OFFICIAL_BG : THEME.surface,
        borderWidth: official ? 0 : 1,
        borderColor: THEME.border,
        ...(official ? null : themeShadow('card')),
      }}>
      {official ? (
        <View style={{ width: 4, backgroundColor: THEME.accentBright }} />
      ) : (
        <View style={{ width: 3, backgroundColor: THEME.accentSoft }} />
      )}
      <View className="min-w-0 flex-1 flex-row items-center" style={{ paddingLeft: 10, paddingRight: 8, gap: 8 }}>
        {official ? (
          <View
            className="items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: 'rgba(247,247,245,0.94)',
            }}>
            <BlobMascot variant="logo" size={26} />
          </View>
        ) : showHost && host ? (
          <Avatar uri={host.avatarUrl} name={host.name} size={30} />
        ) : null}
        <View className="min-w-0 flex-1">
          <AppText
            className="text-[15px] font-extrabold leading-5"
            style={{ color: titleColor }}
            numberOfLines={1}>
            {challenge.title}
          </AppText>
          <View className="mt-0.5 flex-row items-center" style={{ gap: 6 }}>
            <EntryMark challenge={challenge} color={metaColor} />
            <AppText style={{ color: metaColor }}>·</AppText>
            <AppText className="text-[12px] font-semibold" style={{ color: metaColor }} numberOfLines={1}>
              {statusText}
            </AppText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          disabled={joining}
          onPress={(event) => {
            event.stopPropagation();
            void onCta();
          }}
          style={{
            minHeight: 44,
            minWidth: 64,
            paddingHorizontal: 12,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canJoin ? THEME.accent : official ? 'rgba(255,255,255,0.12)' : THEME.surface,
            borderWidth: 1,
            borderColor: canJoin ? THEME.accent : official ? 'rgba(255,255,255,0.28)' : THEME.accent,
          }}>
          {canJoin && buyIn > 0 && !bucks ? (
            <View className="flex-row items-center" style={{ gap: 4 }}>
              <AppText className="text-[13px] font-extrabold" style={{ color: THEME.accentForeground }}>
                Join
              </AppText>
              <CurrencyMark currency={challenge.currency} size={14} />
              <AppText className="text-[13px] font-extrabold" style={{ color: THEME.accentForeground }}>
                {Number.isInteger(buyIn) ? String(buyIn) : buyIn.toFixed(2)}
              </AppText>
            </View>
          ) : (
            <AppText
              className="text-[13px] font-extrabold"
              style={{ color: canJoin ? THEME.accentForeground : official ? '#FFFFFF' : THEME.accent }}>
              {ctaLabel}
            </AppText>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

function EntryMark({ challenge, color }: { challenge: ShareEmbedChallenge; color: string }) {
  const amount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className="text-[12px] font-semibold" style={{ color }}>
        {formatCashCompact(amount)}
      </AppText>
    );
  }
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <CurrencyMark currency={challenge.currency} size={14} />
      <AppText className="text-[12px] font-semibold" style={{ color }}>
        {amount <= 0 ? '0' : Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}
      </AppText>
    </View>
  );
}
