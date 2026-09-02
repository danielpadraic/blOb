import { ActivityIndicator, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import {
  ChallengeTypeTip,
  useChallengeTypeTip,
} from '@/components/challenge/ChallengeTypeIcon';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { EntryFeeAmount } from '@/components/currency/EntryFeeAmount';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { namedOfficialSponsor, officialSponsorName } from '@/lib/challengeSponsor';
import { displayChallengePot } from '@/lib/challengePot';
import {
  challengeTypeIconKey,
  challengeTypeIconLabel,
  challengeTypeIconSource,
  challengeTypeIconTint,
} from '@/lib/challengeTypeIcon';
import { type ChallengeTagSpec } from '@/lib/challengeTags';
import { copy } from '@/lib/copy';
import { formatCashPrizeAmount, isBucksChallenge } from '@/lib/currency';
import {
  challengeScheduleState,
  lobbyCardClock,
  lobbyListPrimaryAction,
  type ScheduleChallenge,
} from '@/lib/lobbyChallenge';
import { THEME, themeShadow } from '@/lib/theme';

const BOB_WAVE = require('@/assets/login/blob-login.png');

const HERO_H = 100;
const CARD_RADIUS = THEME.radius;
const CHIP = 22;

export type LobbyListCardHost = {
  name: string;
  avatarUrl?: string | null;
};

type LobbyListCardViewProps = {
  challenge: ScheduleChallenge & {
    id: string;
    buy_in_amount?: number | null;
    currency?: string | null;
    prize_pool?: number | null;
    settled_prize_pool?: number | null;
    host_budget?: number | null;
    creator_contribution?: number | null;
    status?: string | null;
    sponsor_name?: string | null;
    organization_name?: string | null;
    organization?: string | null;
    is_official?: boolean | null;
    is_callout?: boolean | null;
    cover_image_url?: string | null;
    category?: string | null;
  };
  official: boolean;
  displayTitle: string;
  cardLabel: string;
  tags: ChallengeTagSpec[];
  coverUri: string;
  nowMs: number;
  forceEnded?: boolean;
  resultLine?: string | null;
  host?: LobbyListCardHost | null;
  canJoin: boolean;
  canCheckIn: boolean;
  joining: boolean;
  status: string;
  onOpenDetail: () => void;
  onJoin: () => void;
  onCheckIn: () => void;
  onShare: () => void;
};

function asHttpUrl(value?: string | null): string {
  const url = value?.trim() ?? '';
  const lower = url.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return url;
  }
  return '';
}

