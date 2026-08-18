import { useRouter } from 'expo-router';

import { FitnessHistoryForm } from '@/components/profile/FitnessHistoryForm';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useMyProfile } from '@/hooks/useProfile';

export default function FitnessHistoryScreen() {
  const router = useRouter();
  const { profile, isLoading, error, refetch } = useMyProfile();

  function skip() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/feed');
  }

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState kind="loading" title="Finding your blob" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState
          kind="error"
          title="Couldn’t load fitness history"
          body={error instanceof Error ? error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={TAB_ROOT_EDGES}>
      <FitnessHistoryForm profile={profile} onSkip={skip} />
    </Screen>
  );
}
