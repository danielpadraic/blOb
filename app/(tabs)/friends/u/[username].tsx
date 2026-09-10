import type { ErrorBoundaryProps } from 'expo-router';

import { ProfileRouteErrorBoundary } from '@/components/profile/ProfileSafeBoundary';

export { default } from '@/components/profile/PublicProfileScreen';

/** Leaf route export — Expo mounts this, not the tab AppErrorBoundary. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ProfileRouteErrorBoundary {...props} />;
}