export function LobbyListCardView({
  challenge,
  official,
  displayTitle,
  cardLabel,
  tags,
  coverUri,
  nowMs,
  forceEnded = false,
  resultLine,
  host,
  canJoin,
  canCheckIn,
  joining,
  status,
  onOpenDetail,
  onJoin,
  onCheckIn,
  onShare,
}: LobbyListCardViewProps) {
  const typeTip = useChallengeTypeTip();
  const hasCover = Boolean(coverUri);
  const callout = Boolean(challenge.is_callout);
  const darkHero = official || hasCover;
  const ink = official ? THEME.primaryForeground : THEME.textPrimary;
  const muted = official ? 'rgba(255,255,255,0.72)' : THEME.textMuted;
  const body = official ? THEME.primary : THEME.surface;
  const hairline = official ? 'rgba(255,255,255,0.10)' : THEME.border;
  const clock = lobbyCardClock(challenge, nowMs, forceEnded);
  const schedule = forceEnded
    ? { chip: null as string | null, gate: null as string | null }
    : challengeScheduleState(challenge, nowMs);
  const primary = lobbyListPrimaryAction({ canCheckIn, canJoin, status });
  const hostLabel = host?.name?.trim() || (official ? 'Bob' : 'Host');
  const wash = official ? THEME.primary : callout ? THEME.callout : challengeTypeIconTint(challenge.category);

  function runPrimary() {
    if (primary.kind === 'checkin') {
      onCheckIn();
      return;
    }
    if (primary.kind === 'join') {
      onJoin();
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel}
      onPress={onOpenDetail}
      style={{
        borderRadius: CARD_RADIUS,
        backgroundColor: body,
        borderWidth: 1,
        borderColor: official ? 'rgba(255,255,255,0.08)' : callout ? THEME.callout : THEME.border,
        overflow: 'hidden',
        ...themeShadow('card'),
      }}>
      <View style={{ height: HERO_H, overflow: 'hidden', backgroundColor: wash }}>
        {official ? (
          <OfficialHeroArt coverUri={coverUri} title={displayTitle} />
        ) : hasCover ? (
          <View style={{ flex: 1 }} pointerEvents="none">
            <Image
              source={{ uri: coverUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              contentPosition="center"
              cachePolicy="memory-disk"
              accessibilityLabel={`${displayTitle} cover`}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(16,19,18,0.08)', 'rgba(16,19,18,0.58)']}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
          </View>
        ) : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 4,
              top: 10,
              bottom: 4,
              width: '42%',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}>
            <Image
              source={challengeTypeIconSource(challenge.category)}
              style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
              contentFit="contain"
              recyclingKey={challengeTypeIconKey(challenge.category)}
            />
          </View>
        )}

        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            bottom: 8,
          }}>
          <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ChallengeTagRow
                tags={tags}
                compact
                chip
                tone={darkHero ? 'dark' : 'light'}
                trailing={
                  <TypeChip
                    category={challenge.category}
                    tone={darkHero ? 'dark' : 'light'}
                    onPress={typeTip.show}
                  />
                }
              />
            </View>
            {clock ? (
              <View
                style={{
                  flexGrow: 0,
                  flexShrink: 0,
                  maxWidth: 148,
                  backgroundColor: darkHero ? 'rgba(16, 19, 18, 0.46)' : THEME.surface,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}>
                <AppText
                  style={{
                    color: clock.urgent ? THEME.danger : darkHero ? THEME.primaryForeground : THEME.textPrimary,
                    fontSize: 10,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                  }}
                  numberOfLines={1}>
                  {clock.line}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText
            className="text-[16px] font-extrabold"
            style={{
              position: 'absolute',
              left: 0,
              right: official ? '40%' : 8,
              bottom: 0,
              color: darkHero ? THEME.primaryForeground : THEME.textPrimary,
              textShadowColor: darkHero ? 'rgba(0,0,0,0.35)' : 'transparent',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: darkHero ? 4 : 0,
            }}
            numberOfLines={1}>
            {displayTitle}
          </AppText>
        </View>
        <ChallengeTypeTip
          category={challenge.category}
          visible={typeTip.open}
          anchor="badge"
        />
      </View>

      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
        {official ? (
          <View
            className="flex-row items-center"
            style={{ gap: 8, minHeight: 22, flexWrap: 'wrap' }}>
            <View className="flex-row items-center" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 8 }}>
              {schedule.chip ? (
                <View
                  className="flex-row items-center"
                  style={{
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    gap: 4,
                    flexShrink: 1,
                  }}>
                  <Glyph name={GLYPH.clock} color={THEME.accent} size={11} />
                  <AppText
                    className="text-[11px] font-semibold"
                    style={{ color: THEME.accent, fontVariant: ['tabular-nums'] }}
                    numberOfLines={1}>
                    {schedule.chip}
                  </AppText>
                </View>
              ) : null}
              {schedule.gate ? (
                <View className="flex-row items-center" style={{ gap: 4, flexShrink: 1, minWidth: 0 }}>
                  <Glyph name={GLYPH.people} color={muted} size={12} />
                  <AppText className="text-[11px]" style={{ color: muted }} numberOfLines={1}>
                    {schedule.gate}
                  </AppText>
                </View>
              ) : null}
            </View>
            <OfficialHostBlock challenge={challenge} hostLabel={hostLabel} host={host} />
          </View>
        ) : null}

        {official ? (
          <MoneyColumns challenge={challenge} official split />
        ) : (
          <View className="flex-row items-center" style={{ gap: 8, minHeight: 28 }}>
            {host ? (
              <View className="flex-row items-center" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                <HostAvatar uri={host.avatarUrl} name={hostLabel} />
                <AppText
                  className="text-[13px] font-extrabold"
                  style={{ color: ink, flexShrink: 1 }}
                  numberOfLines={1}>
                  {hostLabel}
                </AppText>
              </View>
            ) : (
              <View style={{ flex: 1, minWidth: 0 }} />
            )}
            <MoneyColumns challenge={challenge} official={false} />
          </View>
        )}

        {resultLine ? (
          <AppText className="text-[12px] font-semibold" style={{ color: muted }} numberOfLines={1}>
            {resultLine}
          </AppText>
        ) : null}
      </View>

      <View
        className="flex-row items-center"
        style={{
          borderTopWidth: 1,
          borderTopColor: hairline,
          backgroundColor: official ? 'rgba(255,255,255,0.04)' : THEME.surface2,
          paddingHorizontal: 10,
          paddingVertical: 8,
          minHeight: 44,
          gap: 10,
        }}>
        <TextAction label="View" official={official} onPress={onOpenDetail} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <PrimaryPill
            label={primary.label}
            official={official}
            enabled={primary.kind !== 'disabled'}
            loading={joining && primary.kind === 'join'}
            onPress={runPrimary}
          />
        </View>
        <TextAction label="Share" official={official} onPress={onShare} />
      </View>
    </Pressable>
  );
}

