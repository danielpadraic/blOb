import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { fetchChallengeById } from '@/lib/challenges';
import { formatCashCompact, isBucksChallenge } from '@/lib/currency';
import { copy } from '@/lib/copy';
import { isOfficialChallenge } from '@/lib/official';
import { armingCountdownLabel, officialContestantsNeeded } from '@/lib/officialSeries';
import { isClosedForLogs, isJoinWindowOpen } from '@/lib/settlement';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown } from '@/utils/format';

const BOB_WAVE = require('@/assets/login/blob-login.png');
const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');

export type InviteChallenge = {
  id: string;
  title: string;
  status: string;
  is_official?: boolean | null;
  buy_in_amount?: number | null;
  currency?: string | null;
  created_by?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
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
  cover_image_url?: string | null;
  /** Present only if a future sponsor column exists. Not queried today. */
  sponsor_logo_url?: string | null;
  sponsor_name?: string | null;
};

export type InviteHost = {
  name: string;
  avatarUrl?: string | null;
};

export type InviteVisualTheme = 'movement' | 'ranked' | 'habits' | 'creative' | 'official';
export type InviteSection = 'official' | 'active' | 'friends' | 'hosting';

type ChallengeInviteCardProps = {
  challenge: InviteChallenge;
  theme?: 'official' | 'user';
  context?: 'lobby' | 'feed';
  section?: InviteSection;
  joined?: boolean;
  hosting?: boolean;
  eliminated?: boolean;
  host?: InviteHost | null;
  showStateTags?: boolean;
  onPress?: () => void;
};

type InviteMedia =
  | { kind: 'photo'; uri: string; official: boolean }
  | { kind: 'sponsor'; uri: string; name: string }
  | { kind: 'bob' }
  | { kind: 'placeholder'; visual: InviteVisualTheme };

const HEIGHT = 162;
const RADIUS = 16;
const PANEL_RADIUS = 12;
const OFFICIAL_BG = '#123832';
const TINT: Record<InviteVisualTheme, string> = {
  movement: 'rgba(44,155,137,0.12)',
  ranked: 'rgba(76,90,158,0.12)',
  habits: 'rgba(143,168,138,0.10)',
  creative: 'rgba(201,182,224,0.12)',
  official: 'rgba(16,35,32,0.18)',
};

const THEME_WASH: Record<InviteVisualTheme, readonly [string, string]> = {
  movement: ['#2C9B89', '#9EE8DC'],
  ranked: ['#4C5A9E', '#A8B6E8'],
  habits: ['#8FA88A', '#F3EEE4'],
  creative: ['#C9B6E0', '#F5C9B8'],
  official: ['#16463E', '#0E2421'],
};

function asHttpUrl(value?: string | null): string {
  const url = value?.trim() ?? '';
  if (!url) {
    return '';
  }
  const lower = url.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return url;
  }
  return '';
}

