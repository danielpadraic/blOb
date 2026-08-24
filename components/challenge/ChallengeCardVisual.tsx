import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { OfficialSponsorLine } from '@/components/challenge/OfficialSponsorLine';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { officialFitnessProofIcons } from '@/components/challenge/ProofRequirementIcons';
import { CashPrizeAmount } from '@/components/currency/CashPrizeAmount';
import { EntryFeeAmount } from '@/components/currency/EntryFeeAmount';
import { BuckUsdAmount } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { parseChallengeProofs } from '@/lib/challengeProofs';
import { challengeDurationDays, challengeGoalLabel, challengeGoalSubtitle } from '@/lib/challengeGoal';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { challengeCardTags } from '@/lib/challengeTags';
import { isPointsChallenge } from '@/lib/challenges';
import { isOfficialJoinable, isOfficialSeriesChallenge, officialContestantsNeeded, officialGuaranteeAmount, officialStartNeededLabel, armingCountdownLabel } from '@/lib/officialSeries';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { compactCountsFromStats } from '@/lib/board';
import { lobbyDiscoverTimeLabel, lobbyTimeLabel } from '@/utils/format';

export type CardHost = {
  id?: string;
  name: string;
  avatarUrl?: string | null;
};

type ChallengeCardVisualProps = {
  challenge: ChallengeWithStats;
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
  myDays?: number | null;
  host?: CardHost | null;
  nowMs: number;
  onPress?: () => void;
  primaryLabel?: string | null;
  onPrimary?: () => void;
  showOfficialShare?: boolean;
  compact?: boolean;
};

const RADIUS = 22;
const OFFICIAL_COLORS = ['#1B5A50', '#123832', '#0E2421'] as const;

type ProofChip = { key: string; label: string; glyph: GlyphId };

function proofChips(challenge: ChallengeWithStats): ProofChip[] {
  const flags = officialFitnessProofIcons(challenge);
  const chips: ProofChip[] = [];
  if (flags.camera) {
    chips.push({ key: 'photo', label: 'Photo', glyph: GLYPH.camera });
  }
  if (flags.heart) {
    chips.push({ key: 'activity', label: 'Activity', glyph: GLYPH.heartbeat });
  }
  for (const proof of parseChallengeProofs(challenge.proofs)) {
    if (proof.method === 'video' && !chips.some((chip) => chip.key === 'video')) {
      chips.push({ key: 'video', label: 'Video', glyph: GLYPH.video });
    }
    if (proof.method === 'honor' && !chips.some((chip) => chip.key === 'honor')) {
      chips.push({ key: 'honor', label: 'Honor', glyph: GLYPH.check });
    }
    if (proof.method === 'checkin' && !chips.some((chip) => chip.key === 'checkin')) {
      chips.push({ key: 'checkin', label: 'Check-in', glyph: GLYPH.strong });
    }
  }
  return chips;
}

function startStripCopy(
  challenge: ChallengeWithStats,
  nowMs: number,
  official: boolean,
): { kicker: string; text: string } | null {
  const live = challenge.status === 'live' || challenge.status === 'in_progress';
  if (live) {
    if (isOfficialSeriesChallenge(challenge) && challenge.status === 'live') {
      return null;
    }
    const text = lobbyTimeLabel(challenge).trim();
    return text ? { kicker: 'Status', text } : null;
  }
  if (official && isOfficialJoinable(challenge)) {
    const guarantee = officialGuaranteeAmount(challenge);
    const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
    const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
    const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
    if (needed > 0) {
      const text = officialStartNeededLabel(needed);
      return text ? { kicker: 'Start', text } : null;
    }
    if (challenge.status === 'arming') {
      const text = armingCountdownLabel(challenge.armed_at, new Date(nowMs));
      return text ? { kicker: 'Start', text } : null;
    }
  }
  const text = (lobbyDiscoverTimeLabel(challenge) ?? lobbyTimeLabel(challenge) ?? '').trim();
  return text ? { kicker: 'Start', text } : null;
}

