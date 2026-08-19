import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { BootScreen } from '@/components/ui/BootScreen';
import { useMyProfile } from '@/hooks/useProfile';
import { hasAcceptedLegal } from '@/utils/validators';

export default function OnboardingIndex() {
  const { profile, path } = useMyProfile();

  if (path === 'boot') {
    return <BootScreen />;
  }

  if (!hasAcceptedLegal(profile)) {
    return <Redirect href={'/onboarding/legal' as Href} />;
  }

  return <Redirect href="/onboarding/profile-setup" />;
}
