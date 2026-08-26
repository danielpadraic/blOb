import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyFatSlider } from '@/components/profile/BodyFatSlider';
import { BfpSliderCopy, MotivationToneChips } from '@/components/profile/MotivationToneChips';
import { MorphingBlob, preloadBodyFatFrames } from '@/components/profile/MorphingBlob';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { KeyboardField, KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SetupProgress } from '@/components/ui/SetupProgress';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  useCompleteProfile,
  useMyProfile,
  useUploadAvatar,
  useUsernameAvailability,
} from '@/hooks/useProfile';
import {
  ACTIVITY_OPTIONS,
  WORKOUT_FREQUENCY_OPTIONS,
} from '@/lib/constants';
import {
  BODY_FAT_DEFAULT,
  BODY_FAT_MAX,
  BODY_FAT_MIN,
  calcBmi,
  clampBodyFat,
  formatBmi,
  inputWeightToKg,
  profileWeightKg,
} from '@/lib/bodyMetrics';
import { asCopyTone, copy, type CopyTone } from '@/lib/copy';
import { hasCompletedFitnessHistory } from '@/lib/fitnessProfile';
import { ensureOwnProfileRow, pickCropProfilePhoto } from '@/lib/profilePhoto';
import { FITNESS_HISTORY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { WeightUnit } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import {
  cmToFeetInches,
  convertWeight,
  feetInchesToCm,
  prettyNumber,
} from '@/utils/units';
import { normalizeUsername, usernameHandleLabel } from '@/lib/username';
import {
  PROFILE_STEP_FIELDS,
  hasAcceptedLegal,
  parseOptionalNumber,
  profileSetupSchema,
  type ProfileSetupValues,
} from '@/utils/validators';

const UNIT_OPTIONS = [
  { value: 'lb' as const, label: 'ft / in + lb' },
  { value: 'kg' as const, label: 'cm + kg' },
];

const GENDER_OPTIONS = [
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
];

const STEP_COPY = [
  {
    title: 'Join the lobby',
    body: 'We’ll set your name, training, and a starting wallet of 100 Coins.',
  },
  {
    title: 'Training',
    body: 'Used to match you with the right Challenges.',
  },
  {
    title: 'Physical Details',
    body: 'Always private. Used for Challenge recommendations and competition placement.',
  },
] as const;

export function ProfileSetupWizard() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const completeProfile = useCompleteProfile();
  const uploadAvatar = useUploadAvatar();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [exactOpen, setExactOpen] = useState(false);
  const [exactDraft, setExactDraft] = useState(String(BODY_FAT_DEFAULT));
  const [tone, setTone] = useState<CopyTone>(() => asCopyTone(profile?.motivation_tone));

  const defaults = useMemo(() => buildDefaults(profile), [profile]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileSetupValues>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    reset(buildDefaults(profile));
  }, [profile, reset]);

  useEffect(() => {
    if (profile?.motivation_tone) {
      setTone(asCopyTone(profile.motivation_tone));
    }
  }, [profile?.motivation_tone]);

  const username = watch('username');
  const activities = watch('primary_activities');
  const unit = watch('weight_unit');
  const frequency = watch('typical_weekly_workout_frequency');
  const gender = watch('gender');
  const bodyFat = watch('body_fat_pct');
  const heightCmWatch = watch('height_cm');
  const heightFt = watch('height_ft');
  const heightIn = watch('height_in');
  const currentWeight = watch('current_weight');
  const availability = useUsernameAvailability(username, profile?.username);

  const liveHeightCm =
    unit === 'lb'
      ? feetInchesToCm(Number(heightFt || 0), Number(heightIn || 0))
      : Number(heightCmWatch);
  const liveWeightKg = inputWeightToKg(
    Number(currentWeight),
    unit === 'kg' ? 'metric' : 'imperial',
  );
  const liveBmi = useMemo(() => {
    if (!Number.isFinite(liveHeightCm) || liveHeightCm < 80 || !Number.isFinite(liveWeightKg) || liveWeightKg <= 0) {
      return null;
    }
    return calcBmi(liveHeightCm, liveWeightKg);
  }, [liveHeightCm, liveWeightKg]);
  const metricsReady =
    (gender === 'male' || gender === 'female') &&
    Number.isFinite(liveHeightCm) &&
    liveHeightCm >= 100 &&
    Number.isFinite(liveWeightKg) &&
    liveWeightKg >= 30;

  useEffect(() => {
    preloadBodyFatFrames();
  }, []);

  useEffect(() => {
    if (user?.id) {
      void ensureOwnProfileRow(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    setExactDraft(String(Math.round(clampBodyFat(Number(bodyFat)))));
  }, [bodyFat]);

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

    const weight = Number(getValues('current_weight'));
    if (Number.isFinite(weight) && weight > 0) {
      setValue(
        'current_weight',
        prettyNumber(convertWeight(weight, current, next)),
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
    if (!user) {
      setFormError('You need to be signed in.');
      return;
    }
    try {
      setFormError(null);
      const uri = await pickCropProfilePhoto();
      if (!uri) {
        return;
      }
      await uploadAvatar.mutateAsync(uri);
    } catch (error) {
      const message = getErrorMessage(error);
      setFormError(
        message === 'Turn on photo access in Settings.' ? message : copy('error.uploadPhoto'),
      );
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
      setFormError('That username is taken.');
      setStep(0);
      return;
    }
    setFormError(null);
    const heightCm =
      values.weight_unit === 'lb'
        ? feetInchesToCm(Number(values.height_ft), Number(values.height_in || 0))
        : Number(values.height_cm);
    const weightKg = inputWeightToKg(
      Number(values.current_weight),
      values.weight_unit === 'kg' ? 'metric' : 'imperial',
    );
    const goal = parseOptionalNumber(values.goal_weight);
    const goalKg =
      goal != null
        ? inputWeightToKg(goal, values.weight_unit === 'kg' ? 'metric' : 'imperial')
        : null;

    try {
      await completeProfile.mutateAsync({
        username: normalizeUsername(values.username),
        display_name: values.display_name,
        avatar_url: profile?.avatar_url,
        bio: values.bio || null,
        gender: values.gender,
        height_cm: Number.isFinite(heightCm) ? heightCm : null,
        current_weight: Number.isFinite(weightKg) ? weightKg : null,
        goal_weight: goalKg,
        weight_unit: values.weight_unit,
        body_fat_pct: clampBodyFat(values.body_fat_pct),
        body_metrics_completed_at: new Date().toISOString(),
        typical_weekly_workout_frequency: parseOptionalNumber(
          values.typical_weekly_workout_frequency,
        ),
        primary_activities: values.primary_activities,
        show_fitness_stats_publicly: false,
        motivation_tone: tone,
      });
      if (!hasCompletedFitnessHistory(profile)) {
        router.replace(FITNESS_HISTORY_HREF);
        return;
      }
      router.replace('/feed');
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  });

  const handleLabel = usernameHandleLabel(username);
  const usernameHint = availability.isChecking
    ? 'Checking…'
    : availability.isTaken
      ? 'That username is taken'
      : availability.isAvailable
        ? 'Available'
        : 'lowercase, unique, 3–24 characters';

  const stepCopy = STEP_COPY[step];

  function applyExact() {
    const next = clampBodyFat(Number(exactDraft));
    setValue('body_fat_pct', next, { shouldDirty: true });
    setExactOpen(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: THEME.background }} edges={['top', 'left', 'right']}>
    <KeyboardFormShell
      scrollToTopKey={step}
      paddingHorizontal={16}
      footer={
        <View className="gap-3">
          {formError ? (
            <AppText className="text-sm leading-5 text-coral-dark">{formError}</AppText>
          ) : null}
          {step < 2 ? (
            <Button
              title="Continue"
              size="lg"
              onPress={() => void goNext()}
              disabled={step === 0 && (availability.isTaken || availability.isChecking)}
            />
          ) : (
            <Button
              title="Finish"
              size="lg"
              onPress={onSubmit}
              loading={isSubmitting || completeProfile.isPending}
            />
          )}
          {step > 0 ? (
            <Button title="Back" variant="ghost" size="lg" onPress={() => setStep((current) => current - 1)} />
          ) : null}
        </View>
      }>
      <View className="items-center pt-2">
        <BlobMascot size={132} motion="float" />
        <AppText className="mt-5 text-3xl font-bold text-charcoal">{stepCopy.title}</AppText>
        <AppText className="mt-2 px-2 text-center leading-6 text-muted">{stepCopy.body}</AppText>
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
                onChangeText={(text) => onChange(normalizeUsername(text))}
                onBlur={onBlur}
                error={
                  errors.username?.message ??
                  (availability.isTaken ? 'That username is taken' : undefined)
                }
                hint={errors.username?.message || availability.isTaken ? undefined : usernameHint}
              />
            )}
          />
          {handleLabel ? (
            <AppText className="text-xs font-semibold" style={{ color: THEME.accent }}>
              {handleLabel}
            </AppText>
          ) : null}
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
                error={errors.bio?.message}
              />
            )}
          />
          <MotivationToneChips value={tone} onChange={setTone} />
        </View>
      ) : null}

      {step === 1 ? (
        <View className="mt-8 gap-5">
          <Card className="gap-4">
            <AppText className="text-base font-semibold text-charcoal">What do you train?</AppText>
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
            <AppText className="text-base font-semibold text-charcoal">Workouts per week</AppText>
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
            <AppText className="text-sm font-semibold text-charcoal">Gender</AppText>
            <Controller
              control={control}
              name="gender"
              render={({ field: { value, onChange } }) => (
                <SegmentedControl
                  value={value || null}
                  options={GENDER_OPTIONS}
                  onChange={onChange}
                  accessibilityLabel="Gender"
                />
              )}
            />
            {errors.gender ? (
              <AppText className="text-xs text-coral-dark">{errors.gender.message}</AppText>
            ) : null}
          </View>

          <View className="gap-2">
            <AppText className="text-sm font-semibold text-charcoal">Units</AppText>
            <SegmentedControl
              accessibilityLabel="Measurement units"
              value={unit}
              options={UNIT_OPTIONS}
              onChange={switchUnits}
            />
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
                  label="Height"
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
                error={errors.goal_weight?.message}
              />
            )}
          />

          {liveBmi != null ? (
            <Card>
              <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                BMI
              </AppText>
              <AppText className="mt-1 text-[28px] font-extrabold text-charcoal">
                {formatBmi(liveBmi)}
              </AppText>
            </Card>
          ) : null}

          {metricsReady && (gender === 'male' || gender === 'female') ? (
            <View>
              <MorphingBlob gender={gender} bodyFatPct={bodyFat} />
              <KeyboardField>
                <View className="mt-1 gap-2">
                  <BfpSliderCopy tone={tone} />
                  <Controller
                    control={control}
                    name="body_fat_pct"
                    render={({ field: { value, onChange } }) => (
                      <BodyFatSlider
                        value={value}
                        onChange={(next) => onChange(clampBodyFat(next))}
                      />
                    )}
                  />
                </View>
                {exactOpen ? (
                  <View className="mt-2 flex-row items-end gap-2">
                    <View className="flex-1">
                      <Input
                        label={copy('bfp.exactLabel')}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        value={exactDraft}
                        onChangeText={setExactDraft}
                        placeholder={`${BODY_FAT_MIN}–${BODY_FAT_MAX}`}
                      />
                    </View>
                    <Button title="Set" size="sm" className="mb-1" onPress={applyExact} />
                  </View>
                ) : (
                  <Pressable className="mt-2" onPress={() => setExactOpen(true)} accessibilityRole="button">
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      {copy('bfp.enterExact')}
                    </AppText>
                  </Pressable>
                )}
              </KeyboardField>
            </View>
          ) : (
            <Card>
              <AppText className="text-[13px] leading-5 text-muted">
                Add gender, height, and weight to set body fat.
              </AppText>
            </Card>
          )}
        </View>
      ) : null}
    </KeyboardFormShell>
    </SafeAreaView>
  );
}

