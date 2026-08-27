import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import {
  ChallengeTypeBadge,
  ChallengeTypePlaceholder,
  ChallengeTypeTip,
  useChallengeTypeTip,
} from '@/components/challenge/ChallengeTypeIcon';
import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { challengeCardTags } from '@/lib/challengeTags';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin } from '@/hooks/useChallengeCheckin';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { fetchChallengeById } from '@/lib/challenges';
import { firstRouteParam } from '@/lib/challengeLoad';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { openChallengeLobby, prefetchChallengeDetail, seedChallengeDetailQuery } from '@/lib/challengeOpen';
import { formatCashCompact, formatCashPrizeAmount, isBucksChallenge } from '@/lib/currency';
import { EntryFeeAmount } from '@/components/currency/EntryFeeAmount';
import { copy } from '@/lib/copy';
import { namedOfficialSponsor, officialSponsorName } from '@/lib/challengeSponsor';
import { isOfficialChallenge } from '@/lib/official';
import { armingCountdownLabel, officialContestantsNeeded, officialGuaranteeAmount } from '@/lib/officialSeries';
import { isClosedForLogs, isJoinWindowOpen } from '@/lib/settlement';
import { flexChildMin, THEME, themeShadow } from '@/lib/theme';
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
  timezone?: string | null;
  days_required?: number | null;
  day_windows?: unknown;
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
  frequency?: string | null;
  target_count?: number | null;
  length_value?: number | null;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
  cover_image_url?: string | null;
  sponsor_logo_url?: string | null;
  sponsor_name?: string | null;
  task?: string | null;
  tasks?: Array<{ title?: string | null }> | null;
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

