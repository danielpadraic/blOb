import { useMemo, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { z } from 'zod';

import { LastDoneSlider } from '@/components/profile/LastDoneSlider';
import { UnitToggle } from '@/components/profile/UnitToggle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useUpdateProfile } from '@/hooks/useProfile';
import { copy } from '@/lib/copy';
import type { BodyUnitSystem } from '@/lib/bodyMetrics';
import {
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  LAST_DONE_DEFAULT,
  LAST_DONE_VALUES,
  LIMITATION_OPTIONS,
  PRIMARY_GOALS,
  SPORT_PRESETS,
  TRAINING_DAYS,
  asLastDone,
  clampDays,
  fitnessProfileFromUser,
  normalizeMileTime,
  sportLabel,
  toggleString,
  type FitnessProfile,
  type LastDoneBucket,
  type PrimaryGoal,
} from '@/lib/fitnessProfile';
import { THEME } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const formSchema = z.object({
  experience_level: z.enum(EXPERIENCE_LEVELS),
  primary_goals: z.array(z.enum(PRIMARY_GOALS)).max(5),
  training_days_per_week: z.number().int().min(1).max(7),
  sports: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        last_done: z.enum(LAST_DONE_VALUES),
      }),
    )
    .max(12),
  last_mile_run: z.union([z.literal('never'), z.string().min(1).max(24)]),
  limitations: z.array(z.string().min(1).max(40)).max(12),
  limitations_notes: z.string().max(280),
  preferred_units: z.enum(['imperial', 'metric']),
  equipment_access: z.array(z.string().min(1).max(40)).max(16),
  last_mile_kind: z.enum(['never', 'time']),
  last_mile_time: z.string(),
  custom_sport: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type FitnessHistoryFormProps = {
  profile?: Profile | null;
  onSkip?: () => void;
  afterSave?: () => void;
};

