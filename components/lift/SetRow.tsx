import { Pressable, View } from 'react-native';

import { NumberField } from '@/components/lift/NumberField';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  clampRepsInput,
  clampWeightInput,
  formatLiftNumber,
  isEmptySet,
  stepReps,
  stepWeight,
} from '@/lib/lift/session';
import type { LiftSetDraft } from '@/lib/lift/types';
import { THEME } from '@/lib/theme';
import type { WeightUnit } from '@/lib/types';

/** Fixed columns, so the header labels line up with every row underneath them. */
const LABEL_WIDTH = 24;
const CHECK_SIZE = 40;
const TRAILING_WIDTH = 28;
const GAP = 6;

type SetRowProps = {
  set: LiftSetDraft;
  label: string;
  unit: WeightUnit;
  /** A saved session renders the same row, just not editable. */
  readOnly?: boolean;
  canRemove?: boolean;
  onChange: (patch: Partial<Pick<LiftSetDraft, 'weight' | 'reps'>>) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
};

export function SetRow({
  set,
  label,
  unit,
  readOnly,
  canRemove,
  onChange,
  onToggleComplete,
  onRemove,
}: SetRowProps) {
  const done = Boolean(set.completedAt);
  const warmup = set.kind === 'warmup';
  const removable = !readOnly && canRemove && isEmptySet(set);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: GAP,
        paddingVertical: 3,
        opacity: readOnly && !done ? 0.7 : 1,
      }}>
      <View style={{ width: LABEL_WIDTH, alignItems: 'center' }}>
        <AppText
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: warmup ? THEME.accent : THEME.textMuted,
            fontVariant: ['tabular-nums'],
          }}>
          {label}
        </AppText>
      </View>

      {readOnly ? (
        <>
          <ReadValue value={set.weight} suffix={unit} />
          <ReadValue value={set.reps} suffix="reps" />
        </>
      ) : (
        <>
          <NumberField
            value={set.weight}
            label={`${label === 'W' ? 'Warm-up' : `Set ${label}`} weight in ${unit}`}
            onCommit={(text) => onChange({ weight: clampWeightInput(text) })}
            onStep={(direction) => onChange({ weight: stepWeight(set.weight, direction, unit) })}
          />
          <NumberField
            value={set.reps}
            label={`${label === 'W' ? 'Warm-up' : `Set ${label}`} reps`}
            onCommit={(text) => onChange({ reps: clampRepsInput(text) })}
            onStep={(direction) => onChange({ reps: stepReps(set.reps, direction) })}
          />
        </>
      )}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={done ? `Undo ${label === 'W' ? 'warm-up' : `set ${label}`}` : `Complete ${label === 'W' ? 'warm-up' : `set ${label}`}`}
        accessibilityState={{ checked: done, disabled: Boolean(readOnly) }}
        disabled={readOnly}
        hitSlop={4}
        onPress={onToggleComplete}
        style={{
          width: CHECK_SIZE,
          height: CHECK_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? THEME.accent : THEME.surface,
            borderWidth: 1,
            borderColor: done ? THEME.accent : THEME.border,
          }}>
          <Glyph
            name={GLYPH.checkmark}
            color={done ? THEME.accentForeground : THEME.border}
            size={15}
          />
        </View>
      </Pressable>

      <View style={{ width: TRAILING_WIDTH, alignItems: 'center' }}>
        {removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete empty ${label === 'W' ? 'warm-up' : `set ${label}`}`}
            hitSlop={10}
            onPress={onRemove}
            style={{ width: 28, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textMuted} size={13} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ReadValue({ value, suffix }: { value: number | null; suffix: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, height: 36, justifyContent: 'center' }}>
      <AppText
        numberOfLines={1}
        style={{
          fontSize: 15,
          fontWeight: '700',
          textAlign: 'center',
          color: value == null ? THEME.textMuted : THEME.textPrimary,
          fontVariant: ['tabular-nums'],
        }}>
        {value == null ? '—' : `${formatLiftNumber(value)} ${suffix}`}
      </AppText>
    </View>
  );
}

/** Column captions above the first set of an exercise. */
export function SetRowHeader({ unit, readOnly }: { unit: WeightUnit; readOnly?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, paddingBottom: 2 }}>
      <Caption width={LABEL_WIDTH} text="SET" />
      <Caption flex text={unit.toUpperCase()} />
      <Caption flex text="REPS" />
      <Caption width={CHECK_SIZE} text={readOnly ? 'DONE' : ''} />
      <View style={{ width: TRAILING_WIDTH }} />
    </View>
  );
}

function Caption({ text, width, flex }: { text: string; width?: number; flex?: boolean }) {
  return (
    <View style={flex ? { flex: 1, minWidth: 0 } : { width }}>
      <AppText
        style={{
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.6,
          textAlign: 'center',
          color: THEME.textMuted,
        }}>
        {text}
      </AppText>
    </View>
  );
}
