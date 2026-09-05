import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  exerciseNameTaken,
  searchExercises,
  type ExerciseOption,
} from '@/lib/lift/catalog';
import { muscleLabel, muscleShortLabel, type MuscleKey } from '@/lib/lift/muscles';
import { THEME, themeShadow } from '@/lib/theme';

/**
 * Typeahead over the official catalog filtered to the session's muscles, plus this user's own
 * exercises. Suggestions start at one character. "Add '{query}'" creates a private exercise — it
 * never touches the official catalog.
 */

export type AddExerciseResult = {
  option: ExerciseOption | null;
  /** Set when the user is creating a new private exercise. */
  createName: string | null;
  muscle: MuscleKey;
  superset: boolean;
};

type AddExerciseSheetProps = {
  visible: boolean;
  /** The section the sheet opened from; also the muscle a new custom is filed under. */
  muscle: MuscleKey;
  /** Every muscle in the session, so they can move the exercise to another section. */
  muscles: readonly MuscleKey[];
  customs: readonly ExerciseOption[];
  /** Name of the exercise a superset would pair with, or null when the section is empty. */
  supersetPartnerName: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (result: AddExerciseResult) => void;
};

export function AddExerciseSheet({
  visible,
  muscle,
  muscles,
  customs,
  supersetPartnerName,
  busy,
  onClose,
  onSubmit,
}: AddExerciseSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<MuscleKey>(muscle);
  const [superset, setSuperset] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setTarget(muscle);
      setSuperset(false);
      const handle = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [muscle, visible]);

  const results = useMemo(
    () => searchExercises({ query, muscles: [target], customs, limit: 40 }),
    [customs, query, target],
  );

  const trimmed = query.trim();
  const canCreate = trimmed.length >= 2 && !exerciseNameTaken(trimmed, customs);

  function pick(option: ExerciseOption) {
    onSubmit({ option, createName: null, muscle: target, superset });
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end" zIndex={130}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '90%',
          minHeight: 380,
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
            paddingBottom: 8,
          }}>
          <AppText style={{ flex: 1, fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
            Add exercise
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textPrimary} size={16} />
          </Pressable>
        </View>

        {muscles.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}>
            {muscles.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`File under ${muscleLabel(key)}`}
                accessibilityState={{ selected: key === target }}
                onPress={() => setTarget(key)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: key === target ? THEME.accent : THEME.surface,
                  borderWidth: 1,
                  borderColor: key === target ? THEME.accent : THEME.border,
                }}>
                <AppText
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: key === target ? THEME.accentForeground : THEME.textPrimary,
                  }}>
                  {muscleShortLabel(key)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 48,
              paddingHorizontal: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.background,
            }}>
            <Glyph name={GLYPH.search} color={THEME.textMuted} size={16} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${muscleShortLabel(target)} exercises`}
              placeholderTextColor={THEME.textMuted}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              accessibilityLabel="Search exercises"
              selectionColor={THEME.accent}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 16,
                color: THEME.textPrimary,
                paddingVertical: 0,
              }}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => setQuery('')}
                style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={GLYPH.close} color={THEME.textMuted} size={13} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 8 }}>
          {canCreate ? (
            <ResultRow
              title={`Add “${trimmed}”`}
              subtitle={`Your own exercise, filed under ${muscleShortLabel(target)}. Only you will see it.`}
              icon={GLYPH.plus}
              disabled={busy}
              onPress={() =>
                onSubmit({ option: null, createName: trimmed, muscle: target, superset })
              }
            />
          ) : null}

          {results.map((option) => (
            <ResultRow
              key={option.id}
              title={option.name}
              subtitle={subtitleFor(option, target)}
              badge={option.official ? null : 'Yours'}
              disabled={busy}
              onPress={() => pick(option)}
            />
          ))}

          {results.length === 0 && !canCreate ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
              <AppText style={{ fontSize: 14, color: THEME.textMuted, textAlign: 'center' }}>
                Nothing matches “{trimmed}”. Keep typing to add it as your own.
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        {supersetPartnerName ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={`Superset with ${supersetPartnerName}`}
            accessibilityState={{ checked: superset }}
            onPress={() => setSuperset((on) => !on)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 56,
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: THEME.border,
            }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: superset ? THEME.accent : THEME.surface,
                borderWidth: 1,
                borderColor: superset ? THEME.accent : THEME.border,
              }}>
              <Glyph
                name={GLYPH.checkmark}
                color={superset ? THEME.accentForeground : 'transparent'}
                size={13}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText style={{ fontSize: 14, fontWeight: '700', color: THEME.textPrimary }}>
                Superset with previous
              </AppText>
              <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                Pairs it with {supersetPartnerName}. You still log each one on its own.
              </AppText>
            </View>
          </Pressable>
        ) : null}
      </View>
    </ChromeOverlay>
  );
}

function subtitleFor(option: ExerciseOption, target: MuscleKey): string {
  const parts = [option.muscle, ...option.secondaries].map(muscleShortLabel);
  const line = parts.join(' · ');
  return option.muscle === target ? line : `${line} · added to ${muscleShortLabel(target)}`;
}

function ResultRow({
  title,
  subtitle,
  badge,
  icon,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  badge?: string | null;
  icon?: (typeof GLYPH)[keyof typeof GLYPH];
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 56,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: pressed ? THEME.accentSoft : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}>
      {icon ? <Glyph name={icon} color={THEME.accent} size={16} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
          {title}
        </AppText>
        <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
          {subtitle}
        </AppText>
      </View>
      {badge ? (
        <View
          style={{
            paddingHorizontal: 8,
            height: 22,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: THEME.accentSoft,
          }}>
          <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>{badge}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
