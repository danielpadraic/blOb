import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { BoardAdjustButton, BoardBulkAdjustButton, useHostAdjustUi } from '@/components/challenge/HostAdjustHost';
import { ScoringLaneChip } from '@/components/challenge/ScoringLaneChip';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import {
  BOARD_ADJUST_COL,
  BOARD_AVATAR,
  BOARD_RANK_COL,
  BOARD_ROW_MIN,
  BOARD_ROW_MIN_COMPACT,
  boardColumnWidth,
  boardCompletersCount,
  boardEmptyCopy,
  boardMedalColor,
  boardMedalTone,
  boardQuantityProgress,
  boardRowTag,
  boardSettledCopy,
  buildBoard,
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
} from '@/lib/comparablePoints';
import { useSetScoringLane } from '@/hooks/useChallenge';
import { storedDurationDays } from '@/lib/challengeGoal';
import { challengeTargetCount } from '@/lib/challenges';
import { copy } from '@/lib/copy';
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

type GridCol = {
  key: string;
  label: string;
  width: number;
  flex?: number;
};

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
  const showAdjustCol =
    !view.settled &&
    consistencyBoard &&
    (canAdjust || canHouseRemove || canFriendlyRemove || canEditScore || canProxy);
  const requiredDays = storedDurationDays(challenge) ?? challengeTargetCount(challenge);
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
  const participantById = useMemo(() => {
    const map = new Map<string, ChallengeParticipantWithProfile>();
    for (const row of roster ?? []) {
      map.set(row.user_id, row);
    }
    return map;
  }, [roster]);

  const grid = useMemo(() => {
    const cols: GridCol[] = [
      { key: 'rank', label: '#', width: BOARD_RANK_COL },
      { key: 'player', label: 'Player', width: 0, flex: 1 },
    ];
    const widthOf = (samples: string[], min?: number) =>
      boardColumnWidth(samples, { compact, min: min ?? (compact ? 26 : 28) });

    if (scoringLanes.length) {
      const sideSamples = [
        'Side',
        ...scoringLanes.map((lane) => lane.label.trim() || '—'),
        '—',
      ];
      cols.push({ key: 'side', label: 'Side', width: widthOf(sideSamples, compact ? 36 : 44) });
    }

    if (comparableColumns.length) {
      for (const column of comparableColumns) {
        const header = shortComparableBoardLabel(column.label);
        const samples = [
          header,
          ...rows.map((row) => {
            const participant = participantById.get(row.userId);
            return formatComparableBoardCell(column, participant?.metric_totals ?? null);
          }),
        ];
        cols.push({ key: column.key, label: header, width: widthOf(samples, 32) });
      }
      const ptsSamples = [
        'Pts',
        ...rows.map((row) => {
          const participant = participantById.get(row.userId);
          return participantNeedsScoringLane(comparableConfig, participant?.scoring_lane)
            ? 'Needs a side'
            : formatBoardPoints(row.points);
        }),
      ];
      cols.push({
        key: 'pts',
        label: 'Pts',
        width: widthOf(ptsSamples, ptsSamples.includes('Needs a side') ? 68 : 36),
      });
    } else if (pointsBoard) {
      const ptsSamples = ['Pts', ...rows.map((row) => formatBoardPoints(row.points))];
      cols.push({ key: 'pts', label: 'Pts', width: widthOf(ptsSamples, 36) });
    } else if (quantityBoard) {
      const unit =
        [...progressByUser.values()].find((item) => item?.unit)?.unit ||
        shortBoardHeader('Progress');
      const header = shortBoardHeader(unit);
      const samples = [
        header,
        ...rows.map((row) => progressByUser.get(row.userId)?.label?.trim() || '0'),
      ];
      cols.push({ key: 'progress', label: header, width: widthOf(samples, 56) });
    } else {
      const daysSamples = [
        'Days',
        ...rows.map((row) => `${Number(row.days) || 0} / ${requiredDays}`),
      ];
      const statusSamples = [
        'Status',
        ...rows.map((row) =>
          boardRowTag(row, view.settled, {
            quantityDone: false,
          }),
        ),
      ];
      cols.push({ key: 'days', label: 'Days', width: widthOf(daysSamples, 40) });
      cols.push({ key: 'status', label: 'Status', width: widthOf(statusSamples, 48) });
    }

    if (showAdjustCol) {
      cols.push({ key: 'adjust', label: '', width: BOARD_ADJUST_COL });
    }
    return cols;
  }, [
    compact,
    comparableColumns,
    comparableConfig,
    participantById,
    pointsBoard,
    progressByUser,
    quantityBoard,
    requiredDays,
    rows,
    scoringLanes,
    showAdjustCol,
    view.settled,
  ]);

  function toggleReceipt() {
    if (onOpenReceipt) {
      onOpenReceipt();
      return;
    }
    setReceiptOpen((current) => !current);
  }

  const table = view.empty ? (
    <MascotState kind="empty" compact title={boardEmptyCopy(view)} />
  ) : (
    <View style={{ marginHorizontal: compact ? 0 : -4 }}>
      <BoardHeaderRow cols={grid} compact={compact} />
      {rows.map((row) => {
        const participant = participantById.get(row.userId);
        const needsLane = participantNeedsScoringLane(comparableConfig, participant?.scoring_lane);
        const dropped = row.bucket === 'dropped';
        const displayRank = row.rank == null || needsLane || dropped ? null : row.rank;
        const cells = grid
          .filter((col) => col.key !== 'rank' && col.key !== 'player' && col.key !== 'side' && col.key !== 'adjust')
          .map((col) => {
            if (col.key === 'pts') {
              return needsLane ? 'Needs a side' : formatBoardPoints(row.points);
            }
            if (col.key === 'days') {
              return `${Number(row.days) || 0} / ${requiredDays}`;
            }
            if (col.key === 'status') {
              return boardRowTag(row, view.settled, {
                quantityDone: quantityBoard ? Boolean(progressByUser.get(row.userId)?.done) : false,
              });
            }
            if (col.key === 'progress') {
              const progress = progressByUser.get(row.userId);
              return progress?.label?.trim() || (progress && progress.target > 0 ? `${progress.logged} / ${progress.target} ${progress.unit}`.trim() : '0');
            }
            const metric = comparableColumns.find((column) => column.key === col.key);
            if (metric) {
              return formatComparableBoardCell(metric, participant?.metric_totals ?? null);
            }
            return '';
          });
        return (
          <BoardRankRow
            key={row.userId}
            cols={grid}
            compact={compact}
            rank={displayRank == null ? '—' : String(displayRank)}
            medal={dropped || needsLane ? null : boardMedalTone(displayRank)}
            name={row.name}
            you={row.you}
            username={row.username}
            userId={row.userId}
            avatarUrl={row.avatarUrl}
            muted={dropped}
            cells={cells}
            side={
              scoringLanes.length ? (
                <ScoringLaneChip
                  lanes={scoringLanes}
                  laneId={participant?.scoring_lane}
                  canAssign={canAssignLane}
                  compact
                  busy={setLane.isPending}
                  onAssign={(laneId) => setLane.mutate({ userId: row.userId, laneId })}
                />
              ) : null
            }
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
        <AppText className="text-[12px] font-semibold" style={{ color: THEME.textMuted }}>
          {headerLine}
        </AppText>
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

      <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
        {headerLine}
      </AppText>
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
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
      <FieldNoteLabel
        note={pointsBoard ? 'prizePool' : 'share'}
        textClassName="text-sm font-semibold leading-5 text-charcoal">
        {pointsBoard
          ? copy('board.totalPrizePool')
          : copy(joined ? 'board.yourShareIfFinish' : 'board.shareIfFinish')}
      </FieldNoteLabel>
      <StakeAmount
        amount={pointsBoard ? prizePool : share}
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

function BoardHeaderRow({ cols, compact }: { cols: GridCol[]; compact: boolean }) {
  return (
    <View className="flex-row items-center" style={{ minHeight: compact ? 28 : 32, gap: 3 }}>
      {cols.map((col) => (
        <View
          key={col.key}
          style={
            col.flex
              ? { flex: col.flex, ...flexChildMin() }
              : { width: col.width, flexShrink: 0 }
          }>
          <AppText
            className={compact ? 'text-[10px] font-semibold' : 'text-[11px] font-semibold'}
            numberOfLines={1}
            style={{
              color: THEME.textMuted,
              textAlign: col.key === 'player' || col.key === 'side' ? 'left' : 'right',
              fontVariant: col.key === 'player' ? undefined : ['tabular-nums'],
            }}>
            {col.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function BoardRankRow({
  cols,
  compact,
  rank,
  medal,
  name,
  you,
  username,
  userId,
  avatarUrl,
  side,
  cells,
  muted,
  showAdjust,
  participantStatus,
}: {
  cols: GridCol[];
  compact: boolean;
  rank: string;
  medal: ReturnType<typeof boardMedalTone>;
  name: string;
  you?: boolean;
  username: string | null;
  userId: string;
  avatarUrl: string | null;
  side?: ReactNode;
  cells: string[];
  muted?: boolean;
  showAdjust?: boolean;
  participantStatus?: string | null;
}) {
  const ink = muted ? THEME.textMuted : THEME.textPrimary;
  const label = boardRowPlayerName(name, username, you);
  const avatarName = label.replace(/ \(You\)$/, '');
  const rowMin = compact ? BOARD_ROW_MIN_COMPACT : BOARD_ROW_MIN;
  const nameSize = compact ? 12 : 13;
  const numSize = compact ? 11 : 12;
  const medalFill = boardMedalColor(medal);
  const dataCols = cols.filter(
    (col) => col.key !== 'rank' && col.key !== 'player' && col.key !== 'side' && col.key !== 'adjust',
  );

  return (
    <View className="flex-row items-center" style={{ minHeight: rowMin, gap: 3 }}>
      <View
        style={{
          width: BOARD_RANK_COL,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {medalFill && rank !== '—' ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: medalFill,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText
              className="text-center text-[11px] font-extrabold"
              style={{ color: THEME.textPrimary, fontVariant: ['tabular-nums'] }}>
              {rank}
            </AppText>
          </View>
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
        fill
        style={{ flex: 1, minWidth: 0, minHeight: rowMin }}>
        <View
          className="flex-row items-center"
          style={{ flex: 1, minWidth: 0, minHeight: rowMin, gap: 6 }}>
          <View style={{ width: BOARD_AVATAR, flexShrink: 0 }}>
            <Avatar uri={avatarUrl} name={avatarName} size={BOARD_AVATAR} />
          </View>
          <View style={flexChildMin()}>
            <AppText
              className="font-semibold"
              numberOfLines={1}
              style={{ color: ink, fontSize: nameSize }}>
              {label}
            </AppText>
          </View>
        </View>
      </ProfileLink>

      {cols.some((col) => col.key === 'side') ? (
        <View
          style={{
            width: cols.find((col) => col.key === 'side')?.width ?? 44,
            flexShrink: 0,
            alignItems: 'flex-start',
          }}>
          {side}
        </View>
      ) : null}

      {dataCols.map((col, index) => (
        <View key={col.key} style={{ width: col.width, flexShrink: 0 }}>
          <AppText
            className="font-semibold"
            numberOfLines={1}
            style={{
              color: cells[index] === 'Needs a side' ? THEME.textMuted : ink,
              fontSize: cells[index] === 'Needs a side' ? 10 : numSize,
              textAlign: 'right',
              fontVariant: ['tabular-nums'],
            }}>
            {cells[index] || '0'}
          </AppText>
        </View>
      ))}

      {showAdjust ? (
        <View style={{ width: BOARD_ADJUST_COL, flexShrink: 0, alignItems: 'center' }}>
          <BoardAdjustButton userId={userId} displayName={avatarName} status={participantStatus} />
        </View>
      ) : null}
    </View>
  );
}
