import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
  category?: string | null;
  challenge_type?: string | null;
};

export type InviteHost = {
  name: string;
  avatarUrl?: string | null;
};

export type InviteVisualTheme = 'movement' | 'ranked' | 'habits' | 'creative' | 'official';

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

const HEIGHT = 160;
const RADIUS = 16;
const PANEL_WIDTH = 82;
const OFFICIAL_BG = '#123832';

const THEME_WASH: Record<InviteVisualTheme, readonly [string, string]> = {
  movement: ['#2C9B89', '#9EE8DC'],
  ranked: ['#4C5A9E', '#A8B6E8'],
  habits: ['#8FA88A', '#F3EEE4'],
  creative: ['#C9B6E0', '#F5C9B8'],
  official: ['#16463E', '#0E2421'],
};

export function inviteVisualTheme(challenge: InviteChallenge): InviteVisualTheme {
  if (challenge.is_official) {
    return 'official';
  }
  const kind = String(challenge.challenge_type ?? '').toLowerCase();
  const category = String(challenge.category ?? '').toLowerCase();
  if (kind === 'points' || category === 'gaming') {
    return 'ranked';
  }
  if (category === 'creative') {
    return 'creative';
  }
  if (category === 'fitness' || category === 'sports') {
    return 'movement';
  }
  return 'habits';
}

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
  joined: joinedProp,
  hosting = false,
  host,
  showStateTags = false,
  onPress,
}: ChallengeInviteCardProps) {
  const official = theme === 'official' || (theme == null && Boolean(challenge.is_official));
  const visual = official ? 'official' : inviteVisualTheme(challenge);
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
  const stateTag = showStateTags ? (joined ? 'You’re in' : hosting ? 'Hosting' : null) : null;

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
      className="flex-row overflow-hidden"
      style={{
        height: HEIGHT,
        maxHeight: 168,
        borderRadius: RADIUS,
        backgroundColor: official ? OFFICIAL_BG : THEME.surface,
        borderWidth: official ? 0 : 1,
        borderColor: THEME.border,
        ...(official ? null : themeShadow('card')),
      }}>
      <ThemePanel theme={visual} />
      <View className="min-w-0 flex-1" style={{ paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'space-between' }}>
        <View className="flex-row items-start" style={{ gap: 8 }}>
          <AppText
            className="min-w-0 flex-1 text-[16px] font-semibold leading-5"
            style={{ color: titleColor }}
            numberOfLines={1}>
            {challenge.title}
          </AppText>
          {stateTag ? (
            <AppText
              className="text-[11px] font-extrabold"
              style={{ color: official ? '#9EE8DC' : THEME.accent, flexShrink: 0 }}
              numberOfLines={1}>
              {stateTag}
            </AppText>
          ) : null}
        </View>

        {official ? (
          <View className="flex-row items-center" style={{ gap: 6, minHeight: 22 }}>
            <AppText className="text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
              Sponsored by
            </AppText>
            <BlobMascot variant="logo" size={28} />
          </View>
        ) : host ? (
          <View className="flex-row items-center" style={{ gap: 6, minHeight: 22 }}>
            <Avatar uri={host.avatarUrl} name={host.name} size={20} />
            <AppText className="min-w-0 flex-1 text-[12px]" style={{ color: muted }} numberOfLines={1}>
              Hosted by{' '}
              <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
                {host.name}
              </AppText>
            </AppText>
          </View>
        ) : (
          <View style={{ minHeight: 22 }} />
        )}

        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: 5 }}>
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
      </View>
    </Pressable>
  );
}

function ThemePanel({ theme }: { theme: InviteVisualTheme }) {
  return (
    <LinearGradient
      colors={[...THEME_WASH[theme]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={{ width: PANEL_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none">
        {theme === 'movement' ? <MovementMotif /> : null}
        {theme === 'ranked' ? <RankedMotif /> : null}
        {theme === 'habits' ? <HabitsMotif /> : null}
        {theme === 'creative' ? <CreativeMotif /> : null}
        {theme === 'official' ? <OfficialMotif /> : null}
      </View>
    </LinearGradient>
  );
}

function MovementMotif() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.72)' }}>
      <View
        style={{
          position: 'absolute',
          right: 4,
          top: 10,
          width: 14,
          height: 14,
          borderTopWidth: 2.5,
          borderRightWidth: 2.5,
          borderColor: 'rgba(255,255,255,0.8)',
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

function RankedMotif() {
  return (
    <View className="flex-row items-end" style={{ height: 32, gap: 4 }}>
      <View style={{ width: 6, height: 12, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' }} />
      <View style={{ width: 6, height: 20, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.65)' }} />
      <View style={{ width: 6, height: 28, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.88)' }} />
    </View>
  );
}

function HabitsMotif() {
  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(47,72,44,0.35)' }} />
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(47,72,44,0.28)' }} />
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(47,72,44,0.35)' }} />
    </View>
  );
}

function CreativeMotif() {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderWidth: 2,
        borderColor: 'rgba(80,48,96,0.45)',
        transform: [{ rotate: '18deg' }],
      }}
    />
  );
}

function OfficialMotif() {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: 'rgba(158,232,220,0.22)',
      }}
    />
  );
}

function EntryMark({ challenge, color }: { challenge: InviteChallenge; color: string }) {
  const amount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className="text-[14px] font-extrabold" style={{ color }} numberOfLines={1}>
        {formatCashCompact(amount)}
      </AppText>
    );
  }
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <CurrencyMark currency={challenge.currency} size={15} />
      <AppText className="text-[14px] font-extrabold" style={{ color }} numberOfLines={1}>
        {amount <= 0 ? '0' : Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}
      </AppText>
    </View>
  );
}
