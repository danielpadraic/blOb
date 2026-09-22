import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useAcceptChallengeInvite, useDeclineChallengeInvite } from '@/hooks/useChallengeInvites';
import {
  clearPendingInviteToken,
  stashPendingInviteToken,
} from '@/lib/challengeInvites';
import { challengeDetailHref } from '@/lib/routes';
import { getInviteAcceptMessage } from '@/utils/errors';

export default function InviteTokenScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.trim() ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const { path } = useMyProfile();
  const accept = useAcceptChallengeInvite();
  const decline = useDeclineChallengeInvite();
  const [actionError, setActionError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const busy = accept.isPending || decline.isPending;

  useEffect(() => {
    if (token) {
      void stashPendingInviteToken(token);
    }
  }, [token]);

  function goToChallenge(challengeId: string) {
    void clearPendingInviteToken();
    router.replace(challengeDetailHref(challengeId, 'lobby', null, { tab: 'overview' }));
  }

  function runAccept() {
    if (!token || busy) {
      return;
    }
    setActionError(null);
    accept.mutate(token, {
      onSuccess: (result) => {
        goToChallenge(result.challenge_id);
      },
      onError: (error) => {
        setActionError(getInviteAcceptMessage(error));
      },
    });
  }

  useEffect(() => {
    if (!token || !user || path !== 'app' || autoStarted.current) {
      return;
    }
    autoStarted.current = true;
    setActionError(null);
    accept.mutate(token, {
      onSuccess: (result) => {
        goToChallenge(result.challenge_id);
      },
      onError: (error) => {
        setActionError(getInviteAcceptMessage(error));
      },
    });
  }, [token, user, path, accept]);

  function onDecline() {
    if (!token || busy) {
      return;
    }
    Alert.alert('Decline this invite?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          setActionError(null);
          decline.mutate(token, {
            onSuccess: () => {
              void clearPendingInviteToken();
              Alert.alert('', 'Invite declined');
              router.replace('/challenges');
            },
            onError: (error) => {
              setActionError(getInviteAcceptMessage(error));
            },
          });
        },
      },
    ]);
  }

  if (!token) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title="Invite not found"
          body={getInviteAcceptMessage(new Error('invite_not_found'))}
          actionLabel="Go to Lobby"
          onAction={() => router.replace('/challenges')}
        />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <MascotState
          kind="empty"
          title="Sign in to accept"
          body="This invite is waiting for you. Sign in, then we’ll open the challenge."
          actionLabel="Sign in"
          onAction={() => {
            void stashPendingInviteToken(token);
            router.replace('/(auth)/login');
          }}
        />
      </Screen>
    );
  }

  if (path !== 'app') {
    return (
      <Screen>
        <MascotState
          kind="empty"
          title="Finish your profile"
          body="This invite is waiting for you. Finish your profile, then we’ll open the challenge."
          actionLabel="Finish profile"
          onAction={() => {
            void stashPendingInviteToken(token);
            router.replace('/onboarding/profile-setup');
          }}
        />
      </Screen>
    );
  }

  if (!actionError) {
    return (
      <Screen>
        <MascotState
          kind="loading"
          title="Opening your invite"
          body="Accepting the invite — you’ll still Join to enter."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4 px-2">
        <MascotState
          kind={actionError ? 'error' : 'empty'}
          title={actionError ? 'Couldn’t use that invite' : 'You’re invited'}
          body={
            actionError ??
            'Accept this invite to open the challenge. Accepting does not join — you’ll Join on Details.'
          }
          compact
        />
        <Button title="Accept" loading={accept.isPending} disabled={busy} onPress={runAccept} />
        <Button title="Decline" variant="outline" loading={decline.isPending} disabled={busy} onPress={onDecline} />
        <Button title="Go to Lobby" variant="ghost" disabled={busy} onPress={() => router.replace('/challenges')} />
      </View>
    </Screen>
  );
}
