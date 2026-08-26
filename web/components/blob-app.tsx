'use client';

/** Not the consumer app. Production Web is the Expo Router export (`app/`). Do not add product UX here. */

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
  usesPointsBoard,
} from '../../lib/challengeExperience';
import {
  BEFORE_AFTER_HR_PRESET,
  partSatisfies,
  parseChallengeProofs,
  proofDisplayName,
  proofsAreHonorOnly,
  resolveChallengeProofs,
  type ChallengeProof,
} from '../../lib/challengeProofs';
import { lifecycleLabel, shouldAutoSettle } from '@/lib/settlement/lifecycle';
import { FORFEIT_RECEIPT, formatSettlementAmount, receiptHeadline } from '@/lib/settlement/receipts';
import { getChallengeSettlementWithClient, trySettleIfEndedWithClient } from '@/lib/settlement/rpc';
import {
  FUNDING_COPY,
  canHostTopUp,
  canRefundEntryFee,
  formatFundingAmount,
  fundingFromChallenge,
  fundingReceiptLines,
  joinShortfall,
  participateLabel,
} from '@/lib/funding';
import { topUpChallengePrizeWithClient } from '@/lib/funding/rpc';
import type { ChallengeSettlementView } from '@/lib/types';
import {
  capturePasswordRecoveryFromUrl,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
} from '@/lib/passwordRecovery';
import { hasAuthSessionTokens, parseAuthRedirectParams } from '@/lib/authRedirectParams';

import { Bob } from '~/components/bob';
import { ChallengeBoard } from '~/components/challenge-board';
import { passwordResetRedirectTo, SetPasswordScreen } from '~/components/set-password';
import { ChallengeLifecycleStatus } from '~/components/challenge-lifecycle-status';
import { CheckInCamera, useViewportBottomPad } from '~/components/check-in-camera';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { WalletBar } from '~/components/wallet-bar';
import { WalletSheetHost } from '~/components/wallet-sheet';
import { WalletTopUpHost, requestWebTopUp } from '~/components/wallet-top-up';
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
  created_by?: string | null;
  creator_contribution?: number | null;
};

type ParticipantRow = {
  user_id: string;
  days_completed: number | null;
  status: string | null;
  points?: number | null;
  eliminated_at?: string | null;
  buy_in_paid?: number | null;
  display_name?: string | null;
  username?: string | null;
};

function queryFlag(name: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search).get(name);
}

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
  const [recovery, setRecovery] = useState(() =>
    typeof window === 'undefined' ? false : isPasswordRecoveryPending(),
  );
  const [recoveryWaited, setRecoveryWaited] = useState(false);
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
    capturePasswordRecoveryFromUrl(window.location.href);
    if (isPasswordRecoveryPending()) {
      setRecovery(true);
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      let next = data.session;
      if (!next) {
        const params = parseAuthRedirectParams(window.location.href);
        if (params.access_token) {
          const result = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token ?? '',
          });
          next = result.data.session;
          if (result.error) {
            console.log('[blob:auth-redirect]', result.error.message);
          }
        } else if (params.code && hasAuthSessionTokens(params)) {
          const result = await supabase.auth.exchangeCodeForSession(params.code);
          next = result.data.session;
          if (result.error) {
            console.log('[blob:auth-redirect]', result.error.message);
          }
        }
      }
      if (isPasswordRecoveryPending()) {
        setRecovery(true);
      }
      setSession(next);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryPending();
        setRecovery(true);
      }
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!recovery || session) {
      return;
    }
    const timer = window.setTimeout(() => setRecoveryWaited(true), 2000);
    return () => window.clearTimeout(timer);
  }, [recovery, session]);

  if (!ready || (recovery && !session && !recoveryWaited)) {
    return <Bob title="blOb" line={CHECKIN_BOB.loading} />;
  }
  if (recovery) {
    return (
      <SetPasswordScreen
        expired={!session}
        onDone={() => {
          clearPasswordRecoveryPending();
          setRecovery(false);
          go('/');
        }}
      />
    );
  }
  if (!session) {
    return <LoginScreen />;
  }

  const challengeId = route[0] === 'challenges' ? route[1] : undefined;
  const checkin = route[2] === 'check-in' || route[2] === 'check-in';

  let screen = <HomeScreen userId={session.user.id} />;
  if (challengeId === 'create') {
    screen = <CreateScreen userId={session.user.id} />;
  } else if (challengeId && checkin) {
    screen = <CheckInScreen challengeId={challengeId} userId={session.user.id} />;
  } else if (challengeId) {
    screen = <ChallengeScreen challengeId={challengeId} userId={session.user.id} />;
  }

  return (
    <>
      {screen}
      <WalletSheetHost userId={session.user.id} />
      <WalletTopUpHost />
    </>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(mode: 'in' | 'up') {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (result.error) {
      setError(result.error.message);
    }
    setBusy(false);
  }

  async function sendReset() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectTo(),
    });
    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo('Check your inbox for a reset link.');
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
        {info ? <p className="text-sm font-semibold text-teal">{info}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void submit('in')}>
          Sign in
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit('up')}>
          Create account
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !email.trim()} onClick={() => void sendReset()}>
          Forgot password?
        </Button>
      </div>
    </div>
  );
}

