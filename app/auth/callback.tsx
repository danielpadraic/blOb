import { Redirect } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { TABS_HREF } from '@/lib/routes';

export default function AuthCallbackScreen() {
  const { isLoading } = useAuth();
  const { isBootstrapping, path } = useMyProfile();

  if (isLoading || isBootstrapping || path === 'boot') {
    return (
      <Screen>
        <MascotState kind="loading" title="Signing you in" body="Hang tight — your blob is almost ready." />
      </Screen>
    );
  }

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'setup') {
    return <Redirect href="/onboarding/profile-setup" />;
  }

  return <Redirect href={TABS_HREF} />;
}