export function inviteVisualTheme(challenge: InviteChallenge): InviteVisualTheme {
  if (isOfficialChallenge(challenge)) {
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

export function resolveInviteMedia(challenge: InviteChallenge, official: boolean): InviteMedia[] {
  const cover = asHttpUrl(challenge.cover_image_url);
  const sponsor = asHttpUrl(challenge.sponsor_logo_url);
  const sponsorName = challenge.sponsor_name?.trim() || 'Sponsor';
  const steps: InviteMedia[] = [];
  if (cover) {
    steps.push({ kind: 'photo', uri: cover, official });
  }
  if (official && sponsor) {
    steps.push({ kind: 'sponsor', uri: sponsor, name: sponsorName });
  }
  if (official) {
    steps.push({ kind: 'bob' });
  } else if (!cover) {
    steps.push({ kind: 'placeholder', visual: inviteVisualTheme(challenge) });
  } else {
    steps.push({ kind: 'placeholder', visual: inviteVisualTheme({ ...challenge, is_official: false }) });
  }
  return steps;
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
      return `Filling · ${needed} more`;
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

export function inviteCardCanCheckIn(input: {
  challenge: InviteChallenge;
  joined?: boolean;
  eliminated?: boolean;
}): boolean {
  if (!input.joined) {
    return false;
  }
  return !isClosedForLogs({
    status: input.challenge.status,
    ends_at: input.challenge.ends_at,
    is_unlimited: input.challenge.is_unlimited,
    eliminated: input.eliminated,
  });
}

export function ChallengeInviteCard({
  challenge,
  theme,
  section,
  joined: joinedProp,
  hosting = false,
  eliminated = false,
  host,
  showStateTags = false,
  onPress,
}: ChallengeInviteCardProps) {
  const official =
    isOfficialChallenge(challenge) || theme === 'official' || section === 'official';
  const visual = official ? 'official' : inviteVisualTheme(challenge);
  const mediaSteps = resolveInviteMedia(challenge, official);
  const { user } = useAuth();
  const router = useRouter();
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
  const canCheckIn = section === 'active' && inviteCardCanCheckIn({ challenge, joined, eliminated });
  const cta = canJoin ? 'Join' : 'View';
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const muted = official ? 'rgba(231,247,243,0.72)' : THEME.textMuted;
  const stateTag =
    showStateTags && !canCheckIn ? (joined ? 'You’re in' : hosting ? 'Hosting' : null) : null;
  const sponsorName = challenge.sponsor_name?.trim() || 'blOb';
  const cardLabel = `${challenge.title}. ${status}. ${canCheckIn ? 'View or check-in' : cta}`;

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

  async function onJoinOrView() {
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

  function onCheckIn() {
    router.push(`/challenges/${challenge.id}/submit`);
  }

  return (
    <Pressable
      onPress={() => void openDetail()}
      accessibilityRole="button"
      accessibilityLabel={cardLabel}
      className="flex-row overflow-hidden"
      style={{
        height: HEIGHT,
        maxHeight: 180,
        borderRadius: RADIUS,
        backgroundColor: official ? OFFICIAL_BG : THEME.surface,
        borderWidth: official ? 0 : 1,
        borderColor: THEME.border,
        ...(official ? null : themeShadow('card')),
      }}>
      <View style={{ width: '38%', paddingVertical: 8, paddingLeft: 8 }}>
        <MediaPanel steps={mediaSteps} visual={visual} title={challenge.title} />
      </View>
      <View
        className="min-w-0 flex-1"
        style={{ paddingLeft: 10, paddingRight: 10, paddingVertical: 10, justifyContent: 'space-between' }}>
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
          <View
            className="flex-row items-center"
            style={{ gap: 8, minHeight: 32 }}
            accessibilityLabel={`Sponsored by ${sponsorName}`}>
            <AppText className="text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
              Sponsored by
            </AppText>
            {asHttpUrl(challenge.sponsor_logo_url) ? (
              <Image
                source={{ uri: asHttpUrl(challenge.sponsor_logo_url) }}
                style={{ width: 56, height: 28 }}
                contentFit="contain"
                accessibilityLabel={sponsorName}
              />
            ) : (
              <Image
                source={BLOB_WORDMARK}
                style={{ width: 64, height: 26, backgroundColor: 'transparent' }}
                contentFit="contain"
                tintColor="#F7FFFC"
                accessibilityLabel="blOb"
              />
            )}
          </View>
        ) : host ? (
          <View className="flex-row items-center" style={{ gap: 6, minHeight: 28 }}>
            <Avatar uri={host.avatarUrl} name={host.name} size={20} />
            <AppText className="min-w-0 flex-1 text-[12px]" style={{ color: muted }} numberOfLines={1}>
              Hosted by{' '}
              <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
                {host.name}
              </AppText>
            </AppText>
          </View>
        ) : (
          <View style={{ minHeight: 28 }} />
        )}

        <View style={{ gap: canCheckIn ? 6 : 0 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: 5 }}>
              <EntryMark challenge={challenge} color={titleColor} />
              <AppText style={{ color: muted }}>·</AppText>
              <AppText className="min-w-0 flex-1 text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
                {status}
              </AppText>
            </View>
            {canCheckIn ? null : (
              <ActionButton
                label={cta}
                accessibilityLabel={cta}
                primary={canJoin}
                official={official}
                loading={joining}
                onPress={() => void onJoinOrView()}
              />
            )}
          </View>
          {canCheckIn ? (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <ActionButton
                label="View"
                accessibilityLabel="View"
                primary={false}
                official={official}
                flex
                onPress={() => void openDetail()}
              />
              <ActionButton
                label="Check-In"
                accessibilityLabel="Check-In"
                primary
                official={official}
                flex
                onPress={onCheckIn}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ActionButton({
  label,
  accessibilityLabel,
  primary,
  official,
  loading = false,
  flex = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  primary: boolean;
  official: boolean;
  loading?: boolean;
  flex?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: loading }}
      disabled={loading}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        minHeight: 44,
        minWidth: flex ? 0 : 72,
        flex: flex ? 1 : undefined,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: primary ? THEME.accent : official ? 'rgba(255,255,255,0.12)' : THEME.surface,
        borderWidth: 1,
        borderColor: primary ? THEME.accent : official ? 'rgba(255,255,255,0.28)' : THEME.accent,
      }}>
      {loading ? (
        <ActivityIndicator color={primary ? THEME.accentForeground : official ? '#FFFFFF' : THEME.accent} />
      ) : (
        <AppText
          className="text-[14px] font-extrabold"
          style={{ color: primary ? THEME.accentForeground : official ? '#FFFFFF' : THEME.accent }}
          numberOfLines={1}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

function MediaPanel({
  steps,
  visual,
  title,
}: {
  steps: InviteMedia[];
  visual: InviteVisualTheme;
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const key = steps.map((step) => (step.kind === 'photo' || step.kind === 'sponsor' ? step.uri : step.kind)).join('|');

  useEffect(() => {
    setIndex(0);
  }, [key]);

  const resolved = steps[Math.min(index, Math.max(steps.length - 1, 0))] ?? {
    kind: 'placeholder' as const,
    visual,
  };

  function failThrough() {
    setIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)));
  }

  return (
    <View
      style={{
        flex: 1,
        borderRadius: PANEL_RADIUS,
        overflow: 'hidden',
        backgroundColor: visual === 'official' ? THEME_WASH.official[0] : THEME_WASH[visual][0],
      }}>
      {resolved.kind === 'photo' ? (
        <View style={{ flex: 1 }}>
          <Image
            source={{ uri: resolved.uri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={failThrough}
            accessibilityLabel={`${title} cover`}
          />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: TINT[visual] }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={
              resolved.official
                ? ['rgba(12,28,26,0.08)', 'rgba(12,28,26,0.28)']
                : ['rgba(255,255,255,0.04)', 'rgba(16,19,18,0.16)']
            }
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        </View>
      ) : resolved.kind === 'sponsor' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          <Image
            source={{ uri: resolved.uri }}
            style={{ width: '86%', height: '70%' }}
            contentFit="contain"
            onError={failThrough}
            accessibilityLabel={resolved.name}
          />
        </View>
      ) : resolved.kind === 'bob' ? (
        <OfficialBobPanel onError={failThrough} />
      ) : (
        <ThemePlaceholder visual={resolved.visual === 'official' ? 'movement' : resolved.visual} />
      )}
    </View>
  );
}

function OfficialBobPanel({ onError }: { onError: () => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const side = Math.round(Math.min(box.w, box.h) * 0.8);

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
      accessibilityLabel="Bob">
      <Image
        source={BOB_WAVE}
        style={{
          width: side > 0 ? side : '80%',
          height: side > 0 ? side : '80%',
          backgroundColor: 'transparent',
        }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey="bob-3d-wave"
        transition={0}
        onError={onError}
      />
    </View>
  );
}

function ThemePlaceholder({ visual }: { visual: InviteVisualTheme }) {
  return (
    <LinearGradient
      colors={[...THEME_WASH[visual]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.35, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none">
        {visual === 'movement' ? <MovementMotif /> : null}
        {visual === 'ranked' ? <RankedMotif /> : null}
        {visual === 'habits' ? <HabitsMotif /> : null}
        {visual === 'creative' ? <CreativeMotif /> : null}
      </View>
    </LinearGradient>
  );
}

function MovementMotif() {
  return (
    <View style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          borderWidth: 2.5,
          borderColor: 'rgba(255,255,255,0.7)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 6,
          top: 18,
          width: 16,
          height: 16,
          borderTopWidth: 2.5,
          borderRightWidth: 2.5,
          borderColor: 'rgba(255,255,255,0.86)',
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

function RankedMotif() {
  return (
    <View className="flex-row items-end" style={{ height: 42, gap: 5 }}>
      <View style={{ width: 8, height: 16, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.42)' }} />
      <View style={{ width: 8, height: 26, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.64)' }} />
      <View style={{ width: 8, height: 38, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.88)' }} />
    </View>
  );
}

function HabitsMotif() {
  return (
    <View className="items-center" style={{ gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(47,72,44,0.28)' }} />
      <View className="flex-row" style={{ gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(47,72,44,0.34)' }} />
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(47,72,44,0.34)' }} />
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(47,72,44,0.34)' }} />
      </View>
    </View>
  );
}

function CreativeMotif() {
  return (
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderWidth: 2,
          borderColor: 'rgba(80,48,96,0.42)',
          transform: [{ rotate: '18deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 22,
          height: 2,
          backgroundColor: 'rgba(80,48,96,0.28)',
          transform: [{ rotate: '-22deg' }],
        }}
      />
    </View>
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
