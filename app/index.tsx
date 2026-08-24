import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { TABS_HREF } from '@/lib/routes';

export default function Index() {
  const { session, isPasswordRecovery } = useAuth();
  const { path } = useMyProfile();

  if (isPasswordRecovery) {
    return <Redirect href={'/auth/reset-password' as Href} />;
  }

  if (path === 'auth' || (!session && path === 'boot')) {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'app') {
    return <Redirect href={TABS_HREF} />;
  }

  return <Redirect href={'/onboarding' as Href} />;
}
