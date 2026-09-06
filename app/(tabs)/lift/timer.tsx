import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rowPlaySpecFromRounds, useLiftPlay } from '@/components/lift/LiftPlayHost';
import { RoundsEditor } from '@/components/lift/RoundsEditor';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import {
  loadTimerRounds,
  saveTimerRounds,
  timerSummary,
  TIMER_PRESETS,
} from '@/lib/lift/standaloneTimer';
import type { LiftRound } from '@/lib/lift/types';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * The interval timer on its own, off the plus menu.
 *
 * No session, no save, nothing written to the database — you come here for a clock and you leave
 * with a workout done. It shares the rounds editor and the countdown with a cardio row inside a
 * lift, so a Tabata behaves identically whether or not it is attached to anything.
 */
export default function StandaloneTimerScreen() {
  const insets = useSafeAreaInsets();
  const { startPlay } = useLiftPlay();

  // Seeded from the last set of rounds they built, so the timer opens on their interval rather
  // than resetting to the default every time.
  const [rounds, setRounds] = useState<LiftRound[]>(() => loadTimerRounds());
  const [presetId, setPresetId] = useState<string | null>(null);

  const edit = useCallback((next: LiftRound[]) => {
    setRounds(next);
    saveTimerRounds(next);
    // Any hand edit means this is no longer the preset it started from.
    setPresetId(null);
  }, []);

  const spec = useMemo(() => rowPlaySpecFromRounds(rounds, timerTitle(presetId)), [presetId, rounds]);
  const playable = spec.blocks.length > 0;

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <Stack.Screen options={{ headerShown: true, title: 'Timer' }} />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
          <AppText style={{ fontSize: 13, color: THEME.textMuted }}>
            Set your rounds and hit Play. Cues mix with your music, and nothing here is saved to a
            workout.
          </AppText>

          <SectionLabel text="START FROM" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TIMER_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={`${preset.name}, ${preset.detail}`}
                accessibilityState={{ selected: presetId === preset.id }}
                onPress={() => {
                  const next = preset.build();
                  setRounds(next);
                  saveTimerRounds(next);
                  setPresetId(preset.id);
                }}
                style={{
                  minHeight: 60,
                  flexGrow: 1,
                  flexBasis: '46%',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: presetId === preset.id ? THEME.accent : THEME.border,
                  backgroundColor: presetId === preset.id ? THEME.accentSoft : THEME.surface,
                  justifyContent: 'center',
                }}>
                <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
                  {preset.name}
                </AppText>
                <AppText
                  style={{ marginTop: 1, fontSize: 12, color: THEME.textMuted }}
                  numberOfLines={1}>
                  {preset.detail}
                </AppText>
              </Pressable>
            ))}
          </View>

          <SectionLabel text="ROUNDS" />
          <View
            style={{
              padding: 12,
              borderRadius: THEME.radiusSm,
              backgroundColor: THEME.surface,
              borderWidth: 1,
              borderColor: THEME.border,
              ...themeShadow('card'),
            }}>
            <AppText
              style={{
                marginBottom: 8,
                fontSize: 13,
                fontWeight: '800',
                color: THEME.textPrimary,
                fontVariant: ['tabular-nums'],
              }}>
              {timerSummary(rounds)}
            </AppText>
            {/* Brings its own add and duplicate actions, and the same steppers as a cardio row. */}
            <RoundsEditor rounds={rounds} onChange={edit} />
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            gap: 8,
            backgroundColor: THEME.surface,
            borderTopWidth: 1,
            borderTopColor: THEME.border,
            paddingBottom: tabBarLift(insets.bottom, 'sticky') + 12,
            ...themeShadow('bar'),
          }}>
          <Button
            title="Play"
            disabled={!playable}
            onPress={() => startPlay(spec)}
          />
        </View>
      </View>
    </Screen>
  );
}

/** A preset keeps its name on the clock; a hand-built interval is just the timer. */
function timerTitle(presetId: string | null): string {
  const preset = TIMER_PRESETS.find((entry) => entry.id === presetId);
  return preset ? preset.name : 'Interval timer';
}

function SectionLabel({ text }: { text: string }) {
  return (
    <AppText
      style={{
        marginTop: 18,
        marginBottom: 8,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.7,
        color: THEME.textMuted,
      }}>
      {text}
    </AppText>
  );
}

