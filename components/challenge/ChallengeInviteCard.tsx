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
import { LobbyEntryPrizeRow } from '@/components/challenge/LobbyEntryPrizeRow';
import { ChallengeCardClock, ChallengeScheduleMeta } from '@/components/challenge/ChallengeScheduleMeta';
import { useInviteHost } from '@/components/challenge/InviteHost';
import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { challengeCardTags } from '@/lib/challengeTags';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin } from '@/hooks/useChallengeCheckin';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { fetchChallengeById } from '@/lib/challenges';
import { firstRouteParam } from '@/lib/challengeLoad';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { prefetchChallengeDetail, seedChallengeDetailQuery } from '@/lib/challengeOpen';
import { BODY_METRICS_HREF, challengeDetailHref, checkinSubmitHref } from '@/lib/routes';
import { OfficialSponsorLine } from '@/components/challenge/OfficialSponsorLine';
import { challengeScheduleState, scheduleNeedsTick } from '@/lib/lobbyChallenge';
import { copy } from '@/lib/copy';
import { isOfficialChallenge } from '@/lib/official';
import { armingCountdownLabel, officialContestantsNeeded, officialGuaranteeAmount } from '@/lib/officialSeries';
import { isClosedForLogs, isJoinWindowOpen } from '@/lib/settlement';
import { flexChildMin, THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown } from '@/utils/format';

const BOB_WAVE = require('@/assets/login/blob-login.png');

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
  settled_prize_pool?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  official_started_at?: string | null;
  start_rule?: string | null;
  start_mode?: string | null;
  start_within_value?: number | null;
  start_within_unit?: string | null;
  min_participants?: number | null;
  participant_count?: number | null;
  distributed_at?: string | null;
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
  organization_name?: string | null;
  organization?: string | null;
  task?: string | null;
  tasks?: Array<{ title?: string | null }> | null;
};

export type InviteHost = {
  name: string;
  avatarUrl?: string | null;
};

export type InviteVisualTheme = 'movement' | 'ranked' | 'habits' | 'creative' | 'official';
export type InviteSection = 'official' | 'active' | 'friends' | 'hosting' | 'ended';

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
  resultLine?: string | null;
  checkedInToday?: boolean;
  onPress?: () => void;
};

type InviteMedia =
  | { kind: 'photo'; uri: string; official: boolean }
  | { kind: 'sponsor'; uri: string; name: string }
  | { kind: 'bob' }
  | { kind: 'placeholder'; visual: InviteVisualTheme };

const PANEL_RADIUS = 12;
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
    status === 'ended' ||
    status === 'settling' ||
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
  const phase = challengeScheduleState(input.challenge).phase;
  if (phase === 'ended' || phase === 'settled') {
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
  context = 'lobby',
  section,
  joined: joinedProp,
  hosting = false,
  eliminated = false,
  host,
  resultLine,
  checkedInToday,
  onPress: _onPress,
}: ChallengeInviteCardProps) {
  const official =
    isOfficialChallenge(challenge) || theme === 'official' || section === 'official';
  const visual = official ? 'official' : inviteVisualTheme(challenge);
  const mediaSteps = resolveInviteMedia(challenge, official);
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const router = useRouter();
  const mine = useMyChallengeProgress();
  const joined =
    joinedProp ??
    Boolean(user?.id && mine.data?.some((row) => row.challenge_id === challenge.id));
  const ticking = scheduleNeedsTick(challenge);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const joinSheet = useJoinConfirm();
  const shareHost = useInviteHost();
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
  const checkinEnabled =
    joined && !eliminated && (context === 'lobby' || section === 'active');
  const periodCheckin = usePeriodCheckin(
    typeof checkedInToday === 'boolean' || !checkinEnabled ? undefined : challenge.id,
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
    typeof checkedInToday === 'boolean'
      ? checkedInToday
      : periodCheckin.data?.phase === 'submitted' || Boolean(periodCheckin.data?.submitted_at);
  const canCheckIn =
    checkinEnabled &&
    inviteCardCanCheckIn({ challenge, joined, eliminated }) &&
    !checkedIn;
  const tags = challengeCardTags({ challenge, hosting, joined });
  const displayTitle = challengeDisplayTitle(challenge);
  const cardLabel = `${displayTitle}. ${status}. ${canCheckIn ? 'View or check-in' : canJoin ? 'Join' : 'View'}`;

  async function openDetail() {
    const challengeId = firstRouteParam(challenge.id);
    if (!challengeId) {
      return;
    }
    seedChallengeDetailQuery({ ...challenge, id: challengeId });
    prefetchChallengeDetail(challengeId, challenge);
    router.push(
      challengeDetailHref(challengeId, context === 'feed' ? 'feed' : 'lobby', null, { tab: 'overview' }),
    );
  }

  async function onJoinOrView() {
    if (!canJoin) {
      await openDetail();
      return;
    }
    if (joining || joinSheet.loading) {
      return;
    }
    if (official && user && !hasCompletedBodyMetrics(profile)) {
      router.push(BODY_METRICS_HREF);
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
    const href = checkinSubmitHref(challenge.id);
    console.log('[blob:checkin]', { challengeId: challenge.id, href });
    router.push(href);
  }

  const hostLabel = host?.name?.trim() || 'Host';

  function onShare() {
    if (!shareHost) {
      return;
    }
    shareHost.open({
      challengeId: challenge.id,
      challengeTitle: displayTitle,
      allowSendToPeople: true,
      defaultAudience: 'public',
    });
  }

  return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cardLabel}
        onPress={() => void openDetail()}
        style={{
          borderRadius: 14,
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        <View style={{ height: 80, margin: 8, marginBottom: 0, borderRadius: 10, overflow: 'hidden' }}>
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
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 4, left: 4, right: 4 }}>
            <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ChallengeTagRow tags={tags} compact />
              </View>
              <ChallengeCardClock
                challenge={challenge}
                nowMs={nowMs}
                forceEnded={section === 'ended'}
                overlay
                light={official}
              />
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, gap: 4 }}>
          <AppText
            className="text-[13px] font-semibold"
            style={{ color: THEME.textPrimary }}
            numberOfLines={2}>
            {displayTitle}
          </AppText>
          <ChallengeScheduleMeta
            challenge={challenge}
            nowMs={nowMs}
            compact
            hideClock
            forceEnded={section === 'ended'}
          />
          {resultLine ? (
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }} numberOfLines={1}>
              {resultLine}
            </AppText>
          ) : null}
          {official ? (
            <OfficialSponsorLine
              challenge={challenge}
              muted={THEME.textMuted}
              titleColor={THEME.textPrimary}
              compact
            />
          ) : null}
          {host ? (
            <View className="flex-row items-center" style={{ gap: 6, minHeight: 18 }}>
              {host.avatarUrl ? <Avatar uri={host.avatarUrl} name={hostLabel} size={16} /> : null}
              <AppText className="text-[11px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
                {hostLabel}
              </AppText>
            </View>
          ) : null}
          <LobbyEntryPrizeRow challenge={challenge} color={THEME.textPrimary} compact />
        </View>
        <View
          className="flex-row items-center"
          style={{
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            backgroundColor: THEME.surface2,
            paddingHorizontal: 10,
            minHeight: 30,
            gap: 14,
          }}>
          <TextAction label="View" onPress={() => void openDetail()} />
          {canJoin ? <TextAction label="Join" loading={joining} onPress={() => void onJoinOrView()} /> : null}
          {canCheckIn ? <TextAction label="Check In" onPress={onCheckIn} /> : null}
          <TextAction label="Share" onPress={onShare} />
        </View>
      </Pressable>
    );
}

