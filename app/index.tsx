import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useMyProfile } from '@/hooks/useProfile';
import { TABS_HREF } from '@/lib/routes';

export default function Index() {
  const { path } = useMyProfile();

  if (path === 'boot') {
    return null;
  }

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'setup') {
    return <Redirect href={'/onboarding' as Href} />;
  }

  return <Redirect href={TABS_HREF} />;
}
