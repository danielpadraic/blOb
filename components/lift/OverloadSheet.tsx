import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  EMPTY_OVERLOAD,
  isOverloadActive,
  nextReps,
  nextWeight,
  previewLine,
  previewSet,
  WEIGHT_ROUNDING,
} from '@/lib/lift/overload';
import { shortDate } from '@/lib/lift/session';
import type { LiftOverloadMode, LiftOverloadPlan, LiftSessionDraft } from '@/lib/lift/types';
import { THEME } from '@/lib/theme';

/**
 * Progressive overload in one screen: bump the weight, the reps, or both, and see what it does
 * before committing.
 *
 * The preview runs against the heaviest working set in the source session, so the number they read
 * is a number they actually lifted. Nothing here is remembered — the next lift starts from off.
 */

type OverloadSheetProps = {
  visible: boolean;
  /** The session being copied. Its name and date head the sheet so the source is never ambiguous. */
  source: LiftSessionDraft | null;
  busy?: boolean;
  onClose: () => void;
  onApply: (plan: LiftOverloadPlan) => void;
};

export function OverloadSheet({ visible, source, busy, onClose, onApply }: OverloadSheetProps) {
  const [plan, setPlan] = useState<LiftOverloadPlan>(EMPTY_OVERLOAD);

  const unit = source?.unit ?? 'lb';
  const sample = useMemo(() => (source ? previewSet(source) : null), [source]);
  const ready = isOverloadActive(plan);

  function close() {
    setPlan(EMPTY_OVERLOAD);
    onClose();
  }

  const weightPreview = sample
    ? previewLine(sample.weight, nextWeight(sample.weight, plan.weight, unit), unit)
    : null;
  const repsPreview = sample
    ? previewLine(sample.reps, nextReps(sample.reps, plan.reps), 'reps')
    : null;

  return (
    <ChromeOverlay visible={visible} onClose={close} align="end" zIndex={140}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 20,
          maxHeight: '92%',
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 18,
            paddingRight: 8,
            paddingTop: 14,
            paddingBottom: 8,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText style={{ fontSize: 19, fontWeight: '800', color: THEME.textPrimary }}>
              Go heavier than last time
            </AppText>
            {source ? (
              <AppText numberOfLines={1} style={{ fontSize: 13, color: THEME.textMuted }}>
                Building on {source.title || 'your last session'} · {shortDate(source.performedAt)}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={close}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.close} color={THEME.textMuted} size={16} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
          <FieldBlock
            label="Weight"
            amountLabel={plan.weight.mode === 'percent' ? '%' : unit}
            modes={[
              { value: 'off', label: 'Off' },
              { value: 'amount', label: `+ ${unit}` },
              { value: 'percent', label: '+ %' },
            ]}
            step={plan.weight}
            preview={weightPreview}
            defaultAmount={plan.weight.mode === 'percent' ? 5 : WEIGHT_ROUNDING[unit] * 2}
            onChange={(weight) => setPlan((current) => ({ ...current, weight }))}
          />

          <FieldBlock
            label="Reps"
            amountLabel={plan.reps.mode === 'percent' ? '%' : 'reps'}
            modes={[
              { value: 'off', label: 'Off' },
              { value: 'amount', label: '+ reps' },
              { value: 'percent', label: '+ %' },
            ]}
            step={plan.reps}
            preview={repsPreview}
            defaultAmount={plan.reps.mode === 'percent' ? 10 : 1}
            onChange={(reps) => setPlan((current) => ({ ...current, reps }))}
          />

          <AppText style={{ fontSize: 13, color: THEME.textMuted, lineHeight: 19, marginTop: 4 }}>
            Every working set moves. Warm-ups stay exactly as you did them last time, and nothing is
            checked off — you still have to do the work.
          </AppText>
        </ScrollView>

        <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 8 }}>
          <Button
            title="Apply to this session"
            disabled={!ready || busy}
            loading={busy}
            onPress={() => onApply(plan)}
          />
          <Button title="Keep last time's numbers" variant="ghost" size="sm" onPress={close} />
        </View>
      </View>
    </ChromeOverlay>
  );
}

type FieldBlockProps = {
  label: string;
  amountLabel: string;
  modes: Array<{ value: LiftOverloadMode; label: string }>;
  step: { mode: LiftOverloadMode; amount: number };
  preview: string | null;
  defaultAmount: number;
  onChange: (step: { mode: LiftOverloadMode; amount: number }) => void;
};

function FieldBlock({
  label,
  amountLabel,
  modes,
  step,
  preview,
  defaultAmount,
  onChange,
}: FieldBlockProps) {
  const [text, setText] = useState('');
  const on = step.mode !== 'off';

  function pickMode(mode: LiftOverloadMode) {
    if (mode === 'off') {
      setText('');
      onChange({ mode, amount: 0 });
      return;
    }
    // Switching between "+ lb" and "+ %" keeps a number in the field so the preview says something
    // immediately instead of waiting for them to type.
    const amount = step.mode === 'off' || !step.amount ? defaultAmount : step.amount;
    setText(String(amount));
    onChange({ mode, amount });
  }

  return (
    <View style={{ marginTop: 14 }}>
      <AppText
        style={{
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 0.7,
          color: THEME.textMuted,
          marginBottom: 8,
        }}>
        {label.toUpperCase()}
      </AppText>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {modes.map((mode) => {
          const active = step.mode === mode.value;
          return (
            <Pressable
              key={mode.value}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${mode.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => pickMode(mode.value)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? THEME.accent : THEME.background,
                borderWidth: 1,
                borderColor: active ? THEME.accent : THEME.border,
              }}>
              <AppText
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: active ? THEME.accentForeground : THEME.textPrimary,
                }}>
                {mode.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {on ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              const parsed = Number.parseFloat(next.replace(',', '.'));
              onChange({ mode: step.mode, amount: Number.isFinite(parsed) ? parsed : 0 });
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel={`${label} amount`}
            placeholder={String(defaultAmount)}
            placeholderTextColor={THEME.textMuted}
            selectionColor={THEME.accent}
            style={{
              width: 96,
              height: 48,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: THEME.border,
              backgroundColor: THEME.surface,
              textAlign: 'center',
              fontSize: 17,
              fontWeight: '700',
              color: THEME.textPrimary,
            }}
          />
          <AppText style={{ fontSize: 14, fontWeight: '700', color: THEME.textMuted }}>
            {amountLabel}
          </AppText>
          <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
            {preview ? (
              <View
                style={{
                  paddingHorizontal: 12,
                  minHeight: 32,
                  justifyContent: 'center',
                  borderRadius: 999,
                  backgroundColor: THEME.accentSoft,
                }}>
                <AppText
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: '800', color: THEME.accent }}>
                  {preview}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
