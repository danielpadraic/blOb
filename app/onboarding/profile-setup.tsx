import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Switch, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SetupProgress } from '@/components/ui/SetupProgress';
import { AppText } from '@/components/ui/AppText';
import {
  useCompleteProfile,
  useMyProfile,
  useUploadAvatar,
  useUsernameAvailability,
} from '@/hooks/useProfile';
import {
  ACTIVITY_OPTIONS,
  COLORS,
  SEED_CREDITS,
  WORKOUT_FREQUENCY_OPTIONS,
} from '@/lib/constants';
import type { WeightUnit } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import {
  cmToFeetInches,
  convertWeight,
  feetInchesToCm,
  prettyNumber,
} from '@/utils/units';
import {
  PROFILE_STEP_FIELDS,
  parseOptionalNumber,
  profileSetupSchema,
  type ProfileSetupValues,
} from '@/utils/validators';

const UNIT_OPTIONS = [
  { value: 'lb' as const, label: 'ft / in + lb' },
  { value: 'kg' as const, label: 'cm + kg' },
];

const STEP_COPY = [
  {
    title: 'Nice to meet you',
    body: 'This is how other blobs will know you. Take a minute — it only happens once.',
  },
  {
    title: 'How you train',
    body: 'No pressure to be perfect. Just honest.',
  },
  {
    title: 'Your body, privately',
    body: 'These stay private unless you choose to share them. Coins are never public.',
  },
] as const;

