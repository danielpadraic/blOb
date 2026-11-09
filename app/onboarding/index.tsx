import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useMyProfile } from '@/hooks/useProfile';
import { POST_LOGIN_HREF } from '@/lib/routes';
import { hasAcceptedLegal } from '@/utils/validators';

export default function OnboardingIndex() {
  const { profile, path } = useMyProfile();

  if (path === 'app') {
    return <Redirect href={POST_LOGIN_HREF} />;
  }

  if (!hasAcceptedLegal(profile)) {
    return <Redirect href={'/onboarding/legal' as Href} />;
  }

  return <Redirect href="/onboarding/profile-setup" />;
}
