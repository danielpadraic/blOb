import { Link, Stack } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { TABS_HREF } from '@/lib/routes';

export default function NotFoundScreen() {
  const tone = useCopyTone();
  return (
    <>
      <Stack.Screen options={{ title: copy('notFound.title', tone) }} />
      <Screen>
        <MascotState kind="error" title={copy('notFound.title', tone)} />
        <Link href={TABS_HREF} className="items-center">
          <AppText className="text-center font-semibold text-coral">Go home</AppText>
        </Link>
      </Screen>
    </>
  );
}
