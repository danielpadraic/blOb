import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export type TopUpRequest = {
  amount: number;
  returnChallengeId?: string;
  returnCreate?: boolean;
};

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

export async function startWebCardTopUp(input: {
  amount: number;
  challengeId?: string;
  returnCreate?: boolean;
  userId: string;
}): Promise<'success' | 'cancel' | 'unavailable'> {
  const paymentLink = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK?.trim();
  if (!paymentLink) {
    return 'unavailable';
  }
  const join = paymentLink.includes('?') ? '&' : '?';
  const url = `${paymentLink}${join}client_reference_id=${encodeURIComponent(input.userId)}`;
  const returnUrl = topUpReturnUrl(input.challengeId, input.returnCreate);
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return 'success';
  }
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (result.type === 'success') {
    return 'success';
  }
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return 'cancel';
  }
  return 'unavailable';
}
