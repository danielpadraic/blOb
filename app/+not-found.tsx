import { Link, Stack } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { TABS_HREF } from '@/lib/routes';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Lost blob' }} />
      <Screen>
        <MascotState
          kind="error"
          title="This path doesn’t exist"
          body="Your blob looked everywhere. Head back to the lobby and try another door."
        />
        <Link href={TABS_HREF} className="items-center">
          <AppText className="text-center font-semibold text-coral">Go home</AppText>
        </Link>
      </Screen>
    </>
  );
}