export default function ProfileSetupScreen() {
  const { profile } = useMyProfile();
  const completeProfile = useCompleteProfile();
  const uploadAvatar = useUploadAvatar();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const defaults = useMemo(() => buildDefaults(profile), [profile]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ProfileSetupValues>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: defaults,
  });

  const username = watch('username');
  const activities = watch('primary_activities');
  const unit = watch('weight_unit');
  const frequency = watch('typical_weekly_workout_frequency');
  const availability = useUsernameAvailability(username, profile?.username);

  function switchUnits(next: WeightUnit) {
    const current = getValues('weight_unit');
    if (current === next) {
      return;
    }

    const heightCm =
      current === 'lb'
        ? feetInchesToCm(
            Number(getValues('height_ft') || 0),
            Number(getValues('height_in') || 0),
          )
        : Number(getValues('height_cm') || 0);

    if (heightCm > 0) {
      if (next === 'lb') {
        const { feet, inches } = cmToFeetInches(heightCm);
        setValue('height_ft', String(feet), { shouldValidate: false });
        setValue('height_in', String(inches), { shouldValidate: false });
      } else {
        setValue('height_cm', prettyNumber(heightCm), { shouldValidate: false });
      }
    }

    const currentWeight = Number(getValues('current_weight'));
    if (Number.isFinite(currentWeight) && currentWeight > 0) {
      setValue(
        'current_weight',
        prettyNumber(convertWeight(currentWeight, current, next)),
        { shouldValidate: false },
      );
    }

    const goalWeight = Number(getValues('goal_weight'));
    if (Number.isFinite(goalWeight) && goalWeight > 0) {
      setValue('goal_weight', prettyNumber(convertWeight(goalWeight, current, next)), {
        shouldValidate: false,
      });
    }

    setValue('weight_unit', next, { shouldValidate: true });
  }

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('We need photo access to set your avatar. You can turn this on in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      try {
        setFormError(null);
        await uploadAvatar.mutateAsync(result.assets[0].uri);
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    }
  }

  async function goNext() {
    const fields = [...PROFILE_STEP_FIELDS[step as 0 | 1 | 2]];
    const valid = await trigger(fields);
    if (step === 0 && availability.isTaken) {
      return;
    }
    if (valid) {
      setFormError(null);
      setStep((current) => Math.min(current + 1, 2));
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (availability.isTaken) {
      setFormError('That username is taken. Try another one.');
      setStep(0);
      return;
    }
    setFormError(null);
    const heightCm =
      values.weight_unit === 'lb'
        ? feetInchesToCm(Number(values.height_ft), Number(values.height_in || 0))
        : Number(values.height_cm);

    try {
      await completeProfile.mutateAsync({
        username: values.username,
        display_name: values.display_name,
        avatar_url: profile?.avatar_url,
        bio: values.bio || null,
        height_cm: Number.isFinite(heightCm) ? heightCm : null,
        current_weight: parseOptionalNumber(values.current_weight),
        goal_weight: parseOptionalNumber(values.goal_weight),
        weight_unit: values.weight_unit,
        typical_weekly_workout_frequency: parseOptionalNumber(
          values.typical_weekly_workout_frequency,
        ),
        primary_activities: values.primary_activities,
        show_fitness_stats_publicly: values.show_fitness_stats_publicly,
      });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  });

  const usernameHint = availability.isChecking
    ? 'Checking if that’s free…'
    : availability.isTaken
      ? 'That username is taken'
      : availability.isAvailable
        ? 'Nice — that one’s free'
        : 'lowercase, unique, 3–24 characters';

  const copy = STEP_COPY[step];

  return (
    <Screen scroll>
      <View className="items-center pt-2">
        <BlobMascot size={132} motion="float" />
        <AppText className="mt-5 text-3xl font-bold text-charcoal">{copy.title}</AppText>
        <AppText className="mt-2 px-2 text-center leading-6 text-muted">{copy.body}</AppText>
      </View>

      <View className="mt-7">
        <SetupProgress step={step} />
      </View>

      {step === 0 ? (
        <View className="mt-8 gap-5">
          <Pressable
            className="items-center"
            onPress={() => void pickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Add a profile photo">
            <Avatar
              uri={profile?.avatar_url}
              name={watch('display_name') || watch('username')}
              size={96}
            />
            <AppText className="mt-3 text-sm font-semibold text-charcoal">
              {uploadAvatar.isPending ? 'Uploading…' : 'Add a photo'}
            </AppText>
            <AppText className="mt-1 text-xs text-muted">Optional, but it helps people find you.</AppText>
          </Pressable>
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Username"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={
                  errors.username?.message ??
                  (availability.isTaken ? 'That username is taken' : undefined)
                }
                hint={errors.username?.message || availability.isTaken ? undefined : usernameHint}
              />
            )}
          />
          <Controller
            control={control}
            name="display_name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Display name"
                textContentType="name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.display_name?.message}
                hint="Your real first name, a nickname — whatever feels right."
              />
            )}
          />
          <Controller
            control={control}
            name="bio"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Bio"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                placeholder="One sentence about how you train."
                error={errors.bio?.message}
              />
            )}
          />
        </View>
      ) : null}

      {step === 1 ? (
        <View className="mt-8 gap-5">
          <Card className="gap-4">
            <View className="gap-1">
              <AppText className="text-base font-semibold text-charcoal">
                Primary activities
              </AppText>
              <AppText className="text-sm leading-5 text-muted">
                Pick everything that counts for you.
              </AppText>
            </View>
            <ChipRow>
              {ACTIVITY_OPTIONS.map((activity) => {
                const selected = activities.includes(activity);
                return (
                  <Chip
                    key={activity}
                    label={activity === 'hiit' ? 'HIIT' : activity}
                    selected={selected}
                    onPress={() => {
                      const next = selected
                        ? activities.filter((item) => item !== activity)
                        : [...activities, activity];
                      setValue('primary_activities', next, { shouldValidate: true });
                    }}
                  />
                );
              })}
            </ChipRow>
            {errors.primary_activities ? (
              <AppText className="text-xs text-coral-dark">
                {errors.primary_activities.message}
              </AppText>
            ) : null}
          </Card>
          <Card className="gap-4">
            <View className="gap-1">
              <AppText className="text-base font-semibold text-charcoal">Typical week</AppText>
              <AppText className="text-sm leading-5 text-muted">
                How many workouts do you usually get in?
              </AppText>
            </View>
            <ChipRow>
              {WORKOUT_FREQUENCY_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  label={option === 7 ? '7+' : `${option}x`}
                  selected={frequency === String(option)}
                  onPress={() =>
                    setValue('typical_weekly_workout_frequency', String(option), {
                      shouldValidate: true,
                    })
                  }
                />
              ))}
            </ChipRow>
            {errors.typical_weekly_workout_frequency ? (
              <AppText className="text-xs text-coral-dark">
                {errors.typical_weekly_workout_frequency.message}
              </AppText>
            ) : null}
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <View className="mt-8 gap-5">
          <View className="gap-2">
            <AppText className="text-sm font-semibold text-charcoal">Units</AppText>
            <SegmentedControl
              accessibilityLabel="Measurement units"
              value={unit}
              options={UNIT_OPTIONS}
              onChange={switchUnits}
            />
            <AppText className="text-xs leading-5 text-muted">
              Switch anytime — we’ll convert what you’ve already entered.
            </AppText>
          </View>

          {unit === 'lb' ? (
            <View className="gap-2">
              <AppText className="text-sm font-semibold text-charcoal">Height</AppText>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="height_ft"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="Feet"
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={1}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="5"
                        error={errors.height_ft?.message}
                      />
                    )}
                  />
                </View>
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="height_in"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="Inches"
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={2}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="10"
                        error={errors.height_in?.message}
                      />
                    )}
                  />
                </View>
              </View>
            </View>
          ) : (
            <Controller
              control={control}
              name="height_cm"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Height (cm)"
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="178"
                  error={errors.height_cm?.message}
                />
              )}
            />
          )}

          <Controller
            control={control}
            name="current_weight"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={unit === 'lb' ? 'Current weight (lb)' : 'Current weight (kg)'}
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={unit === 'lb' ? '165' : '75'}
                error={errors.current_weight?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="goal_weight"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={unit === 'lb' ? 'Goal weight (lb)' : 'Goal weight (kg)'}
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Optional"
                hint="Optional. Skip it if you’re here for consistency, not the scale."
                error={errors.goal_weight?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="show_fitness_stats_publicly"
            render={({ field: { onChange, value } }) => (
              <Card className="flex-row items-center justify-between">
                <View className="mr-4 flex-1 gap-1">
                  <AppText className="font-semibold text-charcoal">Show stats publicly</AppText>
                  <AppText className="text-sm leading-5 text-muted">
                    Off by default. Your {SEED_CREDITS} starting coins stay private either way.
                  </AppText>
                </View>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
                  thumbColor={COLORS.white}
                  ios_backgroundColor={COLORS.line}
                />
              </Card>
            )}
          />
        </View>
      ) : null}

      {formError ? (
        <AppText className="mt-5 text-sm leading-5 text-coral-dark">{formError}</AppText>
      ) : null}

      <View className="mt-8 gap-3 pb-4">
        {step < 2 ? (
          <Button
            title="Continue"
            size="lg"
            onPress={() => void goNext()}
            disabled={step === 0 && (availability.isTaken || availability.isChecking)}
          />
        ) : (
          <Button
            title="Finish & Enter blOb"
            size="lg"
            onPress={onSubmit}
            loading={isSubmitting || completeProfile.isPending}
          />
        )}
        {step > 0 ? (
          <Button title="Back" variant="ghost" size="lg" onPress={() => setStep((current) => current - 1)} />
        ) : null}
      </View>
    </Screen>
  );
}

