import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { isCalloutFighter, calloutRematchHref } from '@/lib/callouts';
import type { Callout } from '@/lib/types';

export function CalloutRematchButton({
  callout,
  me,
}: {
  callout?: Callout | null;
  me?: string | null;
}) {
  const router = useRouter();
  if (!callout || callout.status !== 'settled' || !isCalloutFighter(callout, me)) {
    return null;
  }
  return (
    <Button
      title="Rematch"
      size="lg"
      onPress={() => router.push(calloutRematchHref(callout.id) as never)}
    />
  );
}
