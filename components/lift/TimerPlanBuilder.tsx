import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { DurationField } from '@/components/lift/DurationField';
import { NumberField } from '@/components/lift/NumberField';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  addBlock,
  clampRepeat,
  duplicateBlock,
  moveBlock,
  newIntervalBlock,
  newRestBlock,
  planSummary,
  removeBlock,
  updateBlock,
  type TimerBlock,
  type TimerPlan,
} from '@/lib/lift/timerPlan';
import { THEME } from '@/lib/theme';

/**
 * The interval calculator.
 *
 * Describes the session the way someone says it out loud — two minute warm up, thirty on sixty off
 * four times, two minute rest, again, five minute cool down — instead of making them tap out
 * twenty-eight individual rounds. Generate turns that into the rounds the clock runs.
 *
 * Warm-up and cool down are fixed at the ends because that is what those words mean. A blank
 * 0:00 in either is how you say "skip it", which is why neither has a delete control.
 */

type TimerPlanBuilderProps = {
  plan: TimerPlan;
  onChange: (plan: TimerPlan) => void;
  onGenerate: () => void;
};

export function TimerPlanBuilder({ plan, onChange, onGenerate }: TimerPlanBuilderProps) {
  return (
    <View style={{ gap: 8 }}>
      <EdgeRow
        title="Warm-up"
        seconds={plan.warmupSeconds}
        onChange={(warmupSeconds) => onChange({ ...plan, warmupSeconds })}
      />

      {plan.blocks.map((block, index) => (
        <BlockCard
          key={block.key}
          block={block}
          index={index}
          total={plan.blocks.length}
          onChange={(patch) => onChange(updateBlock(plan, block.key, patch))}
          onDuplicate={() => onChange(duplicateBlock(plan, block.key))}
          onRemove={() => onChange(removeBlock(plan, block.key))}
          onMove={(direction) => onChange(moveBlock(plan, block.key, direction))}
        />
      ))}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextAction
          label="+ Intervals"
          onPress={() => onChange(addBlock(plan, newIntervalBlock(lastIntervalSeed(plan))))}
        />
        <TextAction label="+ Rest" onPress={() => onChange(addBlock(plan, newRestBlock()))} />
      </View>

      <EdgeRow
        title="Cool down"
        seconds={plan.cooldownSeconds}
        onChange={(cooldownSeconds) => onChange({ ...plan, cooldownSeconds })}
      />

      <View
        style={{
          marginTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
        <AppText
          style={{
            fontSize: 13,
            fontWeight: '800',
            color: THEME.textPrimary,
            fontVariant: ['tabular-nums'],
          }}>
          {planSummary(plan)}
        </AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Generate the timer from these settings"
        onPress={onGenerate}
        style={({ pressed }) => ({
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 14,
          backgroundColor: THEME.accent,
          opacity: pressed ? 0.85 : 1,
        })}>
        <AppText style={{ fontSize: 15, fontWeight: '800', color: THEME.accentForeground }}>
          Generate
        </AppText>
      </Pressable>
    </View>
  );
}

/** A new interval block copies the last one, since intervals repeat by definition. */
function lastIntervalSeed(plan: TimerPlan) {
  for (let index = plan.blocks.length - 1; index >= 0; index -= 1) {
    const block = plan.blocks[index];
    if (block.type === 'intervals') {
      return {
        onSeconds: block.onSeconds,
        offSeconds: block.offSeconds,
        repeat: block.repeat,
        intensity: block.intensity,
      };
    }
  }
  return undefined;
}

/** Warm-up and cool down: one duration, no reordering, no delete. 0:00 means skip. */
function EdgeRow({
  title,
  seconds,
  onChange,
}: {
  title: string;
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const off = seconds <= 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: off ? THEME.background : THEME.surface,
      }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={{ fontSize: 14, fontWeight: '800', color: THEME.textPrimary }}>
          {title}
        </AppText>
        <AppText style={{ fontSize: 11, color: THEME.textMuted }}>
          {off ? 'Off — set a time to add it' : 'Runs once'}
        </AppText>
      </View>
      <View style={{ width: 150 }}>
        <DurationField seconds={seconds} label={title} onChange={onChange} />
      </View>
    </View>
  );
}

function BlockCard({
  block,
  index,
  total,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: {
  block: TimerBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<TimerBlock>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const intervals = block.type === 'intervals';
  const label = intervals ? 'Intervals' : 'Rest';

  return (
    <View
      style={{
        gap: 8,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        // Work carries the accent so the plan reads as effort-then-recovery down the page rather
        // than as a stack of identical cards.
        borderColor: intervals ? THEME.accentBright : THEME.border,
        backgroundColor: intervals ? THEME.surface : THEME.background,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AppText style={{ flex: 1, fontSize: 14, fontWeight: '800', color: THEME.textPrimary }}>
          {label}
        </AppText>
        <BlockAction
          glyph={GLYPH.chevronUp}
          label={`Move ${label} up`}
          disabled={index === 0}
          onPress={() => onMove(-1)}
        />
        <BlockAction
          glyph={GLYPH.chevronDown}
          label={`Move ${label} down`}
          disabled={index === total - 1}
          onPress={() => onMove(1)}
        />
        <BlockAction glyph={GLYPH.plus} label={`Duplicate ${label}`} onPress={onDuplicate} />
        <BlockAction
          glyph={GLYPH.trash}
          label={`Delete ${label}`}
          disabled={total <= 1}
          onPress={onRemove}
        />
      </View>

      {intervals && block.type === 'intervals' ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Field caption="ON">
            <DurationField
              seconds={block.onSeconds}
              label="Interval on"
              onChange={(onSeconds) => onChange({ onSeconds })}
            />
          </Field>
          <Field caption="OFF">
            <DurationField
              seconds={block.offSeconds}
              label="Interval off"
              onChange={(offSeconds) => onChange({ offSeconds })}
            />
          </Field>
          <Field caption="ROUNDS" width={72}>
            <NumberField
              value={block.repeat}
              label="Number of rounds"
              placeholder="4"
              onCommit={(text) => {
                const typed = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
                onChange({ repeat: clampRepeat(Number.isFinite(typed) ? typed : 1) });
              }}
              onStep={(direction) => onChange({ repeat: clampRepeat(block.repeat + direction) })}
            />
          </Field>
        </View>
      ) : block.type === 'rest' ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Field caption="TIME">
            <DurationField
              seconds={block.seconds}
              label="Rest"
              onChange={(seconds) => onChange({ seconds })}
            />
          </Field>
          <View style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

function Field({
  caption,
  width,
  children,
}: {
  caption: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <View style={width ? { width } : { flex: 1, minWidth: 0 }}>
      {children}
      <AppText
        style={{
          marginTop: 3,
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.6,
          textAlign: 'center',
          color: THEME.textMuted,
        }}>
        {caption}
      </AppText>
    </View>
  );
}

function BlockAction({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: Parameters<typeof Glyph>[0]['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 30,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.25 : pressed ? 0.6 : 1,
      })}>
      <Glyph name={glyph} color={THEME.textMuted} size={13} />
    </Pressable>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
        opacity: pressed ? 0.7 : 1,
      })}>
      <AppText style={{ fontSize: 13, fontWeight: '800', color: THEME.accent }}>{label}</AppText>
    </Pressable>
  );
}
