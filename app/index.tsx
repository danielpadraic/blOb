import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useMyProfile } from '@/hooks/useProfile';
import { TABS_HREF } from '@/lib/routes';

export default function Index() {
  const { path } = useMyProfile();

  if (path === 'auth') {
    return <Redirect href="/(auth)/login" />;
  }

  if (path === 'app') {
    return <Redirect href={TABS_HREF} />;
  }

  return <Redirect href={'/onboarding' as Href} />;
}
