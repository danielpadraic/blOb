import { EditProfileForm } from '@/components/profile/EditProfileForm';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useMyProfile } from '@/hooks/useProfile';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';

export default function EditProfileScreen() {
  const { profile, isLoading, error, refetch } = useMyProfile();
  const tone = useCopyTone();

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState kind="loading" title={copy('profile.loading', tone)} compact />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState
          kind="error"
          title={copy('profile.error')}
          body={error instanceof Error ? error.message : 'Try again in a moment.'}
          actionLabel="Retry"
          onAction={() => void refetch()}
          compact
        />
      </Screen>
    );
  }

  return <EditProfileForm profile={profile} />;
}
