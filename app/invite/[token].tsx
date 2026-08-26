import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useAcceptChallengeInvite, useDeclineChallengeInvite } from '@/hooks/useChallengeInvites';
import { stashPendingInviteToken } from '@/lib/challengeInvites';
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
  const busy = accept.isPending || decline.isPending;

  function onAccept() {
    if (!token || busy) {
      return;
    }
    setActionError(null);
    accept.mutate(token, {
      onSuccess: (result) => {
        router.replace(challengeDetailHref(result.challenge_id));
      },
      onError: (error) => {
        setActionError(getInviteAcceptMessage(error));
      },
    });
  }

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

  if (path !== 'app' || !user) {
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

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4 px-2">
        <MascotState
          kind={actionError ? 'error' : 'empty'}
          title={actionError ? 'Couldn’t use that invite' : 'You’re invited'}
          body={actionError ?? 'Accept to join this challenge, or decline if it’s not for you.'}
          compact
        />
        <Button title="Accept" loading={accept.isPending} disabled={busy} onPress={onAccept} />
        <Button title="Decline" variant="outline" loading={decline.isPending} disabled={busy} onPress={onDecline} />
        <Button title="Go to Lobby" variant="ghost" disabled={busy} onPress={() => router.replace('/challenges')} />
      </View>
    </Screen>
  );
}