function TextAction({
  label,
  loading = false,
  onPress,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      disabled={loading}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={6}
      style={{ minHeight: 24, justifyContent: 'center' }}>
      {loading ? (
        <ActivityIndicator size="small" color={THEME.accent} />
      ) : (
        <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
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
  onOpen: _onOpen,
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
      <View
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={openLabel}
        style={{ flex: 1 }}>
        {resolved.kind === 'photo' ? (
          <View style={{ flex: 1 }} pointerEvents="none">
            <Image
              source={{ uri: resolved.uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
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
      </View>
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

export function LobbyChallengeRow({
  challenge,
  context = 'lobby',
  nowMs,
  resultLine,
  forceEnded = false,
  onPress: _onPress,
}: {
  challenge: InviteChallenge;
  context?: 'lobby' | 'feed';
  nowMs?: number;
  resultLine?: string | null;
  forceEnded?: boolean;
  onPress?: () => void;
}) {
  const router = useRouter();
  const displayTitle = challengeDisplayTitle(challenge);
  const clock = Date.now();
  const ticking = scheduleNeedsTick(challenge, clock);
  const [tickMs, setTickMs] = useState(clock);

  useEffect(() => {
    if (!ticking || nowMs != null) {
      return;
    }
    const timer = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [nowMs, ticking]);

  function openDetail() {
    const challengeId = firstRouteParam(challenge.id);
    if (!challengeId) {
      return;
    }
    seedChallengeDetailQuery({ ...challenge, id: challengeId });
    prefetchChallengeDetail(challengeId, challenge);
    router.push(
      challengeDetailHref(challengeId, context === 'feed' ? 'feed' : 'lobby', null, { tab: 'overview' }),
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle}. Open challenge`}
      onPress={openDetail}
      style={{
        borderRadius: 14,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 4,
        ...themeShadow('card'),
      }}>
      <View className="flex-row items-start" style={{ gap: 10 }}>
        <AppText
          className="text-[14px] font-semibold"
          style={[flexChildMin(), { flexGrow: 1, color: THEME.textPrimary }]}
          numberOfLines={2}>
          {displayTitle}
        </AppText>
        <ChallengeCardClock challenge={challenge} nowMs={nowMs ?? tickMs} forceEnded={forceEnded} overlay />
      </View>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View style={{ flexGrow: 1, minWidth: 0 }}>
          <ChallengeScheduleMeta
            challenge={challenge}
            nowMs={nowMs ?? tickMs}
            compact
            hideClock
            forceEnded={forceEnded}
          />
        </View>
      </View>
      <LobbyEntryPrizeRow challenge={challenge} color={THEME.textPrimary} compact />
      {resultLine ? (
        <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }} numberOfLines={1}>
          {resultLine}
        </AppText>
      ) : null}
    </Pressable>
  );
}
