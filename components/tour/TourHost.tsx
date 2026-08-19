import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { useTour } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { completeTutorial } from '@/lib/legal';
import { TOUR_STEPS } from '@/lib/tour';
import { THEME, themeShadow } from '@/lib/theme';

type TourHostProps = {
  onFinished: () => void;
};

export function TourHost({ onFinished }: TourHostProps) {
  const tour = useTour();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const rect = tour.rectFor(step?.target ?? null);

  useEffect(() => {
    if (!tour.active || !step?.href) {
      return;
    }
    router.navigate(step.href);
  }, [router, step?.href, step?.id, tour.active]);

  const finish = useCallback(async () => {
    try {
      await completeTutorial();
    } catch {
      // Do not block Feed if the write fails this session.
    }
    tour.stop();
    onFinished();
  }, [onFinished, tour]);

  if (!tour.active || !step) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 200,
        elevation: 200,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip tour"
        onPress={() => void finish()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(16, 19, 18, 0.45)',
        }}
      />
      {rect ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: rect.y - 8,
            left: rect.x - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: THEME.accent,
            backgroundColor: 'transparent',
          }}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 88,
        }}>
        <View
          style={{
            backgroundColor: THEME.surface,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: THEME.border,
            paddingHorizontal: 18,
            paddingTop: 16,
            paddingBottom: 16,
            ...themeShadow('card'),
          }}>
          <View className="items-center">
            <BlobMascot variant="wave" size={92} motion="float" />
          </View>
          <AppText className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {index + 1} / {TOUR_STEPS.length}
          </AppText>
          <AppText className="mt-1 text-center text-[18px] font-extrabold text-charcoal">
            {step.title}
          </AppText>
          <AppText className="mt-2 text-center text-[14px] leading-6 text-muted">{step.body}</AppText>
          <View className="mt-4 flex-row gap-2">
            <Button
              title="Back"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onPress={() => setIndex((current) => Math.max(0, current - 1))}
              className="flex-1"
            />
            <Button
              title={index === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
              size="sm"
              onPress={() => {
                if (index === TOUR_STEPS.length - 1) {
                  void finish();
                  return;
                }
                setIndex((current) => current + 1);
              }}
              className="flex-1"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void finish()}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-center text-sm font-semibold" style={{ color: THEME.accent }}>
              Skip tour
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
