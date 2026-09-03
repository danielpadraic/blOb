import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useNavigation } from 'expo-router';

import {
  bindChallengesStack,
  challengesStackEpoch,
  subscribeChallengesEpoch,
} from '@/lib/challengeNav';

/** Keeps a handle on the Lobby stack so Home can drop leftover `[id]` / submit. */
export function BindChallengesStack() {
  const navigation = useNavigation();
  const [epoch, setEpoch] = useState(challengesStackEpoch);
  useEffect(() => subscribeChallengesEpoch(setEpoch), []);
  useEffect(() => bindChallengesStack(navigation as never), [epoch, navigation]);
  return null;
}

/** Remount the Lobby stack when Home bumps the epoch so leftover Live/submit cannot survive. */
export function ChallengesStackHost({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(challengesStackEpoch);
  useEffect(() => subscribeChallengesEpoch(setEpoch), []);
  return <Fragment key={epoch}>{children}</Fragment>;
}
