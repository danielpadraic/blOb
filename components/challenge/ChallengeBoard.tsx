import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import {
  boardEmptyCopy,
  boardRowTag,
  boardSettledCopy,
  buildBoard,
  pointsLeader,
  pointsRank,
} from '@/lib/board';
import { usesPointsBoard } from '@/lib/challengeExperience';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
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
  error?: string | null;
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
  error,
}: ChallengeBoardProps) {
  const [receiptOpen, setReceiptOpen] = useState(showReceipt);
  const view = useMemo(
    () =>
      buildBoard({
        status: challenge.status,
        prizePool: Number(challenge.prize_pool) || Number(settlement?.settlement.prize_pool) || 0,
        participants: (roster ?? []).map((row) => ({
          user_id: row.user_id,
          days_completed: row.days_completed,
          points: row.points,
          status: row.status,
          eliminated_at: row.eliminated_at,
          joined_at: row.joined_at,
          display_name: row.profile?.display_name,
          username: row.profile?.username,
          avatar_url: row.profile?.avatar_url,
        })),
        completedUserIds,
        settlement: settlement
          ? {
              winner_count: settlement.settlement.winner_count,
              prize_pool: settlement.settlement.prize_pool,
              payouts: settlement.payouts,
            }
          : null,
        viewerId,
        joined,
      }),
    [challenge.prize_pool, challenge.status, completedUserIds, joined, roster, settlement, viewerId],
  );
  const settledCopy = boardSettledCopy(view);
  const openReceipt = receiptOpen || showReceipt;
  const pointsBoard = usesPointsBoard(challenge);
  const contestants = view.people.length;
  const rank = pointsRank(view.people, viewerId);
  const leader = pointsLeader(view.people);
  const rankLabel = joined ? (rank != null ? String(rank) : '—') : copy('board.joinToRank');

  function toggleReceipt() {
    if (onOpenReceipt) {
      onOpenReceipt();
      return;
    }
    setReceiptOpen((current) => !current);
  }

  if (variant === 'compact') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open board"
        onPress={onOpenReceipt}
        style={{ minHeight: 44 }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {pointsBoard ? (
            <>
              <CompactStat label={copy('board.contestants')} value={contestants} />
              <CompactStat label={copy('board.yourRank')} value={joined ? rank ?? '—' : '—'} />
              <CompactStat label={copy('board.challengeLeader')} value={leader?.name ?? '—'} />
            </>
          ) : (
            <>
              <CompactStat label="In" value={view.remainingCount} />
              <CompactStat label="Done" value={view.caughtUpCount} />
              <CompactStat label="Out" value={view.droppedCount} />
            </>
          )}
          {view.settled ? (
            <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
              Settled
            </AppText>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <FieldNoteLabel
          note={pointsBoard ? 'boardPoints' : 'board'}
          textClassName="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Board
        </FieldNoteLabel>
        <ChallengeLifecycleStatus compact status={challenge.status} />
      </View>

      <View className="flex-row items-stretch" style={{ gap: 8 }}>
        {pointsBoard ? (
          <>
            <Stat label={copy('board.contestants')} value={String(contestants)} />
            <Stat label={copy('board.yourRank')} value={rankLabel} />
            <Stat label={copy('board.challengeLeader')}>
              {leader ? (
                <View className="items-center" style={{ gap: 6 }}>
                  <Avatar uri={leader.avatarUrl} name={leader.name} size={32} />
                  <AppText
                    className="text-center text-[13px] font-bold leading-4 text-charcoal"
                    numberOfLines={2}>
                    {leader.name}
                  </AppText>
                </View>
              ) : (
                <AppText className="text-center text-[13px] font-bold leading-4 text-muted">
                  {copy('board.noLeader')}
                </AppText>
              )}
            </Stat>
          </>
        ) : (
          <>
            <Stat label={copy('board.remaining')} value={String(view.remainingCount)} />
            <Stat label={copy('board.caughtUp')} value={String(view.caughtUpCount)} />
            <Stat label={copy('board.dropped')} value={String(view.droppedCount)} />
          </>
        )}
      </View>

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
          Couldn’t load the board. {error.includes('network') || error.includes('offline')
            ? 'You’re offline. It will update when you’re back.'
            : 'Try again.'}
        </AppText>
      ) : null}

      {view.empty ? (
        <AppText className="text-sm text-muted">{boardEmptyCopy(view)}</AppText>
      ) : (
        <View className="gap-1.5">
          {view.remaining.map((row) => (
            <BoardRow
              key={row.userId}
              name={row.name}
              tag={boardRowTag(row, view.settled)}
              amount={view.settled ? row.payout : null}
              currency={challenge.currency}
            />
          ))}
          {view.dropped.map((row) => (
            <BoardRow key={row.userId} name={row.name} tag={boardRowTag(row, view.settled)} muted />
          ))}
        </View>
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

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <View
      className="min-w-0 flex-1 items-center justify-start"
      style={{
        backgroundColor: THEME.accentSoft,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 8,
        minHeight: 92,
      }}>
      <View className="min-h-[36px] w-full items-center justify-center">
        {children ?? (
          <AppText className="text-center text-[22px] font-extrabold leading-7 text-charcoal">
            {value}
          </AppText>
        )}
      </View>
      <AppText className="mt-2 w-full text-center text-[11px] font-semibold leading-4 text-muted">
        {label}
      </AppText>
    </View>
  );
}

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return (
    <View
      className="flex-row items-center"
      style={{
        minHeight: 28,
        borderRadius: 999,
        backgroundColor: THEME.accentSoft,
        paddingHorizontal: 10,
        gap: 4,
      }}>
      <AppText className="text-[13px] font-extrabold text-charcoal">{value}</AppText>
      <AppText className="text-[10px] font-semibold text-muted">{label}</AppText>
    </View>
  );
}

function BoardRow({
  name,
  tag,
  muted,
  amount,
  currency,
}: {
  name: string;
  tag: string;
  muted?: boolean;
  amount?: number | null;
  currency?: string | null;
}) {
  return (
    <View className="flex-row items-center justify-between" style={{ minHeight: 44 }}>
      <AppText
        className="flex-1 text-sm font-semibold"
        style={{ color: muted ? THEME.textMuted : THEME.textPrimary }}
        numberOfLines={1}>
        {name}
      </AppText>
      {amount != null && Number(amount) > 0 ? (
        <StakeAmount
          amount={amount}
          currency={currency}
          size={13}
          zeroAsNumber
          textClassName="mr-2 text-[13px] font-bold text-charcoal"
        />
      ) : null}
      <AppText
        className="text-[12px] font-semibold"
        style={{ color: muted ? THEME.textMuted : THEME.accent }}>
        {tag}
      </AppText>
    </View>
  );
}
