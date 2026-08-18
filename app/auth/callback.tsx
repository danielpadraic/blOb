import { Redirect } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useMyProfile } from '@/hooks/useProfile';
import { copy } from '@/lib/copy';
import { TABS_HREF } from '@/lib/routes';

export default function AuthCallbackScreen() {
  const { isLoading } = useAuth();
  const { isBootstrapping, path } = useMyProfile();
  const tone = useCopyTone();

  if (isLoading || isBootstrapping || path === 'boot') {
    return (
      <Screen>
        <MascotState kind="loading" title={copy('auth.signingIn', tone)} />
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
