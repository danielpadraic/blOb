import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

import { bindChallengesStack } from '@/lib/challengeNav';

/** Keeps a handle on the Lobby stack so Home can drop leftover `[id]` / submit. */
export function BindChallengesStack() {
  const navigation = useNavigation();
  useEffect(() => bindChallengesStack(navigation as never), [navigation]);
  return null;
}
