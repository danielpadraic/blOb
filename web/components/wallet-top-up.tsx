'use client';

import { useEffect, useState } from 'react';

import {
  TOPUP_COPY,
  classifyTopUpError,
  createTopUpSessionWithClient,
  quoteTopUp,
  topUpErrorCopy,
  waitForTopUpCreditWithClient,
  type TopUpRequest,
} from '@/lib/topup';
import { Button } from '~/components/ui/button';
import { supabase } from '~/lib/supabase';

export function requestWebTopUp(request: TopUpRequest) {
  window.dispatchEvent(new CustomEvent('blob-topup', { detail: request }));
}

export function requestWebWallet() {
  window.dispatchEvent(new CustomEvent('blob-wallet'));
}

function returnUrls(request: TopUpRequest): { successUrl: string; cancelUrl: string } {
  const origin = window.location.origin;
  const path = request.returnCreate
    ? '/challenges/create/'
    : request.returnChallengeId
      ? `/challenges/${request.returnChallengeId}/`
      : window.location.pathname;
  return {
    successUrl: `${origin}${path}?funded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${path}?funded=0`,
  };
}

export function WalletTopUpHost() {
  const [request, setRequest] = useState<TopUpRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<'error' | 'pending' | 'success' | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<TopUpRequest>).detail;
      if (detail && Number(detail.amount) > 0) {
        setRequest(detail);
        setMessage(null);
        setKind(null);
      }
    };
    window.addEventListener('blob-topup', onOpen);
    return () => window.removeEventListener('blob-topup', onOpen);
  }, []);

  useEffect(() => {
    const funded = new URLSearchParams(window.location.search).get('funded');
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (funded === '0') {
      setRequest((current) => current ?? { amount: 1 });
      setKind('error');
      setMessage(TOPUP_COPY.canceled);
      return;
    }
    if (funded !== '1' || !sessionId) {
      return;
    }
    setRequest((current) => current ?? { amount: 1 });
    setKind('pending');
    setMessage(TOPUP_COPY.processing);
    void waitForTopUpCreditWithClient(supabase, { sessionId }).then((result) => {
      if (result.status === 'succeeded') {
        setKind('success');
        setMessage(TOPUP_COPY.added(result.amount || 1));
        window.dispatchEvent(new Event('blob-wallet-refresh'));
        return;
      }
      if (result.status === 'failed') {
        setKind('error');
        setMessage(topUpErrorCopy(result.code));
        return;
      }
      if (result.status === 'canceled') {
        setKind('error');
        setMessage(TOPUP_COPY.canceled);
        return;
      }
      setKind('pending');
      setMessage(TOPUP_COPY.processing);
    });
  }, []);

  if (!request) {
    return null;
  }

  const quote = quoteTopUp(request.amount);

  async function onPay() {
    if (!request || !quote) {
      setKind('error');
      setMessage(TOPUP_COPY.amountLimit);
      return;
    }
    setBusy(true);
    setMessage(null);
    setKind(null);
    try {
      const urls = returnUrls(request);
      const session = await createTopUpSessionWithClient(supabase, {
        amount: quote.creditAmount,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      });
      window.location.assign(session.url);
    } catch (error) {
      setKind('error');
      setMessage(topUpErrorCopy(classifyTopUpError(error)));
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/20">
      <div className="w-full rounded-t-[22px] bg-bg px-5 pb-6 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-center text-lg font-bold text-ink">
          {TOPUP_COPY.title(quote?.creditAmount ?? request.amount)}
        </h2>
        <p className="mt-1 text-center text-[13px] leading-5 text-muted">
          {request.returnCreate
            ? TOPUP_COPY.bodyCreate(quote?.creditAmount ?? request.amount)
            : request.returnChallengeId
              ? TOPUP_COPY.bodyChallenge(quote?.creditAmount ?? request.amount)
              : TOPUP_COPY.body(quote?.creditAmount ?? request.amount)}
        </p>
        <p className="mt-2 text-center text-[13px] leading-5 text-muted">{TOPUP_COPY.feeNone}</p>
        {message ? (
          <p className={`mt-3 text-center text-[13px] ${kind === 'error' ? 'text-[#9A3B3B]' : 'text-ink'}`}>
            {message}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" disabled={busy} onClick={() => void onPay()}>
            {TOPUP_COPY.pay(quote?.chargeAmount ?? request.amount)}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setRequest(null)}>
            {TOPUP_COPY.notNow}
          </Button>
        </div>
      </div>
    </div>
  );
}