export default function ProfileSetupScreen() {
  const { profile, isFetched } = useMyProfile();
  if (isFetched && !hasAcceptedLegal(profile)) {
    return <Redirect href={'/onboarding/legal' as Href} />;
  }
  return <ProfileSetupWizard />;
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

  const kg = profileWeightKg(profile ?? {});
  const displayWeight =
    kg != null ? prettyNumber(unit === 'kg' ? kg : convertWeight(kg, 'kg', 'lb')) : '';
  const goalKg = profile?.goal_weight;
  const displayGoal =
    goalKg != null && Number.isFinite(goalKg)
      ? prettyNumber(
          profile?.body_metrics_completed_at
            ? unit === 'kg'
              ? goalKg
              : convertWeight(goalKg, 'kg', 'lb')
            : unit === profile?.weight_unit
              ? goalKg
              : convertWeight(goalKg, profile?.weight_unit ?? 'lb', unit),
        )
      : '';

  return {
    username: profile?.username?.startsWith('blob_') ? '' : (profile?.username ?? ''),
    display_name: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
    gender: (profile?.gender === 'male' || profile?.gender === 'female'
      ? profile.gender
      : '') as ProfileSetupValues['gender'],
    height_cm: heightCm,
    height_ft: heightFt,
    height_in: heightIn,
    current_weight: displayWeight,
    goal_weight: displayGoal,
    weight_unit: unit,
    body_fat_pct:
      profile?.body_fat_pct != null ? clampBodyFat(Number(profile.body_fat_pct)) : BODY_FAT_DEFAULT,
    typical_weekly_workout_frequency:
      profile?.typical_weekly_workout_frequency != null
        ? String(profile.typical_weekly_workout_frequency)
        : '',
    primary_activities: (profile?.primary_activities ?? []).filter((item) =>
      ACTIVITY_OPTIONS.includes(item as (typeof ACTIVITY_OPTIONS)[number]),
    ) as ProfileSetupValues['primary_activities'],
    show_fitness_stats_publicly: false,
  };
}
