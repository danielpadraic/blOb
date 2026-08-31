import { Pressable, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { SIMPLE_PROOF_METHODS } from '@/lib/simpleChallenge';
import { heartRateMinutesLabel, type ChallengeProofMethod } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import {
  DEFAULT_DISTANCE_MILES,
  MIN_DISTANCE_STEPS,
  amountToMeters,
  displayDistance,
  milesToMeters,
  snapDistanceAmount,
  type DistanceUnit,
} from '@/lib/distance';
import { THEME } from '@/lib/theme';
import { taskLetterLabel } from '@/lib/taskLabels';
import { emptyExtraCreateTask, type ExtraCreateTask } from '@/utils/validators';

export function HeartRateMinutesRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const minutes = Math.max(Math.round(Number(value) || 30), 1);
  return (
    <StepperField
      label={copy('create.hrMinutes')}
      value={minutes}
      min={1}
      max={600}
      formatValue={heartRateMinutesLabel}
      onChange={onChange}
    />
  );
}

export function DistanceMilesRow({
  meters,
  unit = 'mi',
  onChangeMeters,
  onChangeUnit,
}: {
  meters: number;
  unit?: DistanceUnit;
  onChangeMeters: (next: number) => void;
  onChangeUnit?: (next: DistanceUnit) => void;
}) {
  const amount = snapDistanceAmount(displayDistance(meters || milesToMeters(DEFAULT_DISTANCE_MILES), unit));
  return (
    <View className="gap-2">
      <StepperField
        label={copy('create.proofDistance')}
        value={amount}
        min={MIN_DISTANCE_STEPS}
        max={1000}
        step={MIN_DISTANCE_STEPS}
        formatValue={(value) => `${snapDistanceAmount(value).toFixed(2)} ${unit}`}
        onChange={(next) => onChangeMeters(amountToMeters(next, unit))}
      />
      {onChangeUnit ? (
        <ChipRow>
          <Chip label={copy('create.distanceUnitMi')} selected={unit === 'mi'} minHeight={44} onPress={() => onChangeUnit('mi')} />
          <Chip label={copy('create.distanceUnitKm')} selected={unit === 'km'} minHeight={44} onPress={() => onChangeUnit('km')} />
        </ChipRow>
      ) : null}
    </View>
  );
}

export function ExtraTasksEditor({
  tasks,
  onChange,
  onTitleFocus,
  hint,
  startLetterIndex = 1,
}: {
  tasks: ExtraCreateTask[];
  onChange: (next: ExtraCreateTask[]) => void;
  onTitleFocus?: () => void;
  hint?: string;
  startLetterIndex?: number;
}) {
  function patch(index: number, partial: Partial<ExtraCreateTask>) {
    onChange(tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)));
  }

  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange([...tasks, emptyExtraCreateTask()])}
        className="items-center self-start rounded-full px-3"
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          justifyContent: 'center',
        }}>
        <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
          {copy('create.addTask')}
        </AppText>
      </Pressable>
      {tasks.map((task, index) => (
        <View
          key={task.id}
          className="gap-2"
          style={{
            backgroundColor: THEME.surface,
            borderRadius: THEME.radius,
            borderWidth: 1,
            borderColor: THEME.border,
            padding: 12,
          }}>
          <AppText className="text-sm font-semibold text-charcoal">
            {taskLetterLabel(startLetterIndex + index)}
          </AppText>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input
                placeholder={taskLetterLabel(startLetterIndex + index)}
                value={task.title}
                onChangeText={(title) => patch(index, { title })}
                onFocus={onTitleFocus}
                grow
                maxLength={80}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove task"
              onPress={() => onChange(tasks.filter((_, itemIndex) => itemIndex !== index))}
              className="h-[52px] w-[52px] items-center justify-center rounded-xl"
              style={{ borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface }}>
              <AppText className="text-[18px] font-semibold text-muted">×</AppText>
            </Pressable>
          </View>
          <ChipRow>
            <Chip
              label={copy('create.taskOnce')}
              selected={task.once}
              onPress={() => patch(index, { once: !task.once })}
            />
          </ChipRow>
          <View className="flex-row flex-wrap gap-2">
            {SIMPLE_PROOF_METHODS.map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                minHeight={44}
                selected={task.proof_method === item.value}
                onPress={() =>
                  patch(index, {
                    proof_method: item.value as ChallengeProofMethod,
                    hr_minutes: item.value === 'hr' ? Math.max(task.hr_minutes || 30, 1) : task.hr_minutes,
                  })
                }
              />
            ))}
          </View>
          {task.proof_method === 'hr' ? (
            <HeartRateMinutesRow
              value={task.hr_minutes}
              onChange={(hr_minutes) => patch(index, { hr_minutes })}
            />
          ) : null}
          {task.proof_method === 'distance' ? (
            <DistanceMilesRow
              meters={task.distance_meters || milesToMeters(DEFAULT_DISTANCE_MILES)}
              onChangeMeters={(distance_meters) => patch(index, { distance_meters })}
            />
          ) : null}
          {task.proof_method === 'location' ? (
            <AppText className="text-[12px] leading-5 text-muted">
              Uses the same place pin as this challenge.
            </AppText>
          ) : null}
          <AppText className="text-[12px] leading-5 text-muted">{copy('create.proofsBelong')}</AppText>
        </View>
      ))}
      {hint ? (
        <AppText className="text-xs leading-5 text-muted">{hint}</AppText>
      ) : null}
    </View>
  );
}
