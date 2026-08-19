import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useMyProfile } from '@/hooks/useProfile';
import { hasAcceptedLegal } from '@/utils/validators';

export default function OnboardingIndex() {
  const { profile, path } = useMyProfile();

  if (path === 'boot') {
    return null;
  }

  if (!hasAcceptedLegal(profile)) {
    return <Redirect href={'/onboarding/legal' as Href} />;
  }

  return <Redirect href="/onboarding/profile-setup" />;
}
