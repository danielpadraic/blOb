'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  CHECKIN_BOB,
  checkinStageHint,
  checkinStageLabel,
  classifyCheckinError,
  incrementDaysCompleted,
  isLikelyOffline,
  parseChallengeCheckin,
  saveCheckinProofWithClient,
  submitCheckinWithClient,
} from '../../lib/checkin';
import { isSubmittedCheckin, type ChallengeCheckin, type CheckinPhase } from '../../lib/challengeCheckin';
import {
  isCorporateChallenge,
  isFitnessOfficialChallenge,
  usesComparablePointsScoring,
} from '../../lib/challengeExperience';
import {
  BEFORE_AFTER_HR_PRESET,
  partSatisfies,
  parseChallengeProofs,
  proofDisplayName,
  resolveChallengeProofs,
  type ChallengeProof,
} from '../../lib/challengeProofs';
import { lifecycleLabel, shouldAutoSettle } from '@/lib/settlement/lifecycle';
import { FORFEIT_RECEIPT, formatSettlementAmount, receiptHeadline } from '@/lib/settlement/receipts';
import { getChallengeSettlementWithClient, trySettleIfEndedWithClient } from '@/lib/settlement/rpc';
import type { ChallengeSettlementView } from '@/lib/types';
import { Bob } from '~/components/bob';
import { ChallengeLifecycleStatus } from '~/components/challenge-lifecycle-status';
import { CheckInCamera } from '~/components/check-in-camera';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { WalletBar } from '~/components/wallet-bar';
import { resolveProofUrl, uploadWebProof } from '~/lib/storage';
import { supabase } from '~/lib/supabase';

type ChallengeRow = {
  id: string;
  title: string;
  status: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
  category?: string | null;
  challenge_type?: string | null;
  privacy_mode?: string | null;
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
  proofs?: unknown;
  proof_type?: string | null;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  min_minutes?: number | null;
  days_required?: number | null;
  target_count?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  buy_in_amount?: number | null;
  prize_pool?: number | null;
  prize_structure?: string | null;
  currency?: string | null;
  distributed_at?: string | null;
  is_unlimited?: boolean | null;
};

type ParticipantRow = {
  user_id: string;
  days_completed: number | null;
  status: string | null;
  points?: number | null;
};

function pathParts(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return window.location.pathname.split('/').filter(Boolean);
}

function go(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new Event('blob-nav'));
}

function requiredProofs(challenge: ChallengeRow): ChallengeProof[] {
  if (usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    const stored = parseChallengeProofs(challenge.proofs);
    return stored.length > 0 ? stored : resolveChallengeProofs(challenge);
  }
  const stored = parseChallengeProofs(challenge.proofs);
  if (stored.length > 0) {
    return stored;
  }
  if (isFitnessOfficialChallenge(challenge)) {
    return BEFORE_AFTER_HR_PRESET.map((item, index) => ({
      id: `proof-${index + 1}`,
      name: item.name,
      method: item.method,
      minutes: item.minutes,
    }));
  }
  return resolveChallengeProofs(challenge);
}

function phaseOf(row: ChallengeCheckin | null): CheckinPhase {
  if (!row) {
    return 'none';
  }
  if (isSubmittedCheckin(row)) {
    return 'submitted';
  }
  return row.status;
}

export function BlobApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<string[]>(pathParts());

  useEffect(() => {
    const sync = () => setRoute(pathParts());
    window.addEventListener('popstate', sync);
    window.addEventListener('blob-nav', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('blob-nav', sync);
    };
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return <Bob title="blOb" line={CHECKIN_BOB.loading} />;
  }
  if (!session) {
    return <LoginScreen />;
  }

  const challengeId = route[0] === 'challenges' ? route[1] : undefined;
  const checkin = route[2] === 'check-in' || route[2] === 'check-in';

  if (challengeId && checkin) {
    return <CheckInScreen challengeId={challengeId} userId={session.user.id} />;
  }
  if (challengeId) {
    return <ChallengeScreen challengeId={challengeId} userId={session.user.id} />;
  }
  return <HomeScreen userId={session.user.id} />;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(mode: 'in' | 'up') {
    setBusy(true);
    setError(null);
    const result =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (result.error) {
      setError(result.error.message);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-8">
      <Bob title="I’m Bob." line="Sign in. Then check in." compact />
      <div className="mt-4 flex flex-col gap-3">
        <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <p className="text-sm text-[#9A3B3B]">{error}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void submit('in')}>
          Sign in
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit('up')}>
          Create account
        </Button>
      </div>
    </div>
  );
}

