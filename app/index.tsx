import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { BootScreen } from '@/components/ui/BootScreen';
import { useMyProfile } from '@/hooks/useProfile';
import { TABS_HREF } from '@/lib/routes';

export default function Index() {
  const { path } = useMyProfile();

  if (path === 'boot') {
    return <BootScreen />;
  }

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'setup') {
    return <Redirect href={'/onboarding' as Href} />;
  }

  return <Redirect href={TABS_HREF} />;
}