function CreateScreen({ userId }: { userId: string }) {
  const [title, setTitle] = useState('Morning miles');
  const [task, setTask] = useState('Run 1 mile');
  const [constraint, setConstraint] = useState('');
  const [entryFee, setEntryFee] = useState(5);
  const [hostAdd, setHostAdd] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const footerPad = useViewportBottomPad(20);

  async function publish() {
    setBusy(true);
    setError(null);
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data, error: publishError } = await supabase.rpc('publish_challenge', {
      p_payload: {
        title: title.trim() || 'Skill Tournament',
        currency: 'bucks',
        buy_in_amount: Math.max(entryFee, 0),
        creator_contribution: Math.max(hostAdd, 0),
        host_budget: 0,
        host_funded: hostAdd > 0,
        funding_model: hostAdd > 0 && entryFee > 0 ? 'hybrid' : hostAdd > 0 ? 'creator' : 'participants',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
        format: 'consistency',
        challenge_type: 'consistency',
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        end_mode: 'length',
        length_value: 7,
        length_unit: 'days',
        required_checkins: 7,
        target_count: 7,
        days_required: 7,
        frequency: 'daily',
        min_participants: 2,
        creator_participating: true,
        task: task.trim() || 'Run 1 mile',
        rules: constraint.trim().length >= 2 ? constraint.trim() : null,
        proof_type: 'photo',
        created_by: userId,
      },
    });
    if (publishError) {
      const raw = publishError.message.toLowerCase();
      if (raw.includes('insufficient')) {
        const profile = await supabase.from('profiles').select('bucks').eq('id', userId).maybeSingle();
        const have = Number((profile.data as { bucks?: number } | null)?.bucks ?? 0);
        const need = Math.max(entryFee, 0) + Math.max(hostAdd, 0);
        requestWebTopUp({ amount: Math.max(joinShortfall(have, need), 1), returnCreate: true });
        setBusy(false);
        return;
      }
      setError(publishError.message);
      setBusy(false);
      return;
    }
    const id = String((data as { challenge_id?: string } | null)?.challenge_id ?? '');
    setBusy(false);
    if (id) {
      go(`/challenges/${id}/`);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-28 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" className="min-h-11 text-sm font-bold text-teal" onClick={() => go('/')}>
            Back
          </button>
          <p className="text-[13px] font-bold text-ink">{FUNDING_COPY.createTitle}</p>
          <span className="min-w-11" />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{FUNDING_COPY.entryHelp}</p>
          <p className="text-sm text-muted">{FUNDING_COPY.prizeHelp}</p>
          <label className="text-sm font-bold text-ink">Title</label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
          <label className="text-sm font-bold text-ink">Task</label>
          <p className="text-xs text-muted">What people do — the action they check in for.</p>
          <Input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Run 1 mile"
          />
          <label className="text-sm font-bold text-ink">Rule</label>
          <p className="text-xs text-muted">
            Optional. A constraint on the task (separate days, min minutes, or a custom limit). Not another task.
          </p>
          <Input
            value={constraint}
            onChange={(event) => setConstraint(event.target.value)}
            placeholder="e.g. Check-ins must be on separate calendar days"
          />
          <label className="text-sm font-bold text-ink">{FUNDING_COPY.entryFee} $</label>
          <Input
            type="number"
            min={0}
            value={entryFee}
            onChange={(event) => setEntryFee(Math.max(Number(event.target.value) || 0, 0))}
          />
          <label className="text-sm font-bold text-ink">{FUNDING_COPY.hostContribution} $</label>
          <Input
            type="number"
            min={0}
            value={hostAdd}
            onChange={(event) => setHostAdd(Math.max(Number(event.target.value) || 0, 0))}
          />
          <p className="text-sm text-muted">{FUNDING_COPY.hostHelp}</p>
          {error ? <p className="text-sm text-[#9A3B3B]">{error}</p> : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-bg px-5 pt-2" style={{ paddingBottom: footerPad }}>
        <Button type="button" disabled={busy} onClick={() => void publish()}>
          Publish
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
          'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, proofs, proof_type, proof_requirements, min_minutes, days_required, target_count, starts_at, ends_at, buy_in_amount, prize_pool, prize_structure, currency, distributed_at, created_by, creator_contribution',
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
      const hosted = await supabase
        .from('challenges')
        .select(
          'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, proofs, days_required, buy_in_amount, prize_pool, currency, created_by, creator_contribution',
        )
        .eq('created_by', userId)
        .eq('is_official', false)
        .order('created_at', { ascending: false })
        .limit(12);
      const ids = (mine.data ?? []).map((row) => String((row as { challenge_id: string }).challenge_id));
      let joined: ChallengeRow[] = [];
      if (ids.length) {
        const extra = await supabase
          .from('challenges')
          .select(
            'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, proofs, days_required, buy_in_amount, prize_pool, currency, created_by, creator_contribution',
          )
          .in('id', ids);
        joined = (extra.data ?? []) as ChallengeRow[];
      }
      const seen = new Set<string>();
      setRows(
        [
          ...((hosted.data ?? []) as ChallengeRow[]),
          ...((official.data ?? []) as ChallengeRow[]),
          ...joined,
        ].filter((row) => {
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
          <button
            type="button"
            className="min-h-11 text-sm font-bold text-teal"
            onClick={() => go('/challenges/create/')}>
            New
          </button>
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
              {Number(row.buy_in_amount) > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {FUNDING_COPY.entryFee} {formatFundingAmount(row.buy_in_amount, row.currency)}
                </p>
              ) : null}
            </Card>
          </button>
        ))}
        {rows.length === 0 && !error ? <Bob line={CHECKIN_BOB.empty} /> : null}
      </div>
    </div>
  );
}

