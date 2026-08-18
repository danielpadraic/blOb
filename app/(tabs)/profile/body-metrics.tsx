import { useRouter } from 'expo-router';

import { BodyMetricsForm } from '@/components/profile/BodyMetricsForm';
import { BodyFatFramePreload } from '@/components/profile/MorphingBlob';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useMyProfile } from '@/hooks/useProfile';
import { useCopyTone } from '@/hooks/useCopy';
import { hasCompletedFitnessHistory } from '@/lib/fitnessProfile';
import { FITNESS_HISTORY_HREF } from '@/lib/routes';
import { copy } from '@/lib/copy';

export default function BodyMetricsScreen() {
  const router = useRouter();
  const { profile, isLoading, error, refetch } = useMyProfile();
  const tone = useCopyTone();

  function goNext() {
    if (!hasCompletedFitnessHistory(profile)) {
      router.replace(FITNESS_HISTORY_HREF);
      return;
    }
    leave();
  }

  function leave() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/feed');
  }

  function skip() {
    if (!hasCompletedFitnessHistory(profile) && !router.canGoBack()) {
      router.replace(FITNESS_HISTORY_HREF);
      return;
    }
    leave();
  }

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <BodyFatFramePreload />
        <MascotState kind="loading" title={copy('profile.loading', tone)} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <BodyFatFramePreload />
        <MascotState
          kind="error"
          title={copy('profile.error')}
          body={error instanceof Error ? error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={TAB_ROOT_EDGES}>
      <BodyFatFramePreload />
      <BodyMetricsForm profile={profile} onSkip={skip} afterSave={goNext} />
    </Screen>
  );
}
