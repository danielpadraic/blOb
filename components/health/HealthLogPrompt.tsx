import { useRouter, useSegments } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useHealthLogPrompt } from '@/hooks/useHealthLogPrompt';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { checkinSubmitHref, MULTI_CHECKIN_HREF } from '@/lib/routes';
import { formatHealthDuration } from '@/lib/health/proofSummary';
import { THEME, themeShadow } from '@/lib/theme';

export function HealthLogPromptHost() {
  const segments = useSegments();
  const router = useRouter();
  const tone = useCopyTone();
  const prompt = useHealthLogPrompt();

  const onSubmit = (segments as string[]).includes('submit');
  const targets = prompt.targets;
  const visible = Boolean(prompt.workout && targets.length > 0 && !onSubmit);

  if (!visible || !prompt.workout) {
    return null;
  }

  const label = copy('health.prompt', tone, {
    duration: formatHealthDuration(prompt.workout.durationSec),
    activity: prompt.workout.activityLabel,
  });
  // Naming them is the point: the workout only counts for these. With more than one, the hub lets
  // them pick rather than the prompt guessing — guessing is what offered Prayer a pickleball game.
  const names = targets.map((target) => target.title).filter(Boolean).join(' · ');
  const destination =
    targets.length === 1 ? checkinSubmitHref(targets[0].id) : MULTI_CHECKIN_HREF;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 45 }}>
      <View
        className="mx-4 mt-2 flex-row items-center px-4 py-3"
        style={{
          minHeight: 44,
          backgroundColor: THEME.surface,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: THEME.border,
          ...themeShadow('card'),
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => router.push(destination)}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-[15px] font-bold text-charcoal">{label}</AppText>
          <AppText className="mt-0.5 text-sm text-muted" numberOfLines={2}>
            {names}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('health.notNow')}
          onPress={() => void prompt.dismiss()}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText className="text-[13px] font-semibold text-muted">{copy('health.notNow')}</AppText>
        </Pressable>
      </View>
    </View>
  );
}
