import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { officialBob } from '@/copy/officialBob';

export function challengeShareUrl(challengeId: string): string {
  return Linking.createURL(`challenges/${challengeId}`);
}

export async function shareOfficialChallenge(challengeId: string): Promise<'shared' | 'copied'> {
  const url = challengeShareUrl(challengeId);
  const line = officialBob('loginHeadline');
  const message = `${line}\n${url}`;
  try {
    const result = await Share.share(
      Platform.OS === 'ios' ? { message, url } : { message, title: line },
    );
    if (result.action === Share.dismissedAction) {
      return 'shared';
    }
    return 'shared';
  } catch {
    await Clipboard.setStringAsync(message);
    return 'copied';
  }
}
