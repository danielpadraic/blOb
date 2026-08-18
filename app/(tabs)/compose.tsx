import { Redirect } from 'expo-router';

import { TABS_HREF } from '@/lib/routes';

/** Placeholder route so the center tab exists. The + button never navigates here. */
export default function ComposePlaceholderScreen() {
  return <Redirect href={TABS_HREF} />;
}
