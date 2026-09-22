import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { officialBob } from '@/copy/officialBob';
import {
  challengeInviteShareUrl,
  challengePublicShareUrl,
  needsInviteShareLink,
} from '@/lib/challengeInviteShare';

export { challengeInviteShareUrl, challengePublicShareUrl, needsInviteShareLink };

export function challengeShareUrl(challengeId: string): string {
  return challengePublicShareUrl(challengeId);
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
