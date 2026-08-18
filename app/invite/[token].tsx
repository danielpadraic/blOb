import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useAcceptChallengeInvite } from '@/hooks/useChallengeInvites';
import { stashPendingInviteToken, takePendingInviteToken } from '@/lib/challengeInvites';
import { challengeDetailHref } from '@/lib/routes';
import { getErrorMessage } from '@/utils/errors';

export default function InviteTokenScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.trim() ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const { path } = useMyProfile();
  const accept = useAcceptChallengeInvite();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    if (path !== 'app' || !user) {
      void stashPendingInviteToken(token);
      return;
    }
    started.current = true;
    void takePendingInviteToken();
    accept.mutate(token, {
      onSuccess: (result) => {
        router.replace(challengeDetailHref(result.challenge_id));
      },
    });
  }, [accept, path, router, token, user]);

  if (!token) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title="Invite not found"
          body="That link is missing an invite token."
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
          onAction={() => router.replace('/(auth)/login')}
        />
      </Screen>
    );
  }

  if (accept.isError) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title="Couldn’t accept that invite"
          body={getErrorMessage(accept.error)}
          actionLabel="Go to Lobby"
          onAction={() => router.replace('/challenges')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <MascotState kind="loading" title="Opening invite" body="Checking your access…" />
    </Screen>
  );
}
