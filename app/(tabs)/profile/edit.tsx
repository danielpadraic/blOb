import { EditProfileForm } from '@/components/profile/EditProfileForm';
import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useMyProfile } from '@/hooks/useProfile';

export default function EditProfileScreen() {
  const { profile, isLoading, error, refetch } = useMyProfile();

  if (isLoading) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState kind="loading" title="Loading profile" compact />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={TAB_ROOT_EDGES}>
        <MascotState
          kind="error"
          title="Couldn’t load your profile"
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
