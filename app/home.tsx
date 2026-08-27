import { Redirect } from 'expo-router';

import { TABS_HREF } from '@/lib/routes';

export default function HomeAlias() {
  return <Redirect href={TABS_HREF} />;
}