function buildDefaults(
  profile: ReturnType<typeof useMyProfile>['profile'],
): ProfileSetupValues {
  const unit: WeightUnit = profile?.weight_unit ?? 'lb';
  let heightFt = '';
  let heightIn = '';
  let heightCm = '';

  if (profile?.height_cm != null) {
    heightCm = prettyNumber(profile.height_cm);
    const { feet, inches } = cmToFeetInches(profile.height_cm);
    heightFt = String(feet);
    heightIn = String(inches);
  }

  return {
    username: profile?.username?.startsWith('blob_') ? '' : (profile?.username ?? ''),
    display_name: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
    height_cm: heightCm,
    height_ft: heightFt,
    height_in: heightIn,
    current_weight: profile?.current_weight != null ? prettyNumber(profile.current_weight) : '',
    goal_weight: profile?.goal_weight != null ? prettyNumber(profile.goal_weight) : '',
    weight_unit: unit,
    typical_weekly_workout_frequency:
      profile?.typical_weekly_workout_frequency != null
        ? String(profile.typical_weekly_workout_frequency)
        : '',
    primary_activities: (profile?.primary_activities ?? []).filter((item) =>
      ACTIVITY_OPTIONS.includes(item as (typeof ACTIVITY_OPTIONS)[number]),
    ) as ProfileSetupValues['primary_activities'],
    show_fitness_stats_publicly: profile?.show_fitness_stats_publicly ?? false,
  };
}
