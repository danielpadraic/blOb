import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import type { LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { asLoggableList } from '@/lib/loggable';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

export type QuickActionId = 'log' | 'create' | 'join' | 'post' | 'story' | 'reel' | 'coins' | 'callout';

type QuickActionSheetProps = {
  visible: boolean;
  loggable?: LoggableChallenge | LoggableChallenge[] | null;
  onClose: () => void;
  onAction: (id: QuickActionId, challenge?: LoggableChallenge) => void;
};

type ActionRow = {
  id: QuickActionId;
  glyph: string;
  label: string;
  hint?: string;
};

const ROW_MIN = 44;
const LIST_PAD = 20;
const DISMISS_Y = 88;

export function QuickActionSheet({
  visible,
  loggable,
  onClose,
  onAction,
}: QuickActionSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetMax = Math.round(windowHeight * 0.7);
  const translateY = useSharedValue(0);
  const [handleH, setHandleH] = useState(72);
  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [step, setStep] = useState<'root' | 'post' | 'log'>('root');
  const loggables = asLoggableList(loggable);
  const only = loggables.length === 1 ? loggables[0] : null;

  const rows: ActionRow[] =
    step === 'post'
      ? [
          { id: 'story', glyph: '📷', label: copy('wave.noun') },
          { id: 'reel', glyph: '🎬', label: copy('round.noun') },
          { id: 'post', glyph: '✍️', label: 'Feed' },
        ]
      : step === 'log'
        ? []
        : [
            ...(loggables.length === 1 && only
              ? [
                  {
                    id: 'log' as const,
                    glyph: '✅',
                    label: only.ctaTitle ?? copy('checkin.begin'),
                    hint: only.title,
                  },
                ]
              : loggables.length > 1
                ? [
                    {
                      id: 'log' as const,
                      glyph: '✅',
                      label: 'Check In',
                      hint: `${loggables.length} open`,
                    },
                  ]
                : []),
            { id: 'post', glyph: '✍️', label: 'Post' },
          ];

  const listMax = Math.max(ROW_MIN + LIST_PAD, sheetMax - handleH);
  const canScroll = contentH > listH + 1;

  useEffect(() => {
    if (!visible) {
      translateY.value = 0;
      setStep('root');
    }
  }, [translateY, visible]);

  const handlePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (event.translationY > DISMISS_Y || event.velocityY > 900) {
            runOnJS(onClose)();
            return;
          }
          translateY.value = withTiming(0, { duration: 180 });
        }),
    [onClose, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  function onRow(id: QuickActionId, challenge?: LoggableChallenge) {
    if (step === 'root' && id === 'post') {
      setStep('post');
      return;
    }
    if (step === 'root' && id === 'log' && loggables.length > 1) {
      setStep('log');
      return;
    }
    if (id === 'log') {
      const picked = challenge ?? only ?? undefined;
      if (!picked) {
        return;
      }
      onAction('log', picked);
      return;
    }
    onAction(id);
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} zIndex={120}>
      <Animated.View
        style={[
          {
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 4,
            maxHeight: sheetMax,
            flexShrink: 1,
            width: '100%',
          },
          sheetStyle,
        ]}>
        <GestureDetector gesture={handlePan}>
          <View
            onLayout={(event) => setHandleH(event.nativeEvent.layout.height)}
            style={{ alignItems: 'center', minHeight: ROW_MIN, paddingBottom: 12, paddingTop: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close quick actions"
            accessibilityHint="Drag down to close">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            <View className="mt-3 w-full flex-row items-center" style={{ minHeight: 44 }}>
              <View style={{ flex: 1, alignItems: 'flex-start', justifyContent: 'center', minHeight: 44 }}>
                {step === 'post' || step === 'log' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={() => setStep('root')}
                    hitSlop={8}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
                      Back
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-lg font-bold text-charcoal" numberOfLines={1}>
                  {step === 'post' ? 'Post' : step === 'log' ? 'Check In' : 'Quick actions'}
                </AppText>
              </View>
              <View style={{ flex: 1, minHeight: 44 }} />
            </View>
          </View>
        </GestureDetector>

        <ScrollView
          style={{ maxHeight: listMax, flexShrink: 1 }}
          contentContainerStyle={{ paddingBottom: LIST_PAD, flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={canScroll}
          scrollEnabled={canScroll}
          bounces={canScroll}
          alwaysBounceVertical={false}
          overScrollMode={canScroll ? 'auto' : 'never'}
          onLayout={(event) => setListH(event.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentH(h)}>
          <View
            style={{
              borderRadius: THEME.radius,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              overflow: 'hidden',
            }}>
            {step === 'log'
              ? loggables.map((challenge, index) => (
                  <Pressable
                    key={challenge.id}
                    accessibilityRole="button"
                    accessibilityLabel={challenge.title}
                    onPress={() => onRow('log', challenge)}
                    className="flex-row items-center px-4"
                    style={{
                      minHeight: ROW_MIN,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: THEME.border,
                    }}>
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: THEME.surface2 }}>
                      <AppText className="text-[18px]">✅</AppText>
                    </View>
                    <View className="ml-3 flex-1">
                      <AppText className="font-semibold text-charcoal">{challenge.title}</AppText>
                      {challenge.statusLine ? (
                        <AppText className="mt-0.5 text-sm text-muted" numberOfLines={1}>
                          {challenge.statusLine}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText className="text-muted">›</AppText>
                  </Pressable>
                ))
              : rows.map((row, index) => (
                  <Pressable
                    key={`${step}-${row.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                    onPress={() => onRow(row.id)}
                    className="flex-row items-center px-4"
                    style={{
                      minHeight: ROW_MIN,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: THEME.border,
                    }}>
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: THEME.surface2 }}>
                      <AppText className="text-[18px]">{row.glyph}</AppText>
                    </View>
                    <View className="ml-3 flex-1">
                      <AppText className="font-semibold text-charcoal">{row.label}</AppText>
                      {row.hint ? (
                        <AppText className="mt-0.5 text-sm text-muted" numberOfLines={1}>
                          {row.hint}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText className="text-muted">›</AppText>
                  </Pressable>
                ))}
          </View>
        </ScrollView>
      </Animated.View>
    </ChromeOverlay>
  );
}