function HomeScreen({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ChallengeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const official = await supabase
        .from('challenges')
        .select(
          'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, proofs, proof_type, proof_requirements, min_minutes, days_required, target_count, starts_at, ends_at, buy_in_amount, prize_pool, prize_structure, currency, distributed_at',
        )
        .eq('is_official', true)
        .in('status', ['filling', 'arming', 'live', 'upcoming', 'settling', 'settled', 'ended'])
        .order('starts_at', { ascending: false })
        .limit(8);
      if (official.error) {
        setError(official.error.message);
        return;
      }
      const mine = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('user_id', userId)
        .limit(20);
      const ids = (mine.data ?? []).map((row) => String((row as { challenge_id: string }).challenge_id));
      let joined: ChallengeRow[] = [];
      if (ids.length) {
        const extra = await supabase
          .from('challenges')
          .select(
            'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, proofs, days_required',
          )
          .in('id', ids);
        joined = (extra.data ?? []) as ChallengeRow[];
      }
      const seen = new Set<string>();
      setRows(
        [...((official.data ?? []) as ChallengeRow[]), ...joined].filter((row) => {
          if (seen.has(row.id)) {
            return false;
          }
          seen.add(row.id);
          return true;
        }),
      );
    })();
  }, [userId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">Challenges</h1>
        <div className="flex items-center gap-2">
          <WalletBar userId={userId} />
          <button type="button" className="min-h-11 text-sm font-bold text-teal" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
      {error ? <Bob line="Home didn’t load." /> : null}
      <div className="flex flex-col gap-3 overflow-y-auto pb-8">
        {rows.map((row) => (
          <button key={row.id} type="button" className="text-left" onClick={() => go(`/challenges/${row.id}/`)}>
            <Card>
              <p className="text-[15px] font-bold text-ink">{row.title}</p>
              <p className="mt-1 text-sm text-muted">{lifecycleLabel(row.status)}</p>
            </Card>
          </button>
        ))}
        {rows.length === 0 && !error ? <Bob line={CHECKIN_BOB.empty} /> : null}
      </div>
    </div>
  );
}

