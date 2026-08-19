import { useSegments, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useState } from 'react';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useHealthLogPrompt } from '@/hooks/useHealthLogPrompt';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function HealthLogPromptHost() {
  const segments = useSegments();
  const router = useRouter();
  const prompt = useHealthLogPrompt();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const onSubmit = (segments as string[]).includes('submit');
  const visible = Boolean(prompt.workout && prompt.challenge && !onSubmit);

  async function onAccept() {
    setError(null);
    try {
      const challengeId = await prompt.accept();
      setConfirm(false);
      if (challengeId) {
        router.replace(`/challenges/${challengeId}?logged=1`);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  if (!visible || !prompt.workout) {
    return null;
  }

  return (
    <>
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
            accessibilityLabel={copy('health.prompt', 'neutral', {
              activityLabel: prompt.workout.activityLabel,
            })}
            onPress={() => {
              setError(null);
              setConfirm(true);
            }}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[15px] font-bold text-charcoal">
              {copy('health.prompt', 'neutral', { activityLabel: prompt.workout.activityLabel })}
            </AppText>
            {prompt.challenge ? (
              <AppText className="mt-0.5 text-sm text-muted">{prompt.challenge.title}</AppText>
            ) : null}
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
      <ChromeOverlay
        visible={confirm}
        onClose={() => {
          if (!prompt.busy) {
            setConfirm(false);
          }
        }}
        align="end">
        <View
          className="px-5 pt-4"
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: 20,
            ...themeShadow('card'),
          }}>
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          </View>
          <AppText className="text-center text-[17px] font-bold text-charcoal">
            {copy('health.confirm', 'neutral', { title: prompt.challenge?.title ?? 'this challenge' })}
          </AppText>
          <AppText className="mt-1 text-center text-sm text-muted">{prompt.workout.activityLabel}</AppText>
          {error ? (
            <AppText className="mt-3 text-center text-sm" style={{ color: THEME.danger }}>
              {error}
            </AppText>
          ) : null}
          <View className="mt-5 gap-3">
            <Button
              title={copy('health.logIt')}
              size="lg"
              loading={prompt.busy}
              disabled={prompt.busy}
              onPress={() => void onAccept()}
            />
            <Button
              title={copy('health.notNow')}
              size="lg"
              variant="ghost"
              disabled={prompt.busy}
              onPress={() => {
                setConfirm(false);
                void prompt.dismiss();
              }}
            />
          </View>
        </View>
      </ChromeOverlay>
    </>
  );
}
