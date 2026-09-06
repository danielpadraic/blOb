import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DurationField } from '@/components/lift/DurationField';
import { NumberField } from '@/components/lift/NumberField';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  CARDIO_TYPES,
  cardioTypeLabel,
  DEFAULT_CARDIO_INTENSITY,
  DEFAULT_CARDIO_SECONDS,
  DEFAULT_REST_SECONDS,
} from '@/lib/lift/session';
import { muscleLabel, type MuscleKey } from '@/lib/lift/muscles';
import type { LiftCardioMethod, LiftCardioType } from '@/lib/lift/types';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * The cardio and rest logger.
 *
 * Cardio does not use pounds and reps, so it gets its own four questions: what you did, how hard it
 * was meant to be, how long, and how hard it actually felt. Rest asks one.
 */

export type TimedRowResult = {
  kind: 'cardio' | 'rest';
  muscle: MuscleKey;
  cardioMethod: string | null;
  cardioCustomName: string | null;
  cardioType: LiftCardioType | null;
  durationSeconds: number;
  intensity: number | null;
};

type AddTimedRowSheetProps = {
  visible: boolean;
  kind: 'cardio' | 'rest';
  /** The section the row lands in — a group of its own, or between two exercises. */
  muscle: MuscleKey;
  methods: readonly LiftCardioMethod[];
  /** Preselected when they arrived by searching for a method by name. */
  initialMethodId?: string | null;
  onClose: () => void;
  onSubmit: (result: TimedRowResult) => void;
};

