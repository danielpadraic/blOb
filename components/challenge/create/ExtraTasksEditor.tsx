import { Pressable, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { SIMPLE_PROOF_METHODS } from '@/lib/simpleChallenge';
import { heartRateMinutesLabel, type ChallengeProofMethod } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
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

export function ExtraTasksEditor({
  tasks,
  onChange,
}: {
  tasks: ExtraCreateTask[];
  onChange: (next: ExtraCreateTask[]) => void;
}) {
  function patch(index: number, partial: Partial<ExtraCreateTask>) {
    onChange(tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)));
  }

  return (
    <View className="gap-3">
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
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input
                placeholder={index === 0 ? 'Workout B' : copy('create.extraTaskPlaceholder')}
                value={task.title}
                onChangeText={(title) => patch(index, { title })}
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
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange([...tasks, emptyExtraCreateTask()])}
        className="items-center self-start rounded-full px-3"
        style={{
          minHeight: 36,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          justifyContent: 'center',
        }}>
        <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
          {copy('create.addTask')}
        </AppText>
      </Pressable>
    </View>
  );
}
