import { useEffect, useState } from 'react';
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
import { armingCountdownLabel, officialContestantsNeeded } from '@/lib/officialSeries';
import { isJoinWindowOpen } from '@/lib/settlement';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown } from '@/utils/format';

export type InviteChallenge = {
  id: string;
  title: string;
  status: string;
  is_official?: boolean | null;
  buy_in_amount?: number | null;
  currency?: string | null;
  created_by?: string | null;
  starts_at?: string | null;
  series_id?: string | null;
  armed_at?: string | null;
  prize_pool?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  official_started_at?: string | null;
  start_rule?: string | null;
  visibility?: string | null;
  challenge_lane?: unknown;
};

export type InviteHost = {
  name: string;
  avatarUrl?: string | null;
};

type ChallengeInviteCardProps = {
  challenge: InviteChallenge;
  theme?: 'official' | 'user';
  context?: 'lobby' | 'feed';
  joined?: boolean;
  hosting?: boolean;
  host?: InviteHost | null;
  showStateTags?: boolean;
  onPress?: () => void;
};

const HEIGHT = 132;
const RADIUS = 16;
const OFFICIAL_BG = '#123832';

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

export function inviteCardStatus(challenge: InviteChallenge, nowMs = Date.now()): string {
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

export function inviteCardCanJoin(input: {
  challenge: InviteChallenge;
  joined?: boolean;
  hosting?: boolean;
}): boolean {
  if (input.joined || input.hosting) {
    return false;
  }
  return isJoinWindowOpen(input.challenge);
}

export function ChallengeInviteCard({
  challenge,
  theme,
  context = 'lobby',
  joined: joinedProp,
  hosting = false,
  host,
  showStateTags = false,
  onPress,
}: ChallengeInviteCardProps) {
  const official = theme === 'official' || (theme == null && Boolean(challenge.is_official));
  const { user } = useAuth();
  const mine = useMyChallengeProgress();
  const joined =
    joinedProp ??
    Boolean(user?.id && mine.data?.some((row) => row.challenge_id === challenge.id));
  const ticking =
    String(challenge.status) === 'arming' ||
    (challenge.starts_at != null && new Date(challenge.starts_at).getTime() > Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const joinSheet = useJoinConfirm();
  const openTag = useOpenChallengeFromTag();

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const status = inviteCardStatus(challenge, nowMs);
  const canJoin = inviteCardCanJoin({ challenge, joined, hosting });
  const cta = canJoin ? 'Join' : 'View';
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const muted = official ? 'rgba(231,247,243,0.72)' : THEME.textMuted;
  const stateTag =
    showStateTags && !official ? (joined ? 'You’re in' : hosting ? 'Hosting' : null) : null;
  const showHost = context === 'feed' && !official && Boolean(host);

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
      joinSheet.open(await fetchChallengeById(challenge.id));
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
      {official || showHost || stateTag ? (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {official ? <BlobMascot variant="logo" size={24} /> : null}
          {showHost && host ? <Avatar uri={host.avatarUrl} name={host.name} size={28} /> : null}
          {stateTag ? (
            <AppText
              className="text-[11px] font-extrabold"
              style={{ color: THEME.accent, flexShrink: 0 }}
              numberOfLines={1}>
              {stateTag}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View />
      )}

      <AppText
        className="text-[17px] font-semibold leading-5"
        style={{ color: titleColor }}
        numberOfLines={1}>
        {challenge.title}
      </AppText>

      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: 6 }}>
          <EntryMark challenge={challenge} color={titleColor} />
          <AppText style={{ color: muted }}>·</AppText>
          <AppText className="min-w-0 flex-1 text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
            {status}
          </AppText>
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

function EntryMark({ challenge, color }: { challenge: InviteChallenge; color: string }) {
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
