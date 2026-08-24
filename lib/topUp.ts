import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';
import {
  createTopUpSessionWithClient,
  waitForTopUpCreditWithClient,
  type TopUpResult,
} from '@/lib/topup';

export type { TopUpRequest } from '@/lib/topup';

export function topUpReturnUrl(challengeId?: string, returnCreate?: boolean): string {
  if (returnCreate || !challengeId) {
    return Linking.createURL('challenges/create', {
      queryParams: { funded: '1' },
    });
  }
  return Linking.createURL(`challenges/${challengeId}`, {
    queryParams: { funded: '1' },
  });
}

export function topUpCancelUrl(challengeId?: string, returnCreate?: boolean): string {
  if (returnCreate || !challengeId) {
    return Linking.createURL('challenges/create', {
      queryParams: { funded: '0' },
    });
  }
  return Linking.createURL(`challenges/${challengeId}`, {
    queryParams: { funded: '0' },
  });
}

export async function startCardTopUp(input: {
  amount: number;
  challengeId?: string;
  returnCreate?: boolean;
}): Promise<TopUpResult> {
  const successUrl = `${topUpReturnUrl(input.challengeId, input.returnCreate)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = topUpCancelUrl(input.challengeId, input.returnCreate);
  const session = await createTopUpSessionWithClient(supabase, {
    amount: input.amount,
    successUrl,
    cancelUrl,
  });
  if (Platform.OS === 'web') {
    window.location.assign(session.url);
    return { status: 'pending' };
  }
  const result = await WebBrowser.openAuthSessionAsync(session.url, topUpReturnUrl(input.challengeId, input.returnCreate));
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { status: 'canceled' };
  }
  if (result.type !== 'success') {
    return { status: 'failed', code: 'network' };
  }
  return waitForTopUpCreditWithClient(supabase, { sessionId: session.sessionId });
}

/** @deprecated Use startCardTopUp */
export const startWebCardTopUp = startCardTopUp;