function ChallengeScreen({ challengeId, userId }: { challengeId: string; userId: string }) {
  const [tab, setTab] = useState<'overview' | 'board' | 'feed'>(() => {
    const next = queryFlag('tab');
    if (next === 'board' || next === 'feed' || next === 'overview') {
      return next;
    }
    return queryFlag('receipt') === '1' ? 'board' : 'overview';
  });
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
  const [caughtUpIds, setCaughtUpIds] = useState<string[]>([]);
  const [hostAdd, setHostAdd] = useState(1);
  const [walletBucks, setWalletBucks] = useState(0);

  async function load() {
    const ch = await supabase
      .from('challenges')
      .select(
        'id, title, status, is_official, series_id, category, challenge_type, privacy_mode, scoring_method, scoring_config, comparable_points_config, proofs, proof_type, proof_requirements, min_minutes, days_required, target_count, starts_at, ends_at, buy_in_amount, prize_pool, prize_structure, currency, distributed_at, is_unlimited, created_by, creator_contribution',
      )
      .eq('id', challengeId)
      .maybeSingle();
    const next = (ch.data as ChallengeRow | null) ?? null;
    setChallenge(next);
    const part = await supabase
      .from('challenge_participants')
      .select('user_id, days_completed, status, points, eliminated_at, buy_in_paid')
      .eq('challenge_id', challengeId);
    const rows = (part.data ?? []) as ParticipantRow[];
    const ids = rows.map((row) => row.user_id);
    const names =
      ids.length > 0
        ? await supabase.from('profiles_public').select('id, display_name, username').in('id', ids)
        : { data: [] as Array<{ id: string; display_name?: string | null; username?: string | null }> };
    const byId = new Map(
      ((names.data ?? []) as Array<{ id: string; display_name?: string | null; username?: string | null }>).map(
        (row) => [row.id, row],
      ),
    );
    setRoster(
      rows.map((row) => ({
        ...row,
        display_name: byId.get(row.user_id)?.display_name ?? null,
        username: byId.get(row.user_id)?.username ?? null,
      })),
    );
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
    const today = new Date().toISOString().slice(0, 10);
    const submitted = await supabase
      .from('challenge_checkins')
      .select('user_id, period_key, status')
      .eq('challenge_id', challengeId)
      .eq('status', 'submitted');
    setCaughtUpIds(
      [
        ...new Set(
          ((submitted.data ?? []) as Array<{ user_id: string; period_key?: string | null }>)
            .filter((row) => !row.period_key || String(row.period_key).startsWith(today))
            .map((row) => row.user_id),
        ),
      ],
    );
    const wallet = await supabase.from('profiles').select('bucks').eq('id', userId).maybeSingle();
    setWalletBucks(Number((wallet.data as { bucks?: number } | null)?.bucks ?? 0));
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
        { event: '*', schema: 'public', table: 'challenge_checkins', filter: `challenge_id=eq.${challengeId}` },
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
    const entry = Number(challenge?.buy_in_amount) || 0;
    const shortfall =
      String(challenge?.currency) === 'bucks' ? joinShortfall(walletBucks, entry) : 0;
    if (shortfall > 0) {
      requestWebTopUp({ amount: shortfall, returnChallengeId: challengeId });
      return;
    }
    setBusy(true);
    setError(null);
    const { error: joinError } = await supabase.rpc('join_challenge', { p_challenge_id: challengeId });
    if (joinError) {
      const raw = joinError.message.toLowerCase();
      if (raw.includes('insufficient')) {
        requestWebTopUp({
          amount: Math.max(joinShortfall(walletBucks, entry), 1),
          returnChallengeId: challengeId,
        });
      } else {
        setError(joinError.message);
      }
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
              <p className="mt-3 text-sm font-bold text-ink">
                {FUNDING_COPY.prize} {formatFundingAmount(challenge.prize_pool, challenge.currency)}
              </p>
              {Number(challenge.buy_in_amount) > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {FUNDING_COPY.entryFee} {formatFundingAmount(challenge.buy_in_amount, challenge.currency)}
                </p>
              ) : null}
              {Number(challenge.creator_contribution) > 0 ? (
                <p className="mt-1 text-sm text-muted">
                  {FUNDING_COPY.hostContribution}{' '}
                  {formatFundingAmount(challenge.creator_contribution, challenge.currency)}
                </p>
              ) : null}
              {canHostTopUp({
                status: challenge.status,
                isHost: challenge.created_by === userId,
                official: Boolean(challenge.is_official),
              }) ? (
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={hostAdd}
                    onChange={(event) => setHostAdd(Math.max(Number(event.target.value) || 1, 1))}
                    className="h-11 w-24"
                  />
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        const need =
                          String(challenge.currency) === 'bucks'
                            ? joinShortfall(walletBucks, hostAdd)
                            : 0;
                        if (need > 0) {
                          requestWebTopUp({ amount: need, returnChallengeId: challengeId });
                          return;
                        }
                        setBusy(true);
                        setError(null);
                        try {
                          await topUpChallengePrizeWithClient(supabase, {
                            challengeId,
                            amount: hostAdd,
                          });
                          await load();
                        } catch (err) {
                          const raw = err instanceof Error ? err.message.toLowerCase() : '';
                          if (raw.includes('insufficient')) {
                            requestWebTopUp({
                              amount: Math.max(joinShortfall(walletBucks, hostAdd), 1),
                              returnChallengeId: challengeId,
                            });
                          } else {
                            setError(err instanceof Error ? err.message : FUNDING_COPY.insufficient);
                          }
                        }
                        setBusy(false);
                      })();
                    }}>
                    {FUNDING_COPY.addToPrize}
                  </Button>
                </div>
              ) : null}
            </Card>
            <ChallengeBoard
              status={challenge.status}
              prizePool={challenge.prize_pool}
              currency={challenge.currency}
              participants={roster}
              completedUserIds={caughtUpIds}
              settlement={
                settlement
                  ? {
                      winner_count: settlement.settlement.winner_count,
                      prize_pool: settlement.settlement.prize_pool,
                      payouts: settlement.payouts,
                    }
                  : null
              }
              viewerId={userId}
              joined={joined}
              variant="compact"
              corporate={corporate}
              pointsBoard={usesPointsBoard(challenge)}
              onOpenBoard={() => setTab('board')}
            />
            {challenge.status === 'settling' && !settlement ? (
              <Card>
                <p className="text-[15px] font-bold text-ink">Settling</p>
                <p className="mt-1 text-sm text-muted">
                  Splitting the prize among remaining finishers. This updates on its own.
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
                {(() => {
                  const funding = fundingFromChallenge(challenge);
                  const lines = fundingReceiptLines({
                    funding,
                    viewerEntryFee: roster.find((row) => row.user_id === userId)?.buy_in_paid ?? 0,
                    viewerPayout: settlement.payouts.find((row) => row.user_id === userId)?.amount,
                    winnerCount: settlement.settlement.winner_count,
                    spectator: !joined,
                  });
                  return (
                    <div className="mt-2 flex flex-col gap-1">
                      {lines.entryFee ? <p className="text-sm text-muted">{lines.entryFee}</p> : null}
                      {lines.hostContribution ? (
                        <p className="text-sm text-muted">{lines.hostContribution}</p>
                      ) : null}
                      {lines.entryFeesCollected ? (
                        <p className="text-sm text-muted">{lines.entryFeesCollected}</p>
                      ) : null}
                      <p className="text-sm text-muted">{lines.remainingFinishers}</p>
                    </div>
                  );
                })()}
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
          <ChallengeBoard
            status={challenge.status}
            prizePool={challenge.prize_pool}
            currency={challenge.currency}
            participants={roster}
            completedUserIds={caughtUpIds}
            settlement={
              settlement
                ? {
                    winner_count: settlement.settlement.winner_count,
                    prize_pool: settlement.settlement.prize_pool,
                    payouts: settlement.payouts,
                  }
                : null
            }
            viewerId={userId}
            joined={joined}
            showReceipt={queryFlag('receipt') === '1'}
            corporate={corporate}
            pointsBoard={usesPointsBoard(challenge)}
          />
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
              {participateLabel({
                amount: Number(challenge.buy_in_amount) || 0,
                currency: challenge.currency,
              })}
            </Button>
            {canRefundEntryFee(challenge.status) ? (
              <p className="text-center text-xs text-muted">{FUNDING_COPY.refundBeforeLive}</p>
            ) : (
              <p className="text-center text-xs text-muted">{FUNDING_COPY.committedLive}</p>
            )}
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
            {canRefundEntryFee(challenge.status) ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void leave()}>
                Leave · refund
              </Button>
            ) : null}
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
  const footerPad = useViewportBottomPad(20);

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
      if (kind === 'missing') {
        window.alert('Posted. Add the rest when you have them.');
        go(`/challenges/${challengeId}/`);
        setBusy(false);
        return;
      }
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
  const filledCount = proofs.filter((proof) => partSatisfies(proof, checkin?.proof_parts[proof.id])).length;
  const honorOnly = proofsAreHonorOnly(proofs);
  const canSend = (honorOnly || filledCount >= 1) && phase !== 'submitted' && !busy;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-28 pt-4">
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
        <div className="mt-5 flex flex-col gap-3">
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
        {error ? <p className="mt-3 text-sm text-[#9A3B3B]">{error}</p> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-bg px-4 pt-2" style={{ paddingBottom: footerPad }}>
        <Button type="button" disabled={!canSend} onClick={() => void submit()} style={{ opacity: canSend ? 1 : 0.38 }}>
          Submit
        </Button>
      </div>
    </div>
  );
}
