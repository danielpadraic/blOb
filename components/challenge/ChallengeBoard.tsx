import { useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';

import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { BoardAdjustButton, BoardBulkAdjustButton, useHostAdjustUi } from '@/components/challenge/HostAdjustHost';
import { ScoringLaneChip } from '@/components/challenge/ScoringLaneChip';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import {
  BOARD_ADJUST_COL,
  BOARD_AVATAR,
  BOARD_CHEVRON_COL,
  BOARD_GAP,
  BOARD_MEDAL,
  BOARD_NAME_GAP,
  BOARD_PTS_COL,
  BOARD_RANK_COL,
  BOARD_ROW_MIN,
  BOARD_ROW_MIN_COMPACT,
  BOARD_SIDE_COL,
  boardColumnWidth,
  boardEmptyCopy,
  boardLaneSideTotals,
  boardStatusHeaderLine,
  boardMedalTone,
  boardMedalWash,
  boardStatKind,
  boardQuantityProgress,
  type BoardLaneSideTotal,
  type BoardStatKind,
  boardRowTag,
  pluralizeLaneLabel,
  boardSettledCopy,
  buildBoard,
  formatBoardNestedQty,
  formatBoardPoints,
  rankBoardRows,
  shortBoardHeader,
} from '@/lib/board';
import { usesQuantityScoring, usesPointsBoard, usesComparablePointsScoring } from '@/lib/challengeExperience';
import { isRosterObserver } from '@/lib/joinRole';
import {
  comparableBoardColumns,
  comparablePointsFromChallenge,
  formatComparableBoardCell,
  participantNeedsScoringLane,
  shortComparableBoardLabel,
  type ComparableBoardColumn,
} from '@/lib/comparablePoints';
import { boardMedalSource, boardStatSource } from '@/lib/board/art';
import { useSetScoringLane } from '@/hooks/useChallenge';
import { storedDurationDays } from '@/lib/challengeGoal';
import { challengeTargetCount } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { challengeShowsMissBudget, missesAllowedCap, missesAllowedCopy, missesUsedCopy } from '@/lib/missDuty';
import { isOfficialChallenge } from '@/lib/official';
import { flexChildMin, THEME } from '@/lib/theme';
import type { Challenge, ChallengeParticipantWithProfile, ChallengeSettlementView } from '@/lib/types';

type ChallengeBoardProps = {
  challenge: Challenge;
  roster: ChallengeParticipantWithProfile[] | undefined;
  completedUserIds: Set<string>;
  joined?: boolean;
  viewerId?: string | null;
  settlement?: ChallengeSettlementView | null;
  variant?: 'full' | 'compact';
  showReceipt?: boolean;
  onOpenReceipt?: () => void;
  onOpenBoard?: () => void;
  error?: string | null;
  missesUsed?: number;
};

type NestedLine = { label: string; value: string; icon?: BoardStatKind | null };

export function ChallengeBoard({
  challenge,
  roster,
  completedUserIds,
  joined = false,
  viewerId,
  settlement,
  variant = 'full',
  showReceipt = false,
  onOpenReceipt,
  onOpenBoard,
  error,
  missesUsed = 0,
}: ChallengeBoardProps) {
  const [receiptOpen, setReceiptOpen] = useState(showReceipt);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const compact = variant === 'compact';
  const quantityBoard = usesQuantityScoring(challenge);
  const racingRoster = useMemo(
    () => (roster ?? []).filter((row) => !isRosterObserver(row)),
    [roster],
  );
  const observerRoster = useMemo(
    () => (roster ?? []).filter((row) => isRosterObserver(row)),
    [roster],
  );
  const view = useMemo(
    () =>
      buildBoard({
        status: challenge.status,
        prizePool: Number(challenge.prize_pool) || Number(settlement?.settlement.prize_pool) || 0,
        participants: racingRoster.map((row) => ({
          user_id: row.user_id,
          days_completed: row.days_completed,
          points: row.points,
          distance_meters_total: row.distance_meters_total,
          metric_totals: row.metric_totals,
          status: row.status,
          eliminated_at: row.eliminated_at,
          joined_at: row.joined_at,
          completed_at: row.completed_at,
          display_name: row.profile?.display_name,
          username: row.profile?.username,
          avatar_url: row.profile?.avatar_url,
        })),
        completedUserIds: quantityBoard ? [] : completedUserIds,
        settlement: settlement
          ? {
              winner_count: settlement.settlement.winner_count,
              prize_pool: settlement.settlement.prize_pool,
              payouts: settlement.payouts,
            }
          : null,
        viewerId,
        joined,
        currency: challenge.currency,
      }),
    [
      challenge.currency,
      challenge.prize_pool,
      challenge.status,
      completedUserIds,
      joined,
      quantityBoard,
      racingRoster,
      settlement,
      viewerId,
    ],
  );
  const settledCopy = boardSettledCopy(view);
  const openReceipt = receiptOpen || showReceipt;
  const { isActor, canAdjust, canHouseRemove, canFriendlyRemove, canEditScore, canProxy } = useHostAdjustUi();
  const setLane = useSetScoringLane(challenge.id);
  const pointsBoard = usesPointsBoard(challenge);
  const comparableConfig = usesComparablePointsScoring(challenge)
    ? comparablePointsFromChallenge(challenge)
    : null;
  const scoringLanes = comparableConfig?.lanes ?? [];
  const canAssignLane = Boolean(isActor && scoringLanes.length > 0 && !view.settled);
  const comparableColumns = comparableConfig ? comparableBoardColumns(comparableConfig) : [];
  const consistencyBoard = !quantityBoard && !pointsBoard;
  const hasNested = comparableColumns.length > 0 || consistencyBoard || quantityBoard;
  const showAdjustCol =
    !view.settled &&
    consistencyBoard &&
    (canAdjust || canHouseRemove || canFriendlyRemove || canEditScore || canProxy);
  const requiredDays = storedDurationDays(challenge) ?? challengeTargetCount(challenge);
  const showMissLine = challengeShowsMissBudget(challenge);
  const missCap = missesAllowedCap(challenge);
  const progressByUser = useMemo(() => {
    const map = new Map<string, ReturnType<typeof boardQuantityProgress>>();
    if (!quantityBoard) {
      return map;
    }
    for (const row of roster ?? []) {
      map.set(
        row.user_id,
        boardQuantityProgress(challenge, {
          distanceMeters: row.distance_meters_total,
          metricTotals: row.metric_totals,
          points: row.points,
        }),
      );
    }
    return map;
  }, [challenge, quantityBoard, roster]);
  const rankedPeople = useMemo(
    () =>
      view.people.map((row) => ({
        ...row,
        quantity: progressByUser.get(row.userId)?.logged ?? 0,
      })),
    [progressByUser, view.people],
  );
  const racing = rankedPeople.filter((row) => row.bucket !== 'dropped');
  const doneCount = quantityBoard
    ? racing.filter((row) => progressByUser.get(row.userId)?.done).length
    : 0;
  const inCount = quantityBoard ? racing.length - doneCount : view.remainingCount;
  const rows = useMemo(
    () =>
      rankBoardRows(
        rankedPeople,
        quantityBoard ? 'quantity' : pointsBoard ? 'points' : 'days',
      ),
    [pointsBoard, quantityBoard, rankedPeople],
  );
  const participantById = useMemo(() => {
    const map = new Map<string, ChallengeParticipantWithProfile>();
    for (const row of roster ?? []) {
      map.set(row.user_id, row);
    }
    return map;
  }, [roster]);
  const racingIds = useMemo(() => racing.map((row) => row.userId), [racing]);
  const laneTotals = useMemo(
    () =>
      scoringLanes.length > 0
        ? boardLaneSideTotals({
            rows,
            laneOf: (userId) => participantById.get(userId)?.scoring_lane,
            lanes: scoringLanes,
          })
        : [],
    [participantById, rows, scoringLanes],
  );
  const hasLaneScoreboard = scoringLanes.length >= 1;
  const headerFormat = quantityBoard ? 'quantity' : pointsBoard ? 'points' : 'consistency';
  const leadingScore = racing.reduce((max, row) => Math.max(max, Number(row.points) || 0), 0);
  const headerLine = hasLaneScoreboard
    ? ''
    : boardStatusHeaderLine({
        format: headerFormat,
        racingCount: racing.length,
        leadingScore,
        remainingCount: view.remainingCount,
        caughtUpCount: view.caughtUpCount,
        droppedCount: view.droppedCount,
        inCount,
        doneCount,
      });
  const allDetailsOpen = hasNested && racingIds.length > 0 && racingIds.every((id) => openIds.has(id));
  const quantityUnit =
    [...progressByUser.values()].find((item) => item?.unit)?.unit || 'mi';
  const scoreHeader = quantityBoard
    ? shortBoardHeader(quantityUnit)
    : consistencyBoard
      ? 'Days'
      : 'Pts';
  const scoreWidth = useMemo(() => {
    const samples = rows.map((row) => {
      const participant = participantById.get(row.userId);
      const needsLane = participantNeedsScoringLane(comparableConfig, participant?.scoring_lane);
      if (needsLane) {
        return '—';
      }
      if (quantityBoard) {
        return progressByUser.get(row.userId)?.label?.trim() || '42.1 / 128 mi';
      }
      if (consistencyBoard) {
        return `${Number(row.days) || 0}/${requiredDays}`;
      }
      return formatBoardPoints(row.points);
    });
    if (quantityBoard) {
      return boardColumnWidth([scoreHeader, ...samples], {
        compact,
        min: BOARD_PTS_COL,
        max: 110,
      });
    }
    return BOARD_PTS_COL;
  }, [
    compact,
    comparableConfig,
    consistencyBoard,
    participantById,
    progressByUser,
    quantityBoard,
    requiredDays,
    rows,
    scoreHeader,
  ]);

  function toggleRow(userId: string) {
    if (!hasNested) {
      return;
    }
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function toggleAllDetails() {
    setOpenIds(allDetailsOpen ? new Set() : new Set(racingIds));
  }

  function toggleReceipt() {
    if (onOpenReceipt) {
      onOpenReceipt();
      return;
    }
    setReceiptOpen((current) => !current);
  }

  const detailsControl = hasNested ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={allDetailsOpen ? copy('board.hideDetails') : copy('board.showDetails')}
      onPress={toggleAllDetails}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
      <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
        {allDetailsOpen ? copy('board.hideDetails') : copy('board.showDetails')}
      </AppText>
    </Pressable>
  ) : null;

  const standingRows = view.empty ? (
    <MascotState kind="empty" compact title={boardEmptyCopy(view)} />
  ) : (
    rows.map((row) => {
      const participant = participantById.get(row.userId);
      const needsLane = participantNeedsScoringLane(comparableConfig, participant?.scoring_lane);
      const dropped = row.bucket === 'dropped';
      const displayRank = row.rank == null || needsLane || dropped ? null : row.rank;
      const progress = progressByUser.get(row.userId);
      const score = needsLane
        ? '—'
        : quantityBoard
          ? progress?.label?.trim() ||
            (progress && progress.target > 0
              ? `${formatBoardNestedQty(progress.logged)} / ${formatBoardNestedQty(progress.target)} ${progress.unit}`.trim()
              : progress
                ? formatBoardNestedQty(progress.logged)
                : '0')
          : consistencyBoard
            ? `${Number(row.days) || 0}/${requiredDays}`
            : formatBoardPoints(row.points);
      const nested = nestedLines({
        comparableColumns,
        totals: participant?.metric_totals ?? null,
        consistencyBoard,
        quantityBoard,
        days: Number(row.days) || 0,
        requiredDays,
        status: boardRowTag(row, view.settled, {
          quantityDone: quantityBoard ? Boolean(progress?.done) : false,
        }),
        showMissLine,
        missCap,
        missesUsed,
        progress: progress ?? null,
      });
      return (
        <BoardRankRow
          key={row.userId}
          compact={compact}
          rank={displayRank == null ? '—' : String(displayRank)}
          medal={dropped || needsLane ? null : boardMedalTone(displayRank)}
          name={row.name}
          you={row.you}
          username={row.username}
          userId={row.userId}
          avatarUrl={row.avatarUrl}
          muted={dropped}
          hasSide={scoringLanes.length > 0}
          side={
            scoringLanes.length ? (
              <ScoringLaneChip
                lanes={scoringLanes}
                laneId={participant?.scoring_lane}
                canAssign={canAssignLane}
                density="mark"
                busy={setLane.isPending}
                onAssign={(laneId) => setLane.mutate({ userId: row.userId, laneId })}
              />
            ) : null
          }
          score={score}
          scoreWidth={scoreWidth}
          expanded={openIds.has(row.userId)}
          canExpand={hasNested && nested.length > 0}
          nested={nested}
          onToggle={() => toggleRow(row.userId)}
          showAdjust={showAdjustCol}
          participantStatus={participant?.status}
        />
      );
    })
  );

  const columnHeader = view.empty ? null : (
    <BoardHeaderRow
      compact={compact}
      hasSide={scoringLanes.length > 0}
      scoreHeader={scoreHeader}
      scoreWidth={scoreWidth}
      hasChevron={hasNested}
      showAdjust={showAdjustCol}
    />
  );

  const scoreboard = (
    <Card padded={!hasLaneScoreboard} className="gap-3" style={hasLaneScoreboard ? { overflow: 'hidden', padding: 0 } : compact ? { padding: 12 } : undefined}>
      {hasLaneScoreboard ? (
        scoringLanes.length === 2 ? (
          <VsScoreboard totals={laneTotals} compact={compact} />
        ) : (
          <LaneChipStrip totals={laneTotals} />
        )
      ) : headerLine ? (
        <AppText
          className="text-[13px] font-semibold"
          style={{ color: THEME.textMuted, fontVariant: ['tabular-nums'] }}>
          {headerLine}
        </AppText>
      ) : null}
      {quantityBoard || pointsBoard || hasLaneScoreboard || compact ? null : (
        <MissBudgetLines challenge={challenge} used={missesUsed} />
      )}
      {view.settled ? (
        <View className="gap-2" style={hasLaneScoreboard ? { padding: 16 } : undefined}>
          {settledCopy.showBob ? (
            <MascotState kind="success" compact title={settledCopy.title} body={settledCopy.body} />
          ) : (
            <View>
              <AppText className="text-[15px] font-bold text-charcoal">{settledCopy.title}</AppText>
              <AppText className="mt-1 text-sm leading-5 text-muted">{settledCopy.body}</AppText>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open receipt"
            onPress={toggleReceipt}
            className="items-center justify-center"
            style={{
              minHeight: 44,
              borderRadius: 999,
              backgroundColor: THEME.accentSoft,
              paddingHorizontal: 16,
            }}>
            <AppText className="text-[13px] font-bold" style={{ color: THEME.accent }}>
              Receipt
            </AppText>
          </Pressable>
        </View>
      ) : (
        <ShareLine
          challenge={challenge}
          share={view.shareEstimate}
          prizePool={view.prizePool}
          joined={joined}
          pointsBoard={pointsBoard || hasLaneScoreboard}
          padded={hasLaneScoreboard}
          compact={compact}
        />
      )}
    </Card>
  );

  const standings = (
    <Card className="gap-2" style={compact ? { padding: 12, overflow: 'visible' } : { overflow: 'visible' }}>
      <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
        <FieldNoteLabel
          note={quantityBoard ? 'boardQuantity' : pointsBoard ? 'boardPoints' : 'board'}
          textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </FieldNoteLabel>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {compact ? null : <BoardBulkAdjustButton />}
          {isOfficialChallenge(challenge) ? <ChallengeLifecycleStatus compact status={challenge.status} /> : null}
          {detailsControl}
        </View>
      </View>
      {error ? (
        <AppText className="text-sm leading-5 text-coral-dark">
          Couldn’t load the board.{' '}
          {error.includes('network') || error.includes('offline')
            ? 'You’re offline. It will update when you’re back.'
            : 'Try again.'}
        </AppText>
      ) : (
        <StandingsBody header={columnHeader} freeze={!compact}>
          {standingRows}
        </StandingsBody>
      )}
      {observerRoster.length > 0 ? (
        <View className="mt-3 gap-2" style={{ borderTopWidth: 1, borderTopColor: THEME.line, paddingTop: 12 }}>
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Observers
          </AppText>
          {observerRoster.map((row) => {
            const name = row.profile?.display_name?.trim() || row.profile?.username || 'Observer';
            return (
              <View key={row.user_id} className="flex-row items-center" style={{ gap: 10, minHeight: 44 }}>
                <Avatar uri={row.profile?.avatar_url} name={name} size={32} />
                <AppText className="flex-1 font-semibold text-charcoal" numberOfLines={1}>
                  {name}
                </AppText>
                <AppText className="text-[12px] text-muted">Watching</AppText>
              </View>
            );
          })}
        </View>
      ) : null}
      {onOpenBoard ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open board"
          onPress={onOpenBoard}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
            View board
          </AppText>
        </Pressable>
      ) : null}
      {view.settled && openReceipt && settlement ? (
        <SettlementSummary
          settlement={settlement}
          userId={viewerId ?? undefined}
          joined={joined}
          currency={challenge.currency}
          official={Boolean(challenge.is_official)}
          entryFeePaid={
            (roster ?? []).find((row) => row.user_id === viewerId)?.buy_in_paid ??
            challenge.buy_in_amount
          }
          hostContribution={challenge.creator_contribution}
          prizePool={challenge.prize_pool}
        />
      ) : null}
    </Card>
  );

  return <View style={{ gap: compact ? 10 : 12 }}>{scoreboard}{standings}</View>;
}

function nestedLines(input: {
  comparableColumns: ComparableBoardColumn[];
  totals: Record<string, number> | null;
  consistencyBoard: boolean;
  quantityBoard: boolean;
  days: number;
  requiredDays: number;
  status: string;
  showMissLine: boolean;
  missCap: number | null;
  missesUsed: number;
  progress: ReturnType<typeof boardQuantityProgress>;
}): NestedLine[] {
  if (input.comparableColumns.length) {
    return input.comparableColumns.map((column) => ({
      label: shortComparableBoardLabel(column.label),
      value: column.money
        ? formatComparableBoardCell(column, input.totals)
        : formatBoardNestedQty(Number(input.totals?.[column.key]) || 0),
      icon: boardStatKind(column.label, column.money),
    }));
  }
  if (input.quantityBoard) {
    const unit = input.progress?.unit ? ` ${input.progress.unit}` : '';
    const logged = input.progress?.logged ?? 0;
    const goal = input.progress?.target ?? 0;
    if (goal <= 0 && logged <= 0) {
      return [];
    }
    return [
      { label: 'Logged', value: `${formatBoardNestedQty(logged)}${unit}`.trim() },
      { label: 'Goal', value: `${formatBoardNestedQty(goal)}${unit}`.trim() },
    ];
  }
  if (input.consistencyBoard) {
    const lines: NestedLine[] = [
      { label: 'Days', value: `${input.days} / ${input.requiredDays}` },
      { label: 'Status', value: input.status },
    ];
    if (input.showMissLine && input.missCap != null) {
      lines.push({
        label: 'Miss',
        value: `${missesAllowedCopy(input.missCap)} · ${missesUsedCopy(input.missesUsed)}`,
      });
    }
    return lines;
  }
  return [];
}

function ShareLine({
  challenge,
  share,
  prizePool,
  joined,
  pointsBoard,
  padded = false,
  compact = false,
}: {
  challenge: Challenge;
  share: number;
  prizePool: number;
  joined: boolean;
  pointsBoard: boolean;
  padded?: boolean;
  compact?: boolean;
}) {
  if (pointsBoard) {
    return (
      <View
        className="flex-row items-center"
        style={{
          gap: 12,
          padding: padded ? 16 : 0,
          borderTopWidth: padded ? 1 : 0,
          borderTopColor: THEME.border,
        }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <FieldNoteLabel
            note="prizePool"
            textClassName="text-[13px] font-semibold leading-5 text-muted">
            {copy('board.totalPrizePool')}
          </FieldNoteLabel>
          <StakeAmount
            amount={prizePool}
            currency={challenge.currency}
            size={22}
            textClassName="text-[22px] font-extrabold text-charcoal"
            zeroAsNumber
          />
        </View>
        <View style={{ flexShrink: 0, height: compact ? 72 : 80, justifyContent: 'center', backgroundColor: 'transparent' }}>
          <BlobMascot variant="wave" size={compact ? 72 : 80} />
        </View>
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
      <FieldNoteLabel
        note="share"
        textClassName="text-sm font-semibold leading-5 text-charcoal">
        {copy(joined ? 'board.yourShareIfFinish' : 'board.shareIfFinish')}
      </FieldNoteLabel>
      <StakeAmount
        amount={share}
        currency={challenge.currency}
        size={16}
        textClassName="text-sm font-semibold text-charcoal"
        zeroAsNumber
      />
    </View>
  );
}

function boardRowPlayerName(name: string, username: string | null | undefined, you?: boolean): string {
  const raw = String(name ?? '').trim();
  const handle = String(username ?? '')
    .trim()
    .replace(/^@/, '');
  const looksLikeHandle = Boolean(handle) && raw.toLowerCase() === handle.toLowerCase();
  const base =
    raw && raw.toLowerCase() !== 'blob' && !looksLikeHandle
      ? raw
      : handle
        ? `@${handle}`
        : raw && raw.toLowerCase() !== 'blob'
          ? raw
          : 'Player';
  return you ? `${base} (You)` : base;
}

function BoardHeaderRow({
  compact,
  hasSide,
  scoreHeader,
  scoreWidth,
  hasChevron,
  showAdjust,
}: {
  compact: boolean;
  hasSide: boolean;
  scoreHeader: string;
  scoreWidth: number;
  hasChevron: boolean;
  showAdjust: boolean;
}) {
  const labelStyle = {
    color: THEME.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  };
  return (
    <View
      className="flex-row items-center"
      style={{
        minHeight: compact ? 26 : 28,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
      }}>
      <AppText
        className="text-center text-[11px] font-semibold"
        style={{ width: BOARD_RANK_COL, flexShrink: 0, marginRight: BOARD_GAP, ...labelStyle }}>
        #
      </AppText>
      <View style={{ width: BOARD_AVATAR, flexShrink: 0, marginRight: BOARD_NAME_GAP }} />
      <AppText className="text-[11px] font-semibold" style={{ flex: 1, ...flexChildMin(), marginRight: BOARD_GAP, ...labelStyle }}>
        PLAYER
      </AppText>
      {hasSide ? (
        <AppText
          className="text-[11px] font-semibold"
          style={{ width: BOARD_SIDE_COL, flexShrink: 0, marginRight: BOARD_GAP, ...labelStyle }}>
          SIDE
        </AppText>
      ) : null}
      <AppText
        className="text-[11px] font-semibold"
        style={{ width: Math.max(BOARD_PTS_COL, scoreWidth), flexShrink: 0, textAlign: 'right', ...labelStyle }}>
        {scoreHeader.toUpperCase()}
      </AppText>
      {hasChevron ? <View style={{ width: BOARD_CHEVRON_COL, flexShrink: 0 }} /> : null}
      {showAdjust ? <View style={{ width: BOARD_ADJUST_COL, flexShrink: 0 }} /> : null}
    </View>
  );
}

function BoardRankRow({
  compact,
  rank,
  medal,
  name,
  you,
  username,
  userId,
  avatarUrl,
  muted,
  hasSide,
  side,
  score,
  scoreWidth,
  expanded,
  canExpand,
  nested,
  onToggle,
  showAdjust,
  participantStatus,
}: {
  compact: boolean;
  rank: string;
  medal: ReturnType<typeof boardMedalTone>;
  name: string;
  you?: boolean;
  username: string | null;
  userId: string;
  avatarUrl: string | null;
  muted?: boolean;
  hasSide: boolean;
  side?: ReactNode;
  score: string;
  scoreWidth: number;
  expanded: boolean;
  canExpand: boolean;
  nested: NestedLine[];
  onToggle: () => void;
  showAdjust?: boolean;
  participantStatus?: string | null;
}) {
  const ink = muted ? THEME.textMuted : THEME.textPrimary;
  const label = boardRowPlayerName(name, username, you);
  const avatarName = label.replace(/ \(You\)$/, '');
  const rowMin = compact ? BOARD_ROW_MIN_COMPACT : BOARD_ROW_MIN;
  const ptsWidth = Math.max(BOARD_PTS_COL, scoreWidth);
  const medalArt = rank !== '—' ? boardMedalSource(medal) : null;
  const wash = boardMedalWash(medal);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
        backgroundColor: expanded && wash ? wash : THEME.surface,
        overflow: 'visible',
      }}>
      <Pressable
        accessibilityRole={canExpand ? 'button' : undefined}
        accessibilityLabel={canExpand ? `${label}. ${expanded ? 'Hide details' : 'Show details'}` : label}
        onPress={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        style={{
          minHeight: rowMin,
          paddingVertical: compact ? 6 : 8,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View
          style={{
            width: BOARD_RANK_COL,
            marginRight: BOARD_GAP,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'visible',
          }}>
          {medalArt ? (
            <Image
              source={medalArt}
              accessibilityLabel={`Rank ${rank}`}
              style={{ width: BOARD_MEDAL, height: BOARD_MEDAL }}
              resizeMode="contain"
            />
          ) : (
            <AppText
              className="text-center text-[12px] font-extrabold"
              style={{ color: ink, fontVariant: ['tabular-nums'] }}>
              {rank}
            </AppText>
          )}
        </View>

        <ProfileLink
          username={username}
          userId={userId}
          style={{ width: BOARD_AVATAR, flexShrink: 0, marginRight: BOARD_NAME_GAP }}>
          <Avatar uri={avatarUrl} name={avatarName} size={BOARD_AVATAR} />
        </ProfileLink>

        <ProfileLink
          username={username}
          userId={userId}
          fill
          style={{ flex: 1, minWidth: 0, marginRight: BOARD_GAP }}>
          <AppText
            className="font-semibold"
            numberOfLines={1}
            style={{ color: ink, fontSize: 13, fontWeight: '600' }}>
            {label}
          </AppText>
        </ProfileLink>

        {hasSide ? (
          <View
            style={{
              width: BOARD_SIDE_COL,
              flexShrink: 0,
              marginRight: BOARD_GAP,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {side}
          </View>
        ) : null}

        <AppText
          className="font-semibold"
          numberOfLines={1}
          style={{
            width: ptsWidth,
            minWidth: BOARD_PTS_COL,
            flexShrink: 0,
            color: ink,
            fontSize: 12,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
          }}>
          {score}
        </AppText>

        {canExpand ? (
          <View
            style={{
              width: BOARD_CHEVRON_COL,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.textMuted }}>
              {expanded ? '▴' : '▾'}
            </AppText>
          </View>
        ) : null}

        {showAdjust ? (
          <View style={{ width: BOARD_ADJUST_COL, flexShrink: 0, alignItems: 'center' }}>
            <BoardAdjustButton userId={userId} displayName={avatarName} status={participantStatus} />
          </View>
        ) : null}
      </Pressable>

      {expanded && nested.length > 0 ? (
        <View
          className="flex-row"
          style={{
            paddingBottom: 10,
            paddingTop: 2,
            paddingLeft: BOARD_RANK_COL + BOARD_GAP + BOARD_AVATAR + BOARD_NAME_GAP,
            paddingRight: canExpand ? BOARD_CHEVRON_COL : 4,
          }}>
          {nested.map((line, index) => (
            <View
              key={line.label}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 4,
                borderLeftWidth: index === 0 ? 0 : 1,
                borderLeftColor: THEME.border,
              }}>
              <BoardStatGlyph kind={line.icon} label={line.label} />
              <AppText
                className="text-[12px] font-semibold"
                style={{ color: ink, fontVariant: ['tabular-nums'] }}>
                {line.value}
              </AppText>
              <AppText className="text-[10px] leading-3" style={{ color: THEME.textMuted }}>
                {line.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BoardStatGlyph({ kind, label }: { kind?: BoardStatKind | null; label: string }) {
  const source = boardStatSource(kind ?? null);
  if (source) {
    return <Image source={source} style={{ width: 22, height: 22 }} resizeMode="contain" />;
  }
  const letter = String(label ?? '')
    .trim()
    .charAt(0)
    .toUpperCase() || '·';
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: THEME.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText className="text-[10px] font-bold" style={{ color: THEME.accent, includeFontPadding: false }}>
        {letter}
      </AppText>
    </View>
  );
}

const LANE_MINT_WASH = 'rgba(44, 155, 137, 0.08)';
const LANE_CREAM_WASH = 'rgba(215, 166, 47, 0.08)';
const VS_DISC = 30;

function iconWellStyle(fill: string) {
  return {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  };
}

function SproutWell() {
  return (
    <View style={iconWellStyle(THEME.accentSoft)}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 10 }}>
          <View
            style={{
              width: 7,
              height: 9,
              borderRadius: 7,
              backgroundColor: THEME.accent,
              transform: [{ rotate: '-28deg' }],
            }}
          />
          <View
            style={{
              width: 7,
              height: 9,
              borderRadius: 7,
              backgroundColor: THEME.accentBright,
              marginLeft: -3,
              transform: [{ rotate: '28deg' }],
            }}
          />
        </View>
        <View style={{ width: 2, height: 6, borderRadius: 1, backgroundColor: THEME.accent, marginTop: -1 }} />
      </View>
    </View>
  );
}

function TrophyWell() {
  return (
    <View style={iconWellStyle(THEME.calloutSoft)}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ width: 3, height: 7, borderRadius: 1, backgroundColor: THEME.gold, marginRight: 1 }} />
          <View
            style={{
              width: 12,
              height: 9,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              borderBottomLeftRadius: 5,
              borderBottomRightRadius: 5,
              backgroundColor: THEME.gold,
            }}
          />
          <View style={{ width: 3, height: 7, borderRadius: 1, backgroundColor: THEME.gold, marginLeft: 1 }} />
        </View>
        <View style={{ width: 3, height: 4, backgroundColor: THEME.gold }} />
        <AppText
          className="text-[5px] font-extrabold"
          style={{ color: THEME.gold, lineHeight: 6, includeFontPadding: false, marginTop: -1 }}>
          —
        </AppText>
      </View>
    </View>
  );
}

function LaneSideColumn({
  total,
  wash,
  well,
  compact,
  totalSize,
}: {
  total: BoardLaneSideTotal;
  wash: string;
  well: 'sprout' | 'trophy';
  compact: boolean;
  totalSize: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: wash,
        alignItems: 'center',
        paddingVertical: compact ? 14 : 18,
        paddingHorizontal: 10,
      }}>
      {well === 'sprout' ? <SproutWell /> : <TrophyWell />}
      <AppText
        className="text-[12px] font-semibold"
        numberOfLines={1}
        style={{ color: THEME.textPrimary, marginBottom: 4 }}>
        {pluralizeLaneLabel(total.label)}
      </AppText>
      <AppText
        className="font-extrabold"
        style={{
          color: THEME.textPrimary,
          fontSize: totalSize,
          lineHeight: totalSize + 4,
          fontVariant: ['tabular-nums'],
        }}>
        {formatBoardPoints(total.points)}
      </AppText>
      <AppText className="text-[11px]" style={{ color: THEME.textMuted, marginTop: 2 }}>
        Total Points
      </AppText>
    </View>
  );
}

function VsScoreboard({ totals, compact }: { totals: BoardLaneSideTotal[]; compact: boolean }) {
  const left = totals[0];
  const right = totals[1];
  if (!left || !right) {
    return <LaneChipStrip totals={totals} />;
  }
  return (
    <View style={{ position: 'relative' }}>
      <View style={{ flexDirection: 'row' }}>
        <LaneSideColumn
          total={left}
          wash={LANE_MINT_WASH}
          well="sprout"
          compact={compact}
          totalSize={compact ? 28 : 32}
        />
        <LaneSideColumn
          total={right}
          wash={LANE_CREAM_WASH}
          well="trophy"
          compact={compact}
          totalSize={compact ? 28 : 32}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: VS_DISC,
            height: VS_DISC,
            borderRadius: VS_DISC / 2,
            backgroundColor: THEME.surface,
            borderWidth: 1,
            borderColor: THEME.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText className="text-[10px] font-bold" style={{ color: THEME.textPrimary, letterSpacing: 0.3 }}>
            VS
          </AppText>
        </View>
      </View>
    </View>
  );
}

function LaneChipStrip({ totals }: { totals: BoardLaneSideTotal[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 4,
      }}>
      {totals.map((total) => (
        <View
          key={total.id}
          style={{
            borderWidth: 1,
            borderColor: THEME.border,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            minWidth: 96,
          }}>
          <AppText className="text-[12px] font-semibold" numberOfLines={1} style={{ color: THEME.textPrimary }}>
            {pluralizeLaneLabel(total.label)}
          </AppText>
          <AppText
            className="text-[16px] font-extrabold"
            style={{ color: THEME.textPrimary, fontVariant: ['tabular-nums'] }}>
            {formatBoardPoints(total.points)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function StandingsBody({
  header,
  freeze,
  children,
}: {
  header: ReactNode;
  freeze: boolean;
  children: ReactNode;
}) {
  if (!header) {
    return <View>{children}</View>;
  }

  const webSticky =
    freeze && Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 3,
          backgroundColor: THEME.surface,
        } as const)
      : { backgroundColor: THEME.surface };

  if (freeze && Platform.OS !== 'web') {
    return (
      <ScrollView
        nestedScrollEnabled
        stickyHeaderIndices={[0]}
        style={{ maxHeight: 520 }}
        showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: THEME.surface }}>{header}</View>
        {children}
      </ScrollView>
    );
  }

  return (
    <View>
      <View style={webSticky}>{header}</View>
      {children}
    </View>
  );
}