const HEIGHT = 176;
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
    const guarantee = officialGuaranteeAmount(challenge);
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
  const [sponsorLogoFailed, setSponsorLogoFailed] = useState(false);
  const joinSheet = useJoinConfirm();
  const openTag = useOpenChallengeFromTag();
  const typeTip = useChallengeTypeTip();

  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const status = inviteCardStatus(challenge, nowMs);
  const canJoin = inviteCardCanJoin({ challenge, joined, hosting });
  const periodCheckin = usePeriodCheckin(
    section === 'active' && joined && !eliminated ? challenge.id : undefined,
    {
      is_official: challenge.is_official,
      series_id: challenge.series_id,
      status: challenge.status,
      starts_at: challenge.starts_at,
      timezone: challenge.timezone,
      days_required: challenge.days_required,
      day_windows: Array.isArray(challenge.day_windows) ? challenge.day_windows : null,
      frequency: challenge.frequency,
      target_count: challenge.target_count,
      length_value: challenge.length_value,
      challenge_type: challenge.challenge_type,
      scoring_method: challenge.scoring_method,
      comparable_points_config: challenge.comparable_points_config,
      scoring_config: challenge.scoring_config,
      category: challenge.category,
    },
  );
  const checkedIn =
    periodCheckin.data?.phase === 'submitted' || Boolean(periodCheckin.data?.submitted_at);
  const canCheckIn =
    section === 'active' &&
    inviteCardCanCheckIn({ challenge, joined, eliminated }) &&
    !checkedIn;
  const cta = canJoin ? 'Join' : 'View';
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const muted = official ? 'rgba(231,247,243,0.72)' : THEME.textMuted;
  const tags = challengeCardTags({ challenge, hosting, joined });
  const namedSponsor = namedOfficialSponsor(challenge);
  const sponsorName = namedSponsor || officialSponsorName(challenge) || 'blOb';
  const displayTitle = challengeDisplayTitle(challenge);
  const cardLabel = `${displayTitle}. ${status}. ${canCheckIn ? 'View or check-in' : cta}`;

  async function openDetail() {
    const challengeId = firstRouteParam(challenge.id);
    if (!challengeId) {
      return;
    }
    seedChallengeDetailQuery({ ...challenge, id: challengeId });
    prefetchChallengeDetail(challengeId, challenge);
    if (onPress) {
      onPress();
      return;
    }
    try {
      await openTag({
        challengeId,
        visibility: challenge.visibility,
        challenge_lane: challenge.challenge_lane,
        is_official: challenge.is_official,
        created_by: challenge.created_by,
        isParticipant: joined,
        snapshot: challenge,
      });
    } catch {
      openChallengeLobby(router, { id: challengeId, snapshot: challenge, returnTo: 'feed' });
    }
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
    <View
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
        <MediaPanel
          steps={mediaSteps}
          visual={visual}
          title={displayTitle}
          openLabel={cardLabel}
          category={challenge.category ?? undefined}
          typeTipOpen={typeTip.open}
          onOpen={() => void openDetail()}
          onTypePress={typeTip.show}
        />
      </View>
      <View
        className="flex-1"
        style={{
          paddingLeft: 10,
          paddingRight: 10,
          paddingVertical: 10,
          justifyContent: 'space-between',
          ...flexChildMin(),
        }}>
        <View>
          <ChallengeTagRow tags={tags} compact />
          <Pressable
            onPress={() => void openDetail()}
            accessibilityRole="button"
            accessibilityLabel={cardLabel}
            style={{ marginTop: 4, minWidth: 0 }}>
            <AppText
              className="text-[16px] font-semibold leading-5"
              style={{ color: titleColor, minWidth: 0 }}
              numberOfLines={2}>
              {challengeDisplayTitle(challenge)}
            </AppText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void openDetail()}
          accessibilityRole="button"
          accessibilityLabel={cardLabel}
          style={{ minHeight: 28, justifyContent: 'center' }}>
          {official ? (
            <View
              className="flex-row items-center"
              style={{ gap: 8, minHeight: 32 }}
              accessibilityLabel={`Sponsored by ${sponsorName}`}>
              <AppText className="text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
                Sponsored by
              </AppText>
              {namedSponsor ? (
                <AppText
                  className="min-w-0 flex-1 text-[12px] font-extrabold"
                  style={{ color: titleColor }}
                  numberOfLines={2}>
                  {namedSponsor}
                </AppText>
              ) : asHttpUrl(challenge.sponsor_logo_url) && !sponsorLogoFailed ? (
                <Image
                  source={{ uri: asHttpUrl(challenge.sponsor_logo_url) }}
                  style={{ width: 56, height: 28 }}
                  contentFit="contain"
                  accessibilityLabel={sponsorName}
                  onError={() => setSponsorLogoFailed(true)}
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
            <View className="flex-row items-start" style={[{ gap: 6, minHeight: 28 }, flexChildMin()]}>
              <Avatar uri={host.avatarUrl} name={host.name} size={20} />
              <View style={[flexChildMin(), { flexGrow: 1 }]}>
                <AppText
                  className="text-[12px] leading-4"
                  style={{ color: muted, minWidth: 0 }}
                  numberOfLines={2}>
                  Hosted by{' '}
                  <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
                    {host.name}
                  </AppText>
                </AppText>
              </View>
            </View>
          ) : (
            <View style={{ minHeight: 28 }} />
          )}
        </Pressable>

        <View style={{ gap: canCheckIn ? 6 : 0 }}>
          <View className="flex-row items-center" style={[{ gap: 8 }, flexChildMin()]}>
            <View className="flex-1 flex-row items-center" style={[{ gap: 5 }, flexChildMin()]}>
              <View style={{ flexShrink: 0 }}>
                <LobbyMoneyMark challenge={challenge} color={titleColor} />
              </View>
              <AppText style={{ color: muted, flexShrink: 0 }}>·</AppText>
              <AppText
                className="flex-1 text-[12px] font-semibold"
                style={{ color: muted, minWidth: 0, flexShrink: 1 }}
                numberOfLines={1}>
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
                label="Check In"
                accessibilityLabel="Check In"
                primary
                official={official}
                flex
                onPress={onCheckIn}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
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
  openLabel,
  category,
  typeTipOpen,
  onOpen,
  onTypePress,
}: {
  steps: InviteMedia[];
  visual: InviteVisualTheme;
  title: string;
  openLabel: string;
  category?: string | null;
  typeTipOpen: boolean;
  onOpen: () => void;
  onTypePress: () => void;
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

  const officialPanel = visual === 'official' || resolved.kind === 'bob';
  const showTypeBadge = officialPanel || resolved.kind === 'photo';

  return (
    <View
      style={{
        flex: 1,
        borderRadius: PANEL_RADIUS,
        overflow: 'hidden',
        backgroundColor: visual === 'official' ? THEME_WASH.official[0] : THEME_WASH[visual][0],
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openLabel}
        onPress={onOpen}
        style={{ flex: 1 }}>
        {resolved.kind === 'photo' ? (
          <View style={{ flex: 1 }} pointerEvents="none">
            <Image
              source={{ uri: resolved.uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              contentPosition="center"
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 }} pointerEvents="none">
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
        ) : officialPanel ? (
          <OfficialBobPanel onError={() => undefined} />
        ) : (
          <ChallengeTypePlaceholder category={category} />
        )}
      </Pressable>
      <ChallengeTypeBadge category={category} onPress={onTypePress} />
      <ChallengeTypeTip
        category={category}
        visible={typeTipOpen}
        anchor={showTypeBadge ? 'badge' : 'panel'}
      />
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

function lobbyCardShowsPrize(challenge: InviteChallenge, nowMs = Date.now()): boolean {
  const status = String(challenge.status ?? '');
  if (status === 'live' || status === 'in_progress') {
    return true;
  }
  if (status === 'judging' || status === 'settled' || status === 'distributing') {
    return true;
  }
  const start = challenge.starts_at ? new Date(challenge.starts_at).getTime() : NaN;
  if (!Number.isFinite(start) || start > nowMs) {
    return false;
  }
  return status !== 'cancelled' && status !== 'cancelled_underfilled';
}

function LobbyMoneyMark({ challenge, color }: { challenge: InviteChallenge; color: string }) {
  if (lobbyCardShowsPrize(challenge)) {
    const prize = Math.max(Number(challenge.prize_pool) || 0, 0);
    if (isBucksChallenge(challenge)) {
      return (
        <AppText className="text-[14px] font-extrabold" style={{ color }} numberOfLines={1}>
          {formatCashPrizeAmount(prize)}
        </AppText>
      );
    }
    return (
      <View className="flex-row items-center" style={{ gap: 4 }}>
        <CurrencyMark currency={challenge.currency} size={15} />
        <AppText className="text-[14px] font-extrabold" style={{ color }} numberOfLines={1}>
          {Number.isInteger(prize) ? String(prize) : prize.toFixed(2)}
        </AppText>
      </View>
    );
  }
  return <EntryMark challenge={challenge} color={color} />;
}

function EntryMark({ challenge, color }: { challenge: InviteChallenge; color: string }) {
  const amount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  if (amount <= 0) {
    return (
      <EntryFeeAmount
        amount={0}
        currency={challenge.currency}
        textClassName="text-[14px] font-extrabold"
        color={color}
      />
    );
  }
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
        {Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}
      </AppText>
    </View>
  );
}