export function FitnessHistoryForm({ profile, onSkip, afterSave }: FitnessHistoryFormProps) {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults = useMemo(() => buildDefaults(profile), [profile]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  const sports = useFieldArray({ control, name: 'sports' });
  const experience = watch('experience_level');
  const goals = watch('primary_goals') ?? [];
  const days = watch('training_days_per_week');
  const sportRows = watch('sports');
  const mileKind = watch('last_mile_kind');
  const limitations = watch('limitations');
  const equipment = watch('equipment_access');
  const units = watch('preferred_units');
  const customSport = watch('custom_sport');

  function finish() {
    if (afterSave) {
      afterSave();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/feed');
  }

  function addSport(name: string) {
    const label = name.trim();
    if (!label) {
      return;
    }
    if (sportRows.some((row) => row.name.toLowerCase() === label.toLowerCase())) {
      return;
    }
    sports.append({ name: label, last_done: LAST_DONE_DEFAULT });
    setValue('custom_sport', '');
  }

  function removeSportNamed(name: string) {
    const index = sportRows.findIndex((row) => row.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      sports.remove(index);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const primary_goals = values.primary_goals ?? [];
    const payload: FitnessProfile = {
      experience_level: values.experience_level,
      primary_goals,
      primary_goal: primary_goals[0] ?? 'general',
      training_days_per_week: clampDays(values.training_days_per_week),
      sports: values.sports
        .map((row: { name: string; last_done: LastDoneBucket }) => ({
          name: row.name.trim(),
          last_done: asLastDone(row.last_done),
        }))
        .filter((row: { name: string }) => row.name.length > 0),
      last_mile_run:
        values.last_mile_kind === 'never' ? 'never' : normalizeMileTime(values.last_mile_time),
      limitations: values.limitations,
      limitations_notes: values.limitations_notes.trim(),
      preferred_units: values.preferred_units,
      equipment_access: values.equipment_access,
    };
    try {
      await updateProfile.mutateAsync({
        fitness_profile: payload,
        typical_weekly_workout_frequency: payload.training_days_per_week,
        weight_unit: payload.preferred_units === 'metric' ? 'kg' : 'lb',
      });
      setSaved(true);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  });

  if (saved) {
    return (
      <View className="gap-4 pb-8 pt-2">
        <Card>
          <AppText className="text-[22px] font-extrabold text-charcoal">Nice — that helps</AppText>
          <AppText className="mt-2 text-[14px] leading-5 text-muted">
            We’ll use this for better matching and placement. You can change it anytime from You.
          </AppText>
        </Card>
        <Button title="Continue" size="lg" onPress={finish} />
      </View>
    );
  }

  return (
    <View className="gap-4 pb-8 pt-2">
      <View>
        <AppText className="text-[22px] font-extrabold text-charcoal">Fitness history</AppText>
        <AppText className="mt-1 text-[14px] leading-5 text-muted">
          A short snapshot for better challenge matching. Skip anything that doesn’t fit — no score, no
          judgment.
        </AppText>
      </View>

      <Question label="Where are you with training?">
        <View className="gap-2">
          {EXPERIENCE_OPTIONS.map((option) => {
            const selected = experience === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setValue('experience_level', option.value, { shouldDirty: true })}
                className="px-4 py-3"
                style={{
                  backgroundColor: selected ? THEME.accentSoft : THEME.surface,
                  borderWidth: 1,
                  borderColor: selected ? THEME.accent : THEME.border,
                  borderRadius: THEME.radius,
                }}>
                <AppText
                  className="text-[15px] font-extrabold"
                  style={{ color: selected ? THEME.accent : THEME.textPrimary }}>
                  {option.label}
                </AppText>
                <AppText className="mt-0.5 text-[13px] leading-5 text-muted">{option.hint}</AppText>
              </Pressable>
            );
          })}
        </View>
      </Question>

      <Question label="Aims">
        <ChipRow>
          {GOAL_OPTIONS.map((option) => {
            const selected = goals.includes(option.value);
            return (
              <Chip
                key={option.value}
                label={option.label}
                selected={selected}
                onPress={() =>
                  setValue('primary_goals', toggleString<PrimaryGoal>(goals, option.value), {
                    shouldDirty: true,
                  })
                }
              />
            );
          })}
        </ChipRow>
      </Question>

      <Question label="Training days most weeks">
        <ChipRow>
          {TRAINING_DAYS.map((option) => (
            <Chip
              key={option}
              label={option === 7 ? '7+' : `${option}`}
              selected={days === option}
              onPress={() => setValue('training_days_per_week', option, { shouldDirty: true })}
            />
          ))}
        </ChipRow>
      </Question>

      <Question label="Sports & activities" hint={copy('training.lastDoneHint')}>
        <ChipRow>
          {SPORT_PRESETS.map((name) => {
            const selected = sportRows.some((row) => row.name.toLowerCase() === name);
            return (
              <Chip
                key={name}
                label={sportLabel(name)}
                selected={selected}
                onPress={() => (selected ? removeSportNamed(name) : addSport(name))}
              />
            );
          })}
        </ChipRow>
        <View className="gap-3">
          {sports.fields.map((field, index) => (
            <View
              key={field.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                columnGap: 10,
              }}>
              <View
                style={{
                  flexShrink: 0,
                  maxWidth: '38%',
                  backgroundColor: THEME.accent,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  minHeight: 36,
                  justifyContent: 'center',
                }}>
                <AppText
                  numberOfLines={1}
                  className="text-sm font-semibold"
                  style={{
                    color: THEME.accentForeground,
                    flexShrink: 0,
                  }}>
                  {sportLabel(field.name)}
                </AppText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Controller
                  control={control}
                  name={`sports.${index}.last_done`}
                  render={({ field: { value, onChange } }) => (
                    <LastDoneSlider
                      value={asLastDone(value)}
                      onChange={(next: LastDoneBucket) => onChange(next)}
                      accessibilityLabel={`${sportLabel(field.name)} last done`}
                    />
                  )}
                />
              </View>
            </View>
          ))}
        </View>
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Input
              label="Something else"
              value={customSport ?? ''}
              onChangeText={(text) => setValue('custom_sport', text)}
              placeholder="e.g. rowing"
              autoCapitalize="none"
            />
          </View>
          <Button title="Add" size="sm" className="mb-1" onPress={() => addSport(customSport ?? '')} />
        </View>
      </Question>

      <Question label="Last mile time" hint="A recent mile, not a PR hunt. Never is a totally fine answer.">
        <ChipRow>
          <Chip
            label="Never"
            selected={mileKind === 'never'}
            onPress={() => {
              setValue('last_mile_kind', 'never');
              setValue('last_mile_run', 'never');
            }}
          />
          <Chip
            label="I have a time"
            selected={mileKind === 'time'}
            onPress={() => setValue('last_mile_kind', 'time')}
          />
        </ChipRow>
        {mileKind === 'time' ? (
          <Controller
            control={control}
            name="last_mile_time"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Time"
                keyboardType="numbers-and-punctuation"
                inputMode="decimal"
                placeholder="8:45"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                hint="Minutes:seconds"
              />
            )}
          />
        ) : null}
      </Question>

      <Question label="Anything we should work around?" hint="Optional. Helps us avoid the wrong kind of challenge.">
        <ChipRow>
          <Chip
            label="Nothing right now"
            selected={limitations.length === 0}
            onPress={() => setValue('limitations', [])}
          />
          {LIMITATION_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={limitations.includes(option.value)}
              onPress={() => setValue('limitations', toggleString(limitations, option.value))}
            />
          ))}
        </ChipRow>
        {limitations.length > 0 ? (
          <Controller
            control={control}
            name="limitations_notes"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                label="Notes (optional)"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                placeholder="Whatever you want us to know."
              />
            )}
          />
        ) : null}
      </Question>

      <Question label="Preferred units">
        <UnitToggle
          value={units}
          onChange={(next: BodyUnitSystem) => setValue('preferred_units', next, { shouldDirty: true })}
        />
      </Question>

      <Question label="What can you train with?">
        <ChipRow>
          {EQUIPMENT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={equipment.includes(option.value)}
              onPress={() => setValue('equipment_access', toggleString(equipment, option.value))}
            />
          ))}
        </ChipRow>
      </Question>

      {errors.experience_level || errors.training_days_per_week ? (
        <AppText className="text-[13px]" style={{ color: THEME.danger }}>
          Pick an experience level and how often you train.
        </AppText>
      ) : null}
      {formError ? (
        <AppText className="text-[13px]" style={{ color: THEME.danger }}>
          {formError}
        </AppText>
      ) : null}

      <Button
        title="Save & continue"
        size="lg"
        loading={isSubmitting || updateProfile.isPending}
        onPress={() => void onSubmit()}
      />
      {onSkip ? <Button title="Skip for now" variant="ghost" size="lg" onPress={onSkip} /> : null}
    </View>
  );
}

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <AppText className="text-[15px] font-extrabold text-charcoal">{label}</AppText>
      {hint ? <AppText className="text-[13px] leading-5 text-muted">{hint}</AppText> : null}
      {children}
    </View>
  );
}

function buildDefaults(profile?: Profile | null): FormValues {
  const data = fitnessProfileFromUser(profile);
  const never = data.last_mile_run === 'never';
  return {
    ...data,
    primary_goals: data.primary_goals ?? [],
    last_mile_kind: never ? 'never' : 'time',
    last_mile_time: never ? '' : data.last_mile_run,
    custom_sport: '',
  };
}