export function AddTimedRowSheet({
  visible,
  kind,
  muscle,
  methods,
  initialMethodId,
  onClose,
  onSubmit,
}: AddTimedRowSheetProps) {
  const insets = useSafeAreaInsets();
  const rest = kind === 'rest';
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [methodId, setMethodId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [type, setType] = useState<LiftCardioType>('steady');
  const interval = !rest && type === 'interval';
  const [seconds, setSeconds] = useState(rest ? DEFAULT_REST_SECONDS : DEFAULT_CARDIO_SECONDS);
  const [intensity, setIntensity] = useState(DEFAULT_CARDIO_INTENSITY);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setQuery('');
    setMethodId(initialMethodId ?? null);
    setCustomName('');
    setType('steady');
    setSeconds(rest ? DEFAULT_REST_SECONDS : DEFAULT_CARDIO_SECONDS);
    setIntensity(DEFAULT_CARDIO_INTENSITY);
  }, [initialMethodId, rest, visible]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return methods;
    }
    return methods.filter((row) => row.name.toLowerCase().includes(needle));
  }, [methods, query]);

  const picked = methods.find((row) => row.id === methodId) ?? null;
  const isOther = methodId === 'other';
  const ready = rest ? seconds > 0 : Boolean(methodId) && seconds > 0;

  function submit() {
    if (!ready) {
      return;
    }
    onSubmit({
      kind,
      muscle,
      cardioMethod: rest ? null : methodId,
      cardioCustomName: rest || !isOther ? null : customName.trim().slice(0, 60) || null,
      cardioType: rest ? null : type,
      // An interval's clock is the sum of its rounds. Carrying a duration as well would make the
      // row report its own length twice, at two different numbers.
      durationSeconds: interval ? 0 : seconds,
      intensity: rest || interval ? null : intensity,
    });
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end" zIndex={130}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '90%',
          paddingBottom: Math.max(insets.bottom, 12),
          ...themeShadow('card'),
        }}>
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: THEME.border }} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 6,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText style={{ fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
              {rest ? 'Add rest' : 'Add cardio'}
            </AppText>
            <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
              Into {muscleLabel(muscle)}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textPrimary} size={16} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          {rest ? null : (
            <>
              <SectionLabel>WHAT DID YOU DO</SectionLabel>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  height: 46,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  backgroundColor: THEME.background,
                }}>
                <Glyph name={GLYPH.search} color={THEME.textMuted} size={15} />
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Treadmill, Air Bike, Jump Rope…"
                  placeholderTextColor={THEME.textMuted}
                  accessibilityLabel="Search cardio types"
                  selectionColor={THEME.accent}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    color: THEME.textPrimary,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
                  }}
                />
              </View>

              <View style={{ marginTop: 8, maxHeight: 210 }}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  <View style={{ gap: 4 }}>
                    {results.map((method) => {
                      const on = method.id === methodId;
                      return (
                        <Pressable
                          key={method.id}
                          accessibilityRole="button"
                          accessibilityLabel={method.name}
                          accessibilityState={{ selected: on }}
                          onPress={() => setMethodId(method.id)}
                          style={{
                            minHeight: 44,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 12,
                            borderRadius: 12,
                            backgroundColor: on ? THEME.accentSoft : 'transparent',
                          }}>
                          <AppText
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontSize: 15,
                              fontWeight: on ? '800' : '600',
                              color: on ? THEME.accent : THEME.textPrimary,
                            }}>
                            {method.name}
                          </AppText>
                          {on ? (
                            <Glyph name={GLYPH.checkmark} color={THEME.accent} size={15} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                    {results.length === 0 ? (
                      <AppText
                        style={{ padding: 12, fontSize: 13, color: THEME.textMuted }}>
                        Nothing matches “{query.trim()}”. Pick Other to name it yourself.
                      </AppText>
                    ) : null}
                  </View>
                </ScrollView>
              </View>

              {isOther ? (
                <TextInput
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Name it (just for you)"
                  placeholderTextColor={THEME.textMuted}
                  accessibilityLabel="Your name for this cardio"
                  selectionColor={THEME.accent}
                  maxLength={60}
                  style={{
                    marginTop: 8,
                    height: 46,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: THEME.accent,
                    backgroundColor: THEME.surface,
                    fontSize: 15,
                    color: THEME.textPrimary,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
                  }}
                />
              ) : null}

              <SectionLabel>HOW HARD WAS IT MEANT TO BE</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {CARDIO_TYPES.map((value) => {
                  const on = type === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={cardioTypeLabel(value)}
                      accessibilityState={{ selected: on }}
                      onPress={() => setType(value)}
                      style={{
                        minHeight: 40,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? THEME.accent : THEME.surface,
                        borderWidth: 1,
                        borderColor: on ? THEME.accent : THEME.border,
                      }}>
                      <AppText
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: on ? THEME.accentForeground : THEME.textPrimary,
                        }}>
                        {cardioTypeLabel(value)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* An interval's time and effort live in its rounds, so a single clock here would be a
              second, contradictory answer. The row lands as a Tabata and is edited on the card. */}
          {interval ? (
            <>
              <SectionLabel>ROUNDS</SectionLabel>
              <AppText style={{ fontSize: 13, lineHeight: 19, color: THEME.textMuted }}>
                Starts as 8 × 0:20 on / 0:10 off at intensity 8. Edit, add, or delete rounds on the
                card, then hit Play to run it.
              </AppText>
            </>
          ) : (
            <>
          <SectionLabel>{rest ? 'HOW LONG' : 'TIME'}</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: rest ? 1 : 2, minWidth: 0 }}>
              <DurationField seconds={seconds} onChange={setSeconds} label={rest ? 'Rest' : 'Cardio'} />
            </View>
            {rest ? null : (
              <View style={{ flex: 1, minWidth: 0 }}>
                <NumberField
                  value={intensity}
                  label="Intensity out of 10"
                  placeholder="5"
                  onCommit={(text) => {
                    const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                    setIntensity(clamp(Number.isFinite(typed) ? typed : 5));
                  }}
                  onStep={(direction) => setIntensity(clamp(intensity + direction))}
                />
                <AppText
                  style={{
                    marginTop: 3,
                    fontSize: 10,
                    fontWeight: '800',
                    letterSpacing: 0.6,
                    textAlign: 'center',
                    color: THEME.textMuted,
                  }}>
                  INTENSITY
                </AppText>
              </View>
            )}
          </View>
            </>
          )}

          {rest ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
              {[30, 45, 60, 90, 120].map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityLabel={`Rest ${preset} seconds`}
                  onPress={() => setSeconds(preset)}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: seconds === preset ? THEME.accent : THEME.border,
                    backgroundColor: seconds === preset ? THEME.accentSoft : THEME.surface,
                  }}>
                  <AppText
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: seconds === preset ? THEME.accent : THEME.textPrimary,
                    }}>
                    {preset}s
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <Button
            title={rest ? 'Add rest' : picked ? `Add ${picked.name}` : 'Pick what you did'}
            disabled={!ready}
            onPress={submit}
          />
        </View>
      </View>
    </ChromeOverlay>
  );
}

function clamp(value: number): number {
  return Math.min(Math.max(Math.round(value), 1), 10);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <AppText
      style={{
        marginTop: 14,
        marginBottom: 6,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.7,
        color: THEME.textMuted,
      }}>
      {children}
    </AppText>
  );
}
