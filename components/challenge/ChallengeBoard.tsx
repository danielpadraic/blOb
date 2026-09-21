import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';

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
  boardCompletersCount,
  boardEmptyCopy,
  boardMedalTone,
  boardMedalWash,
  boardStatKind,
  boardQuantityProgress,
  type BoardStatKind,
  initialExpandedBoardIds,
  boardRowTag,
  boardSettledCopy,
  buildBoard,
  formatBoardNestedQty,
  formatBoardPoints,
  quantityBoardHeaderLine,
  rankBoardRows,
  shortBoardHeader,
} from '@/lib/board';
import { usesQuantityScoring, usesPointsBoard, usesComparablePointsScoring } from '@/lib/challengeExperience';
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
  const view = useMemo(
    () =>
      buildBoard({
        status: challenge.status,
        prizePool: Number(challenge.prize_pool) || Number(settlement?.settlement.prize_pool) || 0,
        participants: (roster ?? []).map((row) => ({
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
      roster,
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
    : boardCompletersCount(view.people);
  const inCount = quantityBoard ? racing.length - doneCount : view.remainingCount;
  const headerLine = quantityBoard
    ? quantityBoardHeaderLine(inCount, doneCount, view.droppedCount)
    : pointsBoard
      ? `${copy('board.in')} ${view.remainingCount} · ${copy('board.completers')} ${doneCount}${
          view.droppedCount > 0 ? ` · ${copy('board.dropped')} ${view.droppedCount}` : ''
        }`
      : `${copy('board.remaining')} ${view.remainingCount} · ${copy('board.caughtUp')} ${view.caughtUpCount} · ${copy('board.dropped')} ${view.droppedCount}`;
  const rows = useMemo(
    () =>
      rankBoardRows(
        rankedPeople,
        quantityBoard ? 'quantity' : pointsBoard ? 'points' : 'days',
      ),
    [pointsBoard, quantityBoard, rankedPeople],
  );
  const seededChallenge = useRef<string | null>(null);
  useEffect(() => {
    if (compact || seededChallenge.current === challenge.id) {
      return;
    }
    if (rows.length === 0) {
      return;
    }
    seededChallenge.current = challenge.id;
    const kind = pointsBoard || comparableColumns.length > 0 ? 'points' : 'other';
    setOpenIds(new Set(initialExpandedBoardIds(rows, kind)));
  }, [challenge.id, compact, comparableColumns.length, pointsBoard, rows]);
  const participantById = useMemo(() => {
    const map = new Map<string, ChallengeParticipantWithProfile>();
    for (const row of roster ?? []) {
      map.set(row.user_id, row);
    }
    return map;
  }, [roster]);
  const racingIds = useMemo(() => racing.map((row) => row.userId), [racing]);
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

  const table = view.empty ? (
    <MascotState kind="empty" compact title={boardEmptyCopy(view)} />
  ) : (
    <View>
      <BoardHeaderRow
        compact={compact}
        hasSide={scoringLanes.length > 0}
        scoreHeader={scoreHeader}
        scoreWidth={scoreWidth}
        hasChevron={hasNested}
        showAdjust={showAdjustCol}
      />
      {rows.map((row) => {
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
          progress,
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
      })}
    </View>
  );

  if (compact) {
    return (
      <Card className="gap-2" style={{ padding: 12 }}>
        <View className="flex-row items-center justify-between">
          <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted, ...flexChildMin() }}>
            {headerLine}
          </AppText>
          {detailsControl}
        </View>
        {error ? (
          <AppText className="text-sm leading-5 text-coral-dark">
            Couldn’t load the board.{' '}
            {error.includes('network') || error.includes('offline')
              ? 'You’re offline. It will update when you’re back.'
              : 'Try again.'}
          </AppText>
        ) : (
          table
        )}
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
      </Card>
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <FieldNoteLabel
          note={quantityBoard ? 'boardQuantity' : pointsBoard ? 'boardPoints' : 'board'}
          textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </FieldNoteLabel>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <BoardBulkAdjustButton />
          {isOfficialChallenge(challenge) ? (
            <ChallengeLifecycleStatus compact status={challenge.status} />
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
        <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted, ...flexChildMin() }}>
          {headerLine}
        </AppText>
        {detailsControl}
      </View>
      {quantityBoard ? null : <MissBudgetLines challenge={challenge} used={missesUsed} />}

      {view.settled ? (
        <View className="gap-2">
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
          pointsBoard={pointsBoard}
        />
      )}

      {error ? (
        <AppText className="text-sm leading-5 text-coral-dark">
          Couldn’t load the board.{' '}
          {error.includes('network') || error.includes('offline')
            ? 'You’re offline. It will update when you’re back.'
            : 'Try again.'}
        </AppText>
      ) : (
        table
      )}

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
}: {
  challenge: Challenge;
  share: number;
  prizePool: number;
  joined: boolean;
  pointsBoard: boolean;
}) {
  if (pointsBoard) {
    return (
      <View className="flex-row items-center" style={{ gap: 12 }}>
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
          <AppText className="text-[12px] leading-4" style={{ color: THEME.textMuted }}>
            {copy('board.prizeUntilSettlement')}
          </AppText>
        </View>
        <View style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
          <BlobMascot variant="wave" size={72} />
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
        className="text-center text-[10px] font-semibold"
        style={{ width: BOARD_RANK_COL, flexShrink: 0, marginRight: BOARD_GAP, ...labelStyle }}>
        #
      </AppText>
      <View style={{ width: BOARD_AVATAR, flexShrink: 0, marginRight: BOARD_NAME_GAP }} />
      <AppText className="text-[10px] font-semibold" style={{ flex: 1, ...flexChildMin(), marginRight: BOARD_GAP, ...labelStyle }}>
        PLAYER
      </AppText>
      {hasSide ? (
        <AppText
          className="text-[10px] font-semibold"
          style={{ width: BOARD_SIDE_COL, flexShrink: 0, marginRight: BOARD_GAP, ...labelStyle }}>
          SIDE
        </AppText>
      ) : null}
      <AppText
        className="text-[10px] font-semibold"
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
        backgroundColor: wash ?? THEME.surface,
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
              {expanded ? '▾' : '▸'}
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
