'use client';

import { useState } from 'react';

import {
  BOARD_INFO,
  boardEmptyCopy,
  boardRowTag,
  boardSettledCopy,
  buildBoard,
  type BoardParticipant,
  type BoardPayout,
} from '@/lib/board';
import { FORFEIT_RECEIPT, formatSettlementAmount, receiptHeadline } from '@/lib/settlement/receipts';
import { Bob } from '~/components/bob';
import { ChallengeLifecycleStatus } from '~/components/challenge-lifecycle-status';
import { Card } from '~/components/ui/card';

type ChallengeBoardProps = {
  status?: string | null;
  prizePool?: number | null;
  currency?: string | null;
  participants: BoardParticipant[];
  completedUserIds: string[];
  settlement?: {
    winner_count?: number | null;
    prize_pool?: number | null;
    payouts?: BoardPayout[] | null;
  } | null;
  viewerId?: string | null;
  joined?: boolean;
  variant?: 'full' | 'compact';
  showReceipt?: boolean;
  onOpenBoard?: () => void;
  corporate?: boolean;
};

export function ChallengeBoard({
  status,
  prizePool,
  currency,
  participants,
  completedUserIds,
  settlement,
  viewerId,
  joined = false,
  variant = 'full',
  showReceipt = false,
  onOpenBoard,
  corporate,
}: ChallengeBoardProps) {
  const [receiptOpen, setReceiptOpen] = useState(showReceipt);
  const [info, setInfo] = useState<keyof typeof BOARD_INFO | null>(null);
  const view = buildBoard({
    status,
    prizePool: Number(settlement?.prize_pool ?? prizePool) || 0,
    participants,
    completedUserIds,
    settlement: settlement ?? null,
    viewerId,
    joined,
  });
  const settled = boardSettledCopy(view);

  if (variant === 'compact') {
    return (
      <button type="button" onClick={onOpenBoard} className="flex min-h-11 w-full items-center gap-2">
        <Chip value={view.remainingCount} label="In" />
        <Chip value={view.caughtUpCount} label="Done" />
        <Chip value={view.droppedCount} label="Out" />
        {view.settled ? <span className="text-[12px] font-bold text-teal">Settled</span> : null}
      </button>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Board</p>
        <ChallengeLifecycleStatus compact status={status} />
      </div>
      {corporate ? <p className="mt-2 text-xs text-muted">This board stays inside the lobby.</p> : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Remaining" value={view.remainingCount} note="remaining" onInfo={setInfo} />
        <Stat label="Caught Up" value={view.caughtUpCount} note="caughtUp" onInfo={setInfo} />
        <Stat label="Dropped" value={view.droppedCount} note="dropped" onInfo={setInfo} />
      </div>
      {info ? (
        <button
          type="button"
          onClick={() => setInfo(null)}
          className="mt-2 rounded-2xl border border-line bg-surface p-3 text-left">
          <p className="text-[13px] font-bold text-ink">{BOARD_INFO[info].title}</p>
          <p className="mt-1 text-sm text-muted">{BOARD_INFO[info].body}</p>
        </button>
      ) : null}

      {view.settled ? (
        <div className="mt-3">
          {settled.showBob ? <Bob title={settled.title} line={settled.body} compact /> : null}
          {!settled.showBob ? (
            <>
              <p className="text-[15px] font-bold text-ink">{settled.title}</p>
              <p className="mt-1 text-sm text-muted">{settled.body}</p>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setReceiptOpen((current) => !current)}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-teal-soft text-[13px] font-bold text-teal">
            Receipt
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink">
          Share if you finish {formatSettlementAmount(view.shareEstimate, currency)}
        </p>
      )}

      {view.empty ? (
        <p className="mt-3 text-sm text-muted">{boardEmptyCopy(view)}</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {view.remaining.map((row) => (
            <Row
              key={row.userId}
              name={row.you ? 'You' : row.name}
              tag={boardRowTag(row, view.settled)}
              amount={view.settled ? row.payout : null}
              currency={currency}
            />
          ))}
          {view.dropped.map((row) => (
            <Row key={row.userId} name={row.you ? 'You' : row.name} tag={boardRowTag(row, view.settled)} muted />
          ))}
        </div>
      )}

      {view.settled && (receiptOpen || showReceipt) ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Receipt</p>
          <p className="mt-2 text-[16px] font-bold text-ink">
            {receiptHeadline({
              joined,
              winnerCount: view.remainingCount,
              payoutAmount: view.yourPayout,
              currency,
            })}
          </p>
          {view.forfeited ? <p className="mt-2 text-sm text-muted">{FORFEIT_RECEIPT}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  note,
  onInfo,
}: {
  label: string;
  value: number;
  note: keyof typeof BOARD_INFO;
  onInfo: (note: keyof typeof BOARD_INFO) => void;
}) {
  return (
    <div className="flex min-h-11 flex-col items-center rounded-2xl bg-teal-soft px-2 py-2">
      <p className="text-[22px] font-extrabold text-ink">{value}</p>
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-semibold text-muted">{label}</p>
        <button
          type="button"
          aria-label={`About ${label}`}
          onClick={() => onInfo(note)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-[10px] font-bold text-muted">
          i
        </button>
      </div>
    </div>
  );
}

function Chip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-teal-soft px-2.5 text-[12px] font-bold text-ink">
      {value} {label}
    </span>
  );
}

function Row({
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
    <div className="flex min-h-11 items-center justify-between">
      <p className={`text-sm font-bold ${muted ? 'text-muted' : 'text-ink'}`}>{name}</p>
      <div className="flex items-center gap-2">
        {amount != null && Number(amount) > 0 ? (
          <p className="text-sm font-bold text-ink">{formatSettlementAmount(amount, currency)}</p>
        ) : null}
        <p className={`text-[12px] font-bold ${muted ? 'text-muted' : 'text-teal'}`}>{tag}</p>
      </div>
    </div>
  );
}
