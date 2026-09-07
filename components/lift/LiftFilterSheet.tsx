import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardSheet } from '@/components/ui/KeyboardSheet';
import {
  isFilterActive,
  LIFT_DATE_RANGES,
  type LiftDateRange,
  type LiftHistoryFilter,
} from '@/lib/lift/historyFilter';
import { muscleLabel, type MuscleKey } from '@/lib/lift/muscles';
import { THEME } from '@/lib/theme';

/**
 * Narrowing a long lift history.
 *
 * Only muscles that actually appear in their history are offered, so no chip can lead to an empty
 * list. Everything applies live behind the sheet — there is no Apply button to forget to press.
 */

type LiftFilterSheetProps = {
  visible: boolean;
  filter: LiftHistoryFilter;
  /** Muscles present in this history, so a chip never leads nowhere. */
  muscles: readonly MuscleKey[];
  /** How many sessions the current filter leaves, shown on the close button. */
  matchCount: number;
  onChange: (filter: LiftHistoryFilter) => void;
  onClose: () => void;
};

export function LiftFilterSheet({
  visible,
  filter,
  muscles,
  matchCount,
  onChange,
  onClose,
}: LiftFilterSheetProps) {
  const active = isFilterActive(filter);

  function toggleMuscle(key: MuscleKey) {
    onChange({
      ...filter,
      muscles: filter.muscles.includes(key)
        ? filter.muscles.filter((entry) => entry !== key)
        : [...filter.muscles, key],
    });
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end" zIndex={135}>
      <KeyboardSheet>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          minHeight: 0,
          flexGrow: 1,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 18,
            paddingRight: 8,
            paddingTop: 14,
            paddingBottom: 6,
          }}>
          <AppText style={{ flex: 1, fontSize: 19, fontWeight: '800', color: THEME.textPrimary }}>
            Filter lifts
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={onClose}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textMuted} size={16} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
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
              value={filter.query}
              onChangeText={(query) => onChange({ ...filter, query })}
              placeholder="Search by name"
              placeholderTextColor={THEME.textMuted}
              autoCorrect={false}
              accessibilityLabel="Search lifts by name"
              selectionColor={THEME.accent}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 16,
                color: THEME.textPrimary,
                paddingVertical: 0,
              }}
            />
            {filter.query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => onChange({ ...filter, query: '' })}
                style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={GLYPH.close} color={THEME.textMuted} size={13} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={{ flexGrow: 1, minHeight: 0 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }}>
          <SectionLabel text="WHEN" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LIFT_DATE_RANGES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filter.range === option.value}
                onPress={() => onChange({ ...filter, range: option.value as LiftDateRange })}
              />
            ))}
          </View>

          {muscles.length ? (
            <>
              <SectionLabel text="MUSCLES" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {muscles.map((key) => (
                  <Chip
                    key={key}
                    label={muscleLabel(key)}
                    selected={filter.muscles.includes(key)}
                    onPress={() => toggleMuscle(key)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 18, paddingTop: 10, gap: 8 }}>
          <Button
            title={
              matchCount === 1 ? 'Show 1 session' : `Show ${matchCount} sessions`
            }
            disabled={matchCount === 0}
            onPress={onClose}
          />
          {active ? (
            <Button
              title="Clear filters"
              variant="ghost"
              size="sm"
              onPress={() => onChange({ muscles: [], range: 'all', query: '' })}
            />
          ) : null}
        </View>
      </View>
      </KeyboardSheet>
    </ChromeOverlay>
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

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? THEME.accent : THEME.background,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
      }}>
      <AppText
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: selected ? THEME.accentForeground : THEME.textPrimary,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}