function ChallengeScreen({ challengeId, userId }: { challengeId: string; userId: string }) {
  const [tab, setTab] = useState<'overview' | 'board' | 'feed'>('overview');
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [joined, setJoined] = useState(false);
  const [days, setDays] = useState(0);
  const [roster, setRoster] = useState<ParticipantRow[]>([]);
  const [posts, setPosts] = useState<Array<{ id: string; content: string | null }>>([]);
  const [phase, setPhase] = useState<CheckinPhase>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<ChallengeSettlementView | null>(null);
  const [ledger, setLedger] = useState<Array<{ id: string; amount: number; created_at: string; challenge_id: string | null }>>([]);

  async function load() {
    const ch = await supabase
      .from('challenges')
      .select(
        'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, scoring_config, comparable_points_config, proofs, proof_type, proof_requirements, min_minutes, days_required, target_count, starts_at, ends_at, buy_in_amount, prize_pool, prize_structure, currency, distributed_at, is_unlimited',
      )
      .eq('id', challengeId)
      .maybeSingle();
    const next = (ch.data as ChallengeRow | null) ?? null;
    setChallenge(next);
    const part = await supabase
      .from('challenge_participants')
      .select('user_id, days_completed, status, points')
      .eq('challenge_id', challengeId);
    const rows = (part.data ?? []) as ParticipantRow[];
    setRoster(rows);
    const mine = rows.find((row) => row.user_id === userId);
    setJoined(Boolean(mine));
    setDays(Number(mine?.days_completed) || 0);
    const checkins = await supabase
      .from('challenge_checkins')
      .select('id, user_id, challenge_id, period_key, status, proof_parts, submitted_at, started_at, created_at')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .order('period_key', { ascending: false })
      .limit(1);
    const row = checkins.data?.[0] as Record<string, unknown> | undefined;
    setPhase(phaseOf(row ? parseChallengeCheckin(row) : null));
    const feed = await supabase
      .from('posts')
      .select('id, content')
      .eq('challenge_id', challengeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    setPosts((feed.data ?? []) as Array<{ id: string; content: string | null }>);
    const receipt = await getChallengeSettlementWithClient(supabase, challengeId);
    setSettlement(receipt);
    const history = await supabase
      .from('wallet_ledger')
      .select('id, amount, created_at, challenge_id')
      .eq('user_id', userId)
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: false })
      .limit(8);
    setLedger(
      ((history.data ?? []) as Array<{ id: string; amount: number; created_at: string; challenge_id: string | null }>),
    );
    if (next && shouldAutoSettle(next)) {
      const settled = await trySettleIfEndedWithClient(supabase, challengeId);
      if (settled) {
        setSettlement(settled);
      }
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`web-board:${challengeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_participants', filter: `challenge_id=eq.${challengeId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: `challenge_id=eq.${challengeId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_settlements', filter: `challenge_id=eq.${challengeId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_payouts', filter: `challenge_id=eq.${challengeId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_ledger', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [challengeId, userId]);

  async function join() {
    setBusy(true);
    setError(null);
    const { error: joinError } = await supabase.rpc('join_challenge', { p_challenge_id: challengeId });
    if (joinError) {
      setError(joinError.message);
    } else {
      await load();
    }
    setBusy(false);
  }

  async function leave() {
    setBusy(true);
    const { error: leaveError } = await supabase.rpc('leave_challenge', { p_challenge_id: challengeId });
    if (leaveError) {
      setError(leaveError.message);
    } else {
      await load();
    }
    setBusy(false);
  }

  if (!challenge) {
    return <Bob title="Opening" line={CHECKIN_BOB.loading} />;
  }

  const target = Math.max(Number(challenge.days_required || challenge.target_count) || 7, 1);
  const corporate = isCorporateChallenge(challenge);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" className="min-h-11 text-sm font-bold text-teal" onClick={() => go('/')}>
          Back
        </button>
        <p className="text-[13px] font-bold text-ink">{challenge.title}</p>
        <WalletBar userId={userId} />
      </div>
      <div className="mt-3 flex justify-center gap-2 px-4">
        {(['overview', 'board', 'feed'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`min-h-11 rounded-full px-3 text-[13px] font-bold ${
              tab === item ? 'bg-teal-soft text-teal' : 'text-muted'
            }`}>
            {item === 'feed' ? 'Lobby Feed' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">
        {tab === 'overview' ? (
          <div className="flex flex-col gap-3">
            <Card>
              <p className="text-[15px] font-bold text-ink">{challenge.title}</p>
              <div className="mt-3">
                <ChallengeLifecycleStatus status={challenge.status} />
              </div>
              <p className="mt-3 text-sm text-ink">
                Your progress {days}/{target}
              </p>
              {corporate ? <p className="mt-2 text-sm text-muted">Posts stay inside this challenge</p> : null}
            </Card>
            {challenge.status === 'settling' && !settlement ? (
              <Card>
                <p className="text-[15px] font-bold text-ink">Settling</p>
                <p className="mt-1 text-sm text-muted">
                  Splitting the prize among remaining competitors. This updates on its own.
                </p>
              </Card>
            ) : null}
            {settlement ? (
              <Card>
                {joined && Number(settlement.payouts.find((row) => row.user_id === userId)?.amount) > 0 ? (
                  <Bob title="You got paid." line="The receipt is yours to keep." compact />
                ) : null}
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Receipt</p>
                <p className="mt-2 text-[18px] font-bold leading-6 text-ink">
                  {receiptHeadline({
                    joined,
                    winnerCount: settlement.settlement.winner_count,
                    payoutAmount: settlement.payouts.find((row) => row.user_id === userId)?.amount,
                    currency: challenge.currency,
                  })}
                </p>
                {settlement.settlement.winner_count === 0 ? (
                  <p className="mt-2 text-sm text-muted">{FORFEIT_RECEIPT}</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {settlement.payouts.map((payout) => (
                      <div key={payout.user_id} className="flex items-center justify-between">
                        <p className="text-sm font-bold text-ink">{payout.user_id === userId ? 'You' : 'Competitor'}</p>
                        <p className="text-sm font-bold text-ink">
                          {formatSettlementAmount(payout.amount, challenge.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {ledger.length > 0 ? (
                  <p className="mt-3 text-xs text-muted">Saved in wallet history.</p>
                ) : null}
              </Card>
            ) : null}
          </div>
        ) : null}
        {tab === 'board' ? (
          <Card>
            {roster.length === 0 ? (
              <p className="text-sm text-muted">No one on the board yet.</p>
            ) : (
              roster.map((row) => (
                <div key={row.user_id} className="flex items-center justify-between py-2">
                  <p className="text-sm font-bold text-ink">{row.user_id === userId ? 'You' : 'blob'}</p>
                  <p className="text-sm text-muted">
                    {Number(row.days_completed) || 0}/{target}
                  </p>
                </div>
              ))
            )}
          </Card>
        ) : null}
        {tab === 'feed' ? (
          <Card>
            {corporate ? <p className="mb-2 text-sm text-muted">Posts stay inside this challenge</p> : null}
            {posts.length === 0 ? (
              <p className="text-sm text-muted">Lobby is quiet. Check in first.</p>
            ) : (
              posts.map((post) => (
                <p key={post.id} className="border-b border-line py-2 text-sm text-ink">
                  {post.content || 'Check-in'}
                </p>
              ))
            )}
          </Card>
        ) : null}
        {error ? <p className="mt-3 text-sm text-[#9A3B3B]">{error}</p> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-bg px-4 pb-5 pt-2">
        {!joined ? (
          <div className="flex flex-col gap-2">
            <Button type="button" disabled={busy} onClick={() => void join()}>
              Join
            </Button>
            {challenge.status !== 'live' && challenge.status !== 'filling' ? (
              <p className="text-center text-xs text-muted">Leave before live returns the entry to your wallet.</p>
            ) : null}
          </div>
        ) : challenge.status === 'settled' || challenge.status === 'settling' ? (
          <Button type="button" variant="outline" disabled>
            {lifecycleLabel(challenge.status)}
          </Button>
        ) : challenge.status !== 'live' ? (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" disabled>
              {CHECKIN_BOB.notLive}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void leave()}>
              Leave · refund
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            disabled={phase === 'submitted'}
            onClick={() => go(`/challenges/${challengeId}/check-in/`)}>
            {checkinStageLabel(phase)}
          </Button>
        )}
      </div>
    </div>
  );
}

function CheckInScreen({ challengeId, userId }: { challengeId: string; userId: string }) {
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [checkin, setCheckin] = useState<ChallengeCheckin | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fail, setFail] = useState<'offline' | 'permission' | 'upload' | 'success' | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(0);

  const proofs = useMemo(() => (challenge ? requiredProofs(challenge) : []), [challenge]);
  const phase = phaseOf(checkin);
  const target = Math.max(Number(challenge?.days_required || challenge?.target_count) || 7, 1);

  async function load() {
    const ch = await supabase
      .from('challenges')
      .select(
        'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, scoring_config, comparable_points_config, proofs, proof_type, proof_requirements, min_minutes, days_required, target_count, starts_at',
      )
      .eq('id', challengeId)
      .maybeSingle();
    setChallenge((ch.data as ChallengeRow | null) ?? null);
    const rows = await supabase
      .from('challenge_checkins')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .order('period_key', { ascending: false })
      .limit(1);
    setCheckin(rows.data?.[0] ? parseChallengeCheckin(rows.data[0] as Record<string, unknown>) : null);
    const mine = await supabase
      .from('challenge_participants')
      .select('days_completed')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .maybeSingle();
    setDays(Number((mine.data as { days_completed?: number } | null)?.days_completed) || 0);
  }

  useEffect(() => {
    void load();
  }, [challengeId, userId]);

  async function saveProof(proof: ChallengeProof, file: Blob, fromLibrary: boolean) {
    if (isLikelyOffline()) {
      setFail('offline');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uri = URL.createObjectURL(file);
      const row = await saveCheckinProofWithClient(
        supabase,
        {
          challengeId,
          proof,
          uri,
          mimeType: file.type,
          fromLibrary,
          blob: file,
        },
        uploadWebProof,
        resolveProofUrl,
      );
      setCheckin(row);
      setCaptureId(null);
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      setFail(kind === 'offline' || kind === 'permission' || kind === 'upload' ? kind : 'upload');
      setError(caught instanceof Error ? caught.message : 'Couldn’t save that proof.');
    }
    setBusy(false);
  }

  async function submit() {
    if (isLikelyOffline()) {
      setFail('offline');
      return;
    }
    setBusy(true);
    try {
      const row = await submitCheckinWithClient(supabase, challengeId);
      setCheckin(row);
      setDays((current) => incrementDaysCompleted(current, false));
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
      setFail('success');
    } catch (caught) {
      const kind = classifyCheckinError(caught);
      setFail(kind === 'offline' || kind === 'permission' || kind === 'upload' ? kind : null);
      setError(caught instanceof Error ? caught.message : 'Couldn’t submit this check-in.');
    }
    setBusy(false);
  }

  if (!challenge) {
    return <Bob title="Opening today’s check-in" line={CHECKIN_BOB.loading} />;
  }
  if (challenge.status !== 'live') {
    return (
      <div className="flex flex-1 flex-col">
        <Bob title="Not live" line={CHECKIN_BOB.notLive} />
        <Button type="button" variant="ghost" onClick={() => go(`/challenges/${challengeId}/`)}>
          Back
        </Button>
      </div>
    );
  }
  if (fail === 'success' || phase === 'submitted') {
    return (
      <div className="flex flex-1 flex-col">
        <Bob title="Checked in" line={CHECKIN_BOB.success} />
        <p className="text-center text-sm text-ink">
          Board {days}/{target}
        </p>
        <div className="px-5">
          <Button type="button" onClick={() => go(`/challenges/${challengeId}/`)}>
            Back to challenge
          </Button>
        </div>
      </div>
    );
  }
  if (fail === 'offline' || fail === 'permission' || fail === 'upload') {
    return (
      <div className="flex flex-1 flex-col">
        <Bob
          title={fail === 'offline' ? CHECKIN_BOB.offline : fail === 'permission' ? CHECKIN_BOB.permission : CHECKIN_BOB.upload}
          line={error ?? CHECKIN_BOB[fail]}
        />
        <div className="px-5">
          <Button type="button" onClick={() => setFail(null)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const firstEmpty = proofs.find((proof) => !partSatisfies(proof, checkin?.proof_parts[proof.id]));
  const active = proofs.find((proof) => proof.id === captureId) ?? (phase === 'none' ? firstEmpty : null);
  if (active && (active.method === 'photo' || active.method === 'video' || active.method === 'hr')) {
    return (
      <CheckInCamera
        onCaptured={(blob, fromLibrary) => void saveProof(active, blob, fromLibrary)}
        onCancel={() => {
          setCaptureId(null);
          if (phase === 'none') {
            go(`/challenges/${challengeId}/`);
          }
        }}
      />
    );
  }

  const missing = proofs.filter((proof) => !partSatisfies(proof, checkin?.proof_parts[proof.id]));
  const ready = proofs.length > 0 && missing.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-4">
      <button type="button" className="self-start text-sm font-bold text-teal" onClick={() => go(`/challenges/${challengeId}/`)}>
        Back
      </button>
      <h1 className="mt-3 text-center text-xl font-bold text-ink">{checkinStageLabel(phase)}</h1>
      <p className="mt-2 text-center text-sm text-muted">
        {checkinStageHint(
          phase,
          missing.map((proof) => proofDisplayName(proof)),
        )}
      </p>
      <div className="mt-5 flex flex-col gap-3 overflow-y-auto pb-4">
        {proofs.map((proof) => {
          const done = partSatisfies(proof, checkin?.proof_parts[proof.id]);
          return (
            <Card key={proof.id}>
              <p className="text-[15px] font-bold text-ink">{proofDisplayName(proof)}</p>
              {done ? (
                <p className="mt-1 text-sm text-teal">Attached</p>
              ) : (
                <Button type="button" variant="ghost" className="mt-2 px-0" onClick={() => setCaptureId(proof.id)}>
                  Add this proof
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      {error ? <p className="text-sm text-[#9A3B3B]">{error}</p> : null}
      {ready ? (
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          Submit
        </Button>
      ) : null}
    </div>
  );
}