function OfficialHeroArt({ coverUri, title }: { coverUri: string; title: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <View
        style={{
          position: 'absolute',
          left: -28,
          top: 22,
          width: '78%',
          height: 36,
          borderTopWidth: 1,
          borderColor: 'rgba(44,155,137,0.14)',
          borderRadius: 80,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: -12,
          top: 44,
          width: '64%',
          height: 32,
          borderTopWidth: 1,
          borderColor: 'rgba(44,155,137,0.08)',
          borderRadius: 80,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: -18,
          top: -16,
          width: 168,
          height: 168,
          borderRadius: 84,
          overflow: 'hidden',
        }}>
        <LinearGradient
          colors={['rgba(44,155,137,0.38)', 'rgba(44,155,137,0.10)', 'transparent']}
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1 }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          right: 4,
          top: 4,
          bottom: 8,
          width: '42%',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Image
          source={coverUri ? { uri: coverUri } : BOB_WAVE}
          style={{ width: '92%', height: '92%', backgroundColor: 'transparent' }}
          contentFit="contain"
          contentPosition="center"
          cachePolicy="memory-disk"
          recyclingKey={coverUri || 'bob-official-lobby'}
          accessibilityLabel={coverUri ? `${title} cover` : 'Bob'}
        />
      </View>
    </View>
  );
}

function TypeChip({
  category,
  tone,
  onPress,
}: {
  category?: string | null;
  tone: 'light' | 'dark';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={challengeTypeIconLabel(category)}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        width: CHIP,
        height: CHIP,
        borderRadius: 8,
        backgroundColor: tone === 'dark' ? 'rgba(16, 19, 18, 0.46)' : THEME.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Image
        source={challengeTypeIconSource(category)}
        style={{ width: 16, height: 16, backgroundColor: 'transparent' }}
        contentFit="contain"
        recyclingKey={challengeTypeIconKey(category)}
      />
    </Pressable>
  );
}

function HostAvatar({ uri, name }: { uri?: string | null; name: string }) {
  if (asHttpUrl(uri)) {
    return <Avatar uri={uri} name={name} size={28} />;
  }
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: THEME.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={name}>
      <Glyph name={GLYPH.person} color={THEME.accent} size={16} />
    </View>
  );
}

function OfficialHostBlock({
  challenge,
  hostLabel,
  host,
}: {
  challenge: {
    sponsor_name?: string | null;
    organization_name?: string | null;
    organization?: string | null;
    is_official?: boolean | null;
  };
  hostLabel: string;
  host?: LobbyListCardHost | null;
}) {
  const named = namedOfficialSponsor(challenge);
  const sponsor = officialSponsorName(challenge);
  return (
    <View className="flex-row items-center" style={{ gap: 6, flexShrink: 1, minWidth: 0 }}>
      {sponsor ? (
        <View
          className="flex-row items-center"
          style={{ gap: 6, flexShrink: 1, minWidth: 0 }}
          accessibilityLabel={`Sponsored by ${sponsor}`}>
          <AppText className="text-[11px]" style={{ color: 'rgba(255,255,255,0.72)' }} numberOfLines={1}>
            Sponsored by
          </AppText>
          {named ? (
            <AppText
              className="text-[12px] font-extrabold"
              style={{ color: THEME.primaryForeground, flexShrink: 1 }}
              numberOfLines={1}>
              {named}
            </AppText>
          ) : (
            <BlobMascot variant="logo" size={36} />
          )}
        </View>
      ) : null}
      <View style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.16)' }} />
      {asHttpUrl(host?.avatarUrl) ? (
        <Avatar uri={host?.avatarUrl} name={hostLabel} size={22} />
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Image
            source={BOB_WAVE}
            style={{ width: 20, height: 20, backgroundColor: 'transparent' }}
            contentFit="contain"
            accessibilityLabel={hostLabel}
          />
        </View>
      )}
      <AppText
        className="text-[12px] font-semibold"
        style={{ color: THEME.primaryForeground, flexShrink: 1 }}
        numberOfLines={1}>
        {hostLabel}
      </AppText>
    </View>
  );
}

