import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rowPlaySpecFromRounds, useLiftPlay } from '@/components/lift/LiftPlayHost';
import { TimerPlanBuilder } from '@/components/lift/TimerPlanBuilder';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { formatDuration } from '@/lib/lift/duration';
import {
  isWorkRound,
  roundKindShortLabel,
  roundSeconds,
  roundsSummary,
} from '@/lib/lift/rounds';
import {
  loadTimerPlan,
  loadTimerRounds,
  saveTimerPlan,
  saveTimerRounds,
  TIMER_PRESETS,
} from '@/lib/lift/standaloneTimer';
import { expandPlan, planDetail, type TimerPlan } from '@/lib/lift/timerPlan';
import type { LiftRound } from '@/lib/lift/types';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';

/**
 * The interval timer on its own, off the plus menu.
 *
 * No session, no save, nothing written to the database — you come here for a clock and you leave
 * with a workout done. It shares the rounds model and the countdown with a cardio row inside a
 * lift, so a Tabata behaves identically whether or not it is attached to anything.
 *
 * The builder is the only editing surface here, and Generate expands it into the rounds the clock
 * runs. That is a deliberate split from a cardio row inside a session, which edits rounds one at a
 * time: the shapes people set a gym timer to are regular by nature, and the sprint preset alone is
 * twenty-eight rounds, so describing the pattern once beats tapping out every round in it.
 */
export default function StandaloneTimerScreen() {
  const insets = useSafeAreaInsets();
  const { startPlay } = useLiftPlay();

  // Both halves are seeded from last time, so the screen opens on the session they built rather
  // than resetting to the default on every visit.
  const [plan, setPlan] = useState<TimerPlan>(() => loadTimerPlan());
  const [rounds, setRounds] = useState<LiftRound[]>(() => loadTimerRounds());
  const [presetId, setPresetId] = useState<string | null>(null);

  const editPlan = useCallback((next: TimerPlan) => {
    setPlan(next);
    saveTimerPlan(next);
    // A hand edit means this is no longer the preset it started from.
    setPresetId(null);
  }, []);

  const editRounds = useCallback((next: LiftRound[]) => {
    setRounds(next);
    saveTimerRounds(next);
  }, []);

  const generate = useCallback(
    (from: TimerPlan) => {
      editRounds(expandPlan(from));
    },
    [editRounds],
  );

  const spec = useMemo(() => rowPlaySpecFromRounds(rounds, 'Interval timer'), [rounds]);
  const playable = spec.blocks.length > 0;

  // Building a preset mints fresh block keys, so the shape line is worked out once rather than
  // twice per preset on every keystroke in the builder.
  const presets = useMemo(
    () => TIMER_PRESETS.map((preset) => ({ preset, detail: planDetail(preset.build()) })),
    [],
  );

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
            Build your rounds, hit Generate, then Play. Cues mix with your music, and nothing here
            is saved to a workout.
          </AppText>

          <SectionLabel text="START FROM" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {presets.map(({ preset, detail }) => {
              const selected = presetId === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset.name}, ${detail}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    // A preset both fills the builder and produces its rounds, so Play works on
                    // one tap. Generate is for what they change afterwards.
                    const next = preset.build();
                    setPlan(next);
                    saveTimerPlan(next);
                    generate(next);
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
                    borderColor: selected ? THEME.accent : THEME.border,
                    backgroundColor: selected ? THEME.accentSoft : THEME.surface,
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
                    {preset.name}
                  </AppText>
                  <AppText
                    style={{ marginTop: 1, fontSize: 12, color: THEME.textMuted }}
                    numberOfLines={1}>
                    {detail}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <SectionLabel text="BUILD" />
          <Card>
            <TimerPlanBuilder
              plan={plan}
              onChange={editPlan}
              onGenerate={() => generate(plan)}
            />
          </Card>

          {rounds.length ? (
            <>
              <SectionLabel text="YOUR TIMER" />
              <Card>
                <RoundsPreview rounds={rounds} />
              </Card>
            </>
          ) : null}
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
          <Button title="Play" disabled={!playable} onPress={() => startPlay(spec)} />
        </View>
      </View>
    </Screen>
  );
}

/**
 * What Generate produced, at a glance.
 *
 * Deliberately not the per-round editor used inside a lift session. The sprint preset is
 * twenty-eight rounds, and twenty-eight stepper cards would bury the builder that made them under
 * several screens of scroll. The plan above is where you change things; this is the receipt, and
 * it fits in one card so the shape — warm up, sprint, rest, sprint, cool down — is readable.
 */
function RoundsPreview({ rounds }: { rounds: readonly LiftRound[] }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText
        style={{
          fontSize: 13,
          fontWeight: '800',
          color: THEME.textPrimary,
          fontVariant: ['tabular-nums'],
        }}>
        {roundsSummary(rounds)}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {rounds.map((round, index) => {
          const work = isWorkRound(round.kind);
          return (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: work ? THEME.accent : THEME.border,
                backgroundColor: work ? THEME.accentSoft : THEME.background,
              }}>
              <AppText
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: work ? THEME.accent : THEME.textMuted,
                }}>
                {roundKindShortLabel(round.kind)}
              </AppText>
              <AppText
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: THEME.textPrimary,
                  fontVariant: ['tabular-nums'],
                }}>
                {formatDuration(roundSeconds(round))}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: THEME.radiusSm,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      }}>
      {children}
    </View>
  );
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