export function ChallengeCardVisual({
  challenge,
  joined = false,
  hosting = false,
  invited = false,
  myDays,
  host,
  nowMs,
  onPress,
  primaryLabel,
  onPrimary,
  showOfficialShare = false,
  compact = false,
}: ChallengeCardVisualProps) {
  const official = Boolean(challenge.is_official);
  const dark = official;
  const tags = challengeCardTags({
    challenge,
    hosting,
    joined,
    invited: invited && !joined && !hosting,
  });
  const proofs = proofChips(challenge);
  const days = Math.max(Number(myDays) || 0, 0);
  const duration = challengeDurationDays(challenge);
  const progress = joinedProgressCopy(challenge, days);
  const showRing = !official && joined && duration > 0 && !isPointsChallenge(challenge);
  const goal = official
    ? challengeGoalLabel(challenge, { daysCompleted: days })
    : isPointsChallenge(challenge)
      ? challengeGoalLabel(challenge)
      : `${duration}-Day Consistency`;
  const goalSub = official ? challengeGoalSubtitle(challenge) : null;
  const showGoal = Boolean(goal) && !showRing;
  const officialLive = isOfficialSeriesChallenge(challenge) && challenge.status === 'live';
  const strip = startStripCopy(challenge, nowMs, official);
  const titleColor = dark ? '#FFFFFF' : THEME.textPrimary;
  const muted = dark ? 'rgba(231,247,243,0.72)' : THEME.textMuted;
  const accent = dark ? '#9EE8DC' : THEME.accent;

  const body = (
    <View style={{ gap: compact ? 8 : 10 }}>
      <View style={{ paddingRight: 36 }}>
        <ChallengeTagRow tags={tags} tone={dark ? 'dark' : 'light'} />
      </View>

      <View>
        <AppText
          className={compact ? 'text-[17px] font-extrabold leading-5' : 'text-[20px] font-extrabold leading-6'}
          style={{ color: titleColor }}
          numberOfLines={2}>
          {challenge.title}
        </AppText>
        {official ? (
          <View className="mt-1.5">
            <OfficialSponsorLine
              challenge={challenge}
              muted={muted}
              titleColor={titleColor}
              compact={compact}
            />
          </View>
        ) : host ? (
          <View className="mt-1.5 flex-row items-center" style={{ gap: 8 }}>
            <Avatar uri={host.avatarUrl} name={host.name} size={22} />
            <AppText className="text-[13px]" style={{ color: muted }} numberOfLines={1}>
              Hosted by{' '}
              <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
                {host.name}
              </AppText>
            </AppText>
          </View>
        ) : null}
      </View>

      {proofs.length > 0 || showGoal || showRing ? (
        <View className="flex-row items-start" style={{ gap: 12 }}>
          <View className="min-w-0 flex-1" style={{ gap: 10 }}>
            {proofs.length > 0 ? (
              <View>
                <SectionLabel color={accent}>Required proof</SectionLabel>
                <View className="mt-1.5 flex-row flex-wrap" style={{ gap: 8 }}>
                  {proofs.map((proof) => (
                    <ProofMark key={proof.key} proof={proof} dark={dark} />
                  ))}
                </View>
              </View>
            ) : null}
            {showGoal ? (
              <View>
                <SectionLabel color={accent}>Goal</SectionLabel>
                <AppText className="mt-1 text-[15px] font-extrabold" style={{ color: titleColor }}>
                  {goal}
                </AppText>
                {goalSub ? (
                  <AppText className="text-[12px]" style={{ color: muted }}>
                    {goalSub}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>
          {showRing ? (
            <View className="items-center">
              <ProgressRing
                progress={progress.ratio}
                size={72}
                strokeWidth={7}
                label={String(days)}
                labelClassName="text-[18px] font-extrabold text-charcoal"
              />
              <AppText className="mt-0.5 text-[11px] font-semibold text-charcoal">
                {days} of {duration} days
              </AppText>
            </View>
          ) : official && !officialLive && !compact ? (
            <View className="items-center justify-center pt-2">
              <Glyph name={GLYPH.star} color={accent} size={36} />
            </View>
          ) : null}
        </View>
      ) : null}

      {officialLive ? (
        <OfficialDayClock
          challenge={challenge}
          now={new Date(nowMs)}
          variant="card"
          tone={dark ? 'dark' : 'light'}
        />
      ) : null}

      <MoneyRow challenge={challenge} dark={dark} />

      {strip ? (
        <View
          className="flex-row items-center"
          style={{
            minHeight: 40,
            borderRadius: 14,
            paddingHorizontal: 12,
            gap: 10,
            backgroundColor: dark ? 'rgba(8,22,20,0.45)' : THEME.accentSoft,
            borderWidth: 1,
            borderColor: dark ? 'rgba(114,217,203,0.35)' : THEME.border,
          }}>
          <Glyph name={GLYPH.clock} color={dark ? accent : THEME.accent} size={16} />
          <View className="min-w-0 flex-1">
            <AppText
              className="text-[9px] font-extrabold uppercase"
              style={{ color: muted, letterSpacing: 0.4 }}>
              {strip.kicker}
            </AppText>
            <AppText
              className="text-[13px] font-semibold"
              style={{ color: titleColor }}
              numberOfLines={2}>
              {strip.text}
            </AppText>
          </View>
        </View>
      ) : null}

      {showOfficialShare || primaryLabel ? (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {showOfficialShare ? (
            <View style={{ flex: primaryLabel ? 0.72 : 1 }}>
              <OfficialInviteButton
                challengeId={challenge.id}
                challengeTitle={challenge.title}
                tone={dark ? 'hero' : 'card'}
                embedded
              />
            </View>
          ) : null}
          {primaryLabel && onPrimary ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              onPress={(event) => {
                event.stopPropagation();
                onPrimary();
              }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                backgroundColor: THEME.primary,
                borderWidth: 1,
                borderColor: dark ? THEME.accentBright : THEME.primary,
                ...(dark
                  ? {
                      shadowColor: THEME.accent,
                      shadowOpacity: 0.45,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 0 },
                    }
                  : null),
              }}>
              <AppText
                className="text-[14px] font-extrabold"
                style={{ color: THEME.primaryForeground }}>
                {primaryLabel}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <CardBoardStrip challenge={challenge} dark={dark} />
    </View>
  );

  const inner = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={{ padding: compact ? 12 : 14 }}>
      {body}
    </Pressable>
  );

  if (dark) {
    return (
      <LinearGradient
        colors={[...OFFICIAL_COLORS]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: RADIUS,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        <Watermark dark />
        {inner}
      </LinearGradient>
    );
  }

  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: RADIUS,
        overflow: 'hidden',
        ...themeShadow('card'),
      }}>
      <Watermark dark={false} />
      {inner}
    </View>
  );
}

function CardBoardStrip({
  challenge,
  dark,
}: {
  challenge: ChallengeWithStats;
  dark: boolean;
}) {
  const counts = compactCountsFromStats(challenge);
  if (counts.empty && !counts.settled) {
    return null;
  }
  const text = dark ? 'rgba(231,247,243,0.8)' : THEME.textMuted;
  const strong = dark ? '#FFFFFF' : THEME.textPrimary;
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 8, minHeight: 28 }}>
      <AppText className="text-[11px] font-extrabold" style={{ color: strong }}>
        {counts.remainingCount} in
      </AppText>
      <AppText className="text-[11px] font-semibold" style={{ color: text }}>
        {counts.droppedCount} out
      </AppText>
      {counts.settled ? (
        <AppText className="text-[11px] font-extrabold" style={{ color: dark ? '#9EE8DC' : THEME.accent }}>
          Settled
        </AppText>
      ) : null}
    </View>
  );
}

function SectionLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <AppText
        className="text-[10px] font-extrabold uppercase"
        style={{ color, letterSpacing: 0.7 }}>
        {children}
      </AppText>
      <View style={{ flex: 1, height: 1, backgroundColor: color, opacity: 0.28 }} />
    </View>
  );
}

function ProofMark({ proof, dark }: { proof: ProofChip; dark: boolean }) {
  const color = dark ? '#FFFFFF' : THEME.accent;
  return (
    <View
      className="flex-row items-center"
      style={{
        minHeight: 32,
        paddingHorizontal: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: dark ? 'rgba(255,255,255,0.28)' : THEME.accent,
        gap: 6,
      }}>
      <Glyph name={proof.glyph} color={color} size={14} />
      <AppText className="text-[12px] font-semibold" style={{ color }}>
        {proof.label}
      </AppText>
    </View>
  );
}

function MoneyRow({ challenge, dark }: { challenge: ChallengeWithStats; dark: boolean }) {
  const official = Boolean(challenge.is_official);
  const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const guarantee = officialGuaranteeAmount(challenge);
  const prize = Math.max(Number(challenge.prize_pool) || 0, 0);
  const labelColor = dark ? 'rgba(231,247,243,0.62)' : THEME.accent;
  const valueClass = dark
    ? 'text-[15px] font-extrabold'
    : 'text-[18px] font-extrabold text-charcoal';
  const valueColor = dark ? '#FFFFFF' : undefined;
  const cols: Array<{ key: string; label: string; node: ReactNode }> = [];

  if (official || buyIn >= 0) {
    cols.push({
      key: 'entry',
      label: buyIn <= 0 ? 'Entry' : copy('create.buyIn'),
      node: (
        <EntryFeeAmount
          amount={buyIn}
          currency={challenge.currency}
          textClassName={valueClass}
          color={valueColor}
          labeled
        />
      ),
    });
  }
  if (official && guarantee > 0) {
    cols.push({
      key: 'guarantee',
      label: copy('board.guarantee'),
      node: <BuckUsdAmount amount={guarantee} textClassName={valueClass} color={valueColor} />,
    });
  }
  cols.push({
    key: 'prize',
    label: copy('board.pot'),
    node: (
      <CashPrizeAmount
        amount={prize}
        currency={challenge.currency}
        textClassName={valueClass}
        color={valueColor}
      />
    ),
  });

  return (
    <View>
      {cols.length === 1 ? (
        <View>
          <SectionLabel color={labelColor}>{cols[0].label}</SectionLabel>
          <View className="mt-1">{cols[0].node}</View>
        </View>
      ) : (
        <View className="flex-row" style={{ gap: 0 }}>
          {cols.map((col, index) => (
            <View
              key={col.key}
              className="flex-1"
              style={{
                paddingHorizontal: index === 0 ? 0 : 10,
                borderLeftWidth: index === 0 ? 0 : 1,
                borderLeftColor: dark ? 'rgba(255,255,255,0.16)' : THEME.border,
              }}>
              <AppText
                className="text-[9px] font-extrabold uppercase"
                style={{ color: labelColor, letterSpacing: 0.4 }}
                numberOfLines={1}>
                {col.label}
              </AppText>
              <View className="mt-0.5">{col.node}</View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Watermark({ dark }: { dark: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -8, right: -6, opacity: dark ? 0.16 : 0.08 }}>
      <BlobMascot variant="wave" size={128} />
    </View>
  );
}
