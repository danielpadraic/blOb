import type { ErrorBoundaryProps } from 'expo-router';

import { ProfileRouteErrorBoundary } from '@/components/profile/ProfileSafeBoundary';
import PublicProfileScreen from '@/components/profile/PublicProfileScreen';

/** Leaf route — Expo web only mounts ErrorBoundary next to a real default, not a re-export. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ProfileRouteErrorBoundary {...props} />;
}

export default function ChallengesPublicProfile() {
  return <PublicProfileScreen />;
}
