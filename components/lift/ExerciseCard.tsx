import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SetRow, SetRowHeader } from '@/components/lift/SetRow';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { setLabel } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftSetDraft, LiftSetKind } from '@/lib/lift/types';
import { THEME, themeShadow } from '@/lib/theme';
import type { WeightUnit } from '@/lib/types';

/**
 * One exercise: a collapsible header, then warm-up rows, then the numbered work sets.
 *
 * Superset partners share a teal rail down the left and carry an A1 / A2 badge, so the pair reads
 * as one block without changing how either one is logged.
 */

type ExerciseCardProps = {
  exercise: LiftExerciseDraft;
  unit: WeightUnit;
  collapsed: boolean;
  supersetLabel?: string | null;
  /** True when another card in the same superset sits directly above or below. */
  supersetAbove?: boolean;
  supersetBelow?: boolean;
  readOnly?: boolean;
  onToggleCollapsed: () => void;
  onChangeSet: (setKey: string, patch: Partial<Pick<LiftSetDraft, 'weight' | 'reps'>>) => void;
  onToggleSet: (setKey: string) => void;
  onRemoveSet: (setKey: string) => void;
  onAddSet: (kind: LiftSetKind) => void;
  onRemove: () => void;
};

export function ExerciseCard({
  exercise,
  unit,
  collapsed,
  supersetLabel,
  supersetAbove,
  supersetBelow,
  readOnly,
  onToggleCollapsed,
  onChangeSet,
  onToggleSet,
  onRemoveSet,
  onAddSet,
  onRemove,
}: ExerciseCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const workSets = exercise.sets.filter((set) => set.kind === 'work').length;
  const doneSets = exercise.sets.filter((set) => set.completedAt).length;
  const inSuperset = Boolean(supersetLabel);

  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: inSuperset ? THEME.accentSoft : THEME.border,
        borderTopLeftRadius: supersetAbove ? 6 : 16,
        borderTopRightRadius: supersetAbove ? 6 : 16,
        borderBottomLeftRadius: supersetBelow ? 6 : 16,
        borderBottomRightRadius: supersetBelow ? 6 : 16,
        overflow: 'hidden',
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row' }}>
        {inSuperset ? (
          <View style={{ width: 4, backgroundColor: THEME.accent }} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* The trash button is a sibling of the collapse target, not a child: nested pressables
              double-fire on web, so tapping remove would also toggle the card. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${exercise.name}`}
              accessibilityState={{ expanded: !collapsed }}
              onPress={onToggleCollapsed}
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 48,
                paddingLeft: 12,
                paddingRight: 6,
              }}>
              <Glyph
                name={collapsed ? GLYPH.chevronRight : GLYPH.chevronDown}
                color={THEME.textMuted}
                size={13}
              />
              {supersetLabel ? (
                <View
                  style={{
                    paddingHorizontal: 6,
                    height: 20,
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: THEME.accentSoft,
                  }}>
                  <AppText style={{ fontSize: 11, fontWeight: '800', color: THEME.accent }}>
                    {supersetLabel}
                  </AppText>
                </View>
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>
                  {exercise.name}
                </AppText>
                {collapsed ? (
                  <AppText style={{ fontSize: 12, color: THEME.textMuted }}>
                    {workSets} {workSets === 1 ? 'set' : 'sets'}
                    {doneSets ? ` · ${doneSets} done` : ''}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
            {readOnly ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${exercise.name}`}
                hitSlop={8}
                onPress={() => setConfirmRemove((open) => !open)}
                style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={GLYPH.trash} color={THEME.textMuted} size={15} />
              </Pressable>
            )}
          </View>

          {confirmRemove && !readOnly ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingBottom: 10,
              }}>
              <AppText style={{ flex: 1, fontSize: 13, color: THEME.textMuted }}>
                Remove this exercise?
              </AppText>
              <MiniButton label="Keep" onPress={() => setConfirmRemove(false)} />
              <MiniButton label="Remove" tone="danger" onPress={onRemove} />
            </View>
          ) : null}

          {collapsed ? null : (
            <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              <SetRowHeader unit={unit} readOnly={readOnly} />
              {exercise.sets.length === 0 ? (
                <AppText style={{ fontSize: 13, color: THEME.textMuted, paddingVertical: 6 }}>
                  No sets logged.
                </AppText>
              ) : null}
              {exercise.sets.map((set, index) => (
                <SetRow
                  key={set.key}
                  set={set}
                  label={setLabel(exercise.sets, index)}
                  unit={unit}
                  readOnly={readOnly}
                  canRemove={exercise.sets.length > 1}
                  onChange={(patch) => onChangeSet(set.key, patch)}
                  onToggleComplete={() => onToggleSet(set.key)}
                  onRemove={() => onRemoveSet(set.key)}
                />
              ))}

              {readOnly ? null : (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <AddRowButton label="Add set" onPress={() => onAddSet('work')} />
                  <AddRowButton label="Add warm-up" onPress={() => onAddSet('warmup')} />
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: pressed ? THEME.accentSoft : THEME.background,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 5,
      })}>
      <Glyph name={GLYPH.plus} color={THEME.accent} size={12} />
      <AppText style={{ fontSize: 13, fontWeight: '700', color: THEME.accent }}>{label}</AppText>
    </Pressable>
  );
}

function MiniButton({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone?: 'danger';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'danger' ? THEME.danger : THEME.surface,
        borderWidth: 1,
        borderColor: tone === 'danger' ? THEME.danger : THEME.border,
      }}>
      <AppText
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: tone === 'danger' ? THEME.primaryForeground : THEME.textPrimary,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}