function MoneyColumns({
  challenge,
  official,
  split = false,
}: {
  challenge: {
    buy_in_amount?: number | null;
    currency?: string | null;
    prize_pool?: number | null;
    settled_prize_pool?: number | null;
    host_budget?: number | null;
    creator_contribution?: number | null;
    status?: string | null;
  };
  official: boolean;
  split?: boolean;
}) {
  const label = official ? 'rgba(255,255,255,0.62)' : THEME.textMuted;
  const value = official ? THEME.primaryForeground : THEME.textPrimary;
  const prize = displayChallengePot(challenge);
  const col = split ? { flex: 1, minWidth: 0 } : { minWidth: 56 };
  const amountClass = official ? 'text-[16px] font-extrabold' : 'text-[14px] font-extrabold';
  return (
    <View
      className="flex-row items-center"
      style={{
        gap: split ? 0 : 10,
        flexShrink: split ? 1 : 0,
        width: split ? '100%' : undefined,
        backgroundColor: official && split ? 'rgba(0,0,0,0.28)' : undefined,
        borderWidth: official && split ? 1 : 0,
        borderColor: official && split ? 'rgba(255,255,255,0.08)' : undefined,
        borderRadius: official && split ? 12 : 0,
        paddingHorizontal: official && split ? 10 : 0,
        paddingVertical: official && split ? 8 : 0,
      }}>
      <View style={[col, split ? { alignItems: 'center' } : null]}>
        <AppText className="text-[10px]" style={{ color: label }} numberOfLines={1}>
          {copy('create.buyIn')}
        </AppText>
        <EntryFeeAmount
          amount={challenge.buy_in_amount}
          currency={challenge.currency}
          textClassName={amountClass}
          color={value}
          size={14}
          labeled
        />
      </View>
      <View style={{ width: 1, height: 28, backgroundColor: official ? 'rgba(255,255,255,0.14)' : THEME.border }} />
      <View style={[col, split ? { alignItems: 'center', paddingLeft: 12 } : null]}>
        <AppText className="text-[10px]" style={{ color: label }} numberOfLines={1}>
          {copy('board.pot')}
        </AppText>
        {isBucksChallenge(challenge) ? (
          <AppText className={amountClass} style={{ color: value }} numberOfLines={1}>
            {formatCashPrizeAmount(prize)}
          </AppText>
        ) : (
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <CurrencyMark currency={challenge.currency} size={14} />
            <AppText className={amountClass} style={{ color: value }} numberOfLines={1}>
              {String(Math.round(prize))}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

function TextAction({
  label,
  official,
  onPress,
}: {
  label: string;
  official: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={8}
      style={{ minWidth: 44, minHeight: 28, justifyContent: 'center' }}>
      <AppText className="text-[13px] font-extrabold" style={{ color: THEME.accent }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PrimaryPill({
  label,
  official,
  enabled,
  loading,
  onPress,
}: {
  label: string;
  official: boolean;
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const fill = THEME.accent;
  const text = THEME.primaryForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled, busy: loading }}
      disabled={!enabled || loading}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        minHeight: 32,
        minWidth: 108,
        maxWidth: 168,
        width: '100%',
        borderRadius: 999,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: enabled ? fill : official ? 'rgba(255,255,255,0.12)' : THEME.border,
      }}>
      {loading ? (
        <ActivityIndicator size="small" color={text} />
      ) : (
        <AppText
          className="text-[13px] font-extrabold"
          style={{ color: enabled ? text : official ? 'rgba(255,255,255,0.55)' : THEME.textMuted }}
          numberOfLines={1}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
