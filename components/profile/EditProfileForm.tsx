import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Pressable, ScrollView, View } from 'react-native';

import { BodyFatSlider } from '@/components/profile/BodyFatSlider';
import { LastDoneSlider } from '@/components/profile/LastDoneSlider';
import { BfpSliderCopy, MotivationToneChips } from '@/components/profile/MotivationToneChips';
import { MorphingBlob } from '@/components/profile/MorphingBlob';
import { UnitToggle } from '@/components/profile/UnitToggle';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useUpdateProfile, useUploadAvatar, useUsernameAvailability } from '@/hooks/useProfile';
import {
  BODY_FAT_DEFAULT,
  BODY_FAT_MAX,
  BODY_FAT_MIN,
  calcBmi,
  clampBodyFat,
  formatBmi,
  hasCompletedBodyMetrics,
  inputWeightToKg,
  preferredUnitSystem,
  profileWeightKg,
} from '@/lib/bodyMetrics';
import { ACTIVITY_OPTIONS, WORKOUT_FREQUENCY_OPTIONS } from '@/lib/constants';
import { asCopyTone, copy, type CopyTone } from '@/lib/copy';
import {
  GOAL_OPTIONS,
  LAST_DONE_DEFAULT,
  SPORT_PRESETS,
  asLastDone,
  clampDays,
  fitnessProfileFromUser,
  sportLabel,
  toggleString,
  type LastDoneBucket,
  type PrimaryGoal,
} from '@/lib/fitnessProfile';
import { pickCropProfilePhoto } from '@/lib/profilePhoto';
import { TAB_BAR_PEEK, THEME, themeShadow } from '@/lib/theme';
import type { Profile, ProfileUpdate, WeightUnit } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { cmToFeetInches, convertWeight, feetInchesToCm, prettyNumber } from '@/utils/units';
import { parseOptionalNumber } from '@/utils/validators';


const GENDER_OPTIONS = [
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
];

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'training', label: 'Training' },
  { id: 'physical', label: 'Physical Details' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

type EditValues = {
  username: string;
  display_name: string;
  bio: string;
  primary_activities: string[];
  typical_weekly_workout_frequency: string;
  primary_goals: PrimaryGoal[];
  sports: { name: string; last_done: LastDoneBucket }[];
  gender: 'male' | 'female' | '';
  height_cm: string;
  height_ft: string;
  height_in: string;
  current_weight: string;
  goal_weight: string;
  weight_unit: WeightUnit;
  body_fat_pct: number;
  motivation_tone: CopyTone;
  encouragement_tone: CopyTone;
  allow_profile_posts: boolean;
  mute_mentions: boolean;
  profile_visibility: 'public' | 'friends';
};

type FieldError = Partial<Record<keyof EditValues, string>>;

export function EditProfileForm({ profile }: { profile?: Profile | null }) {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<SectionId, number>>({ profile: 0, training: 0, physical: 0 });
  const [section, setSection] = useState<SectionId>('profile');
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>({});
  const [exactOpen, setExactOpen] = useState(false);
  const [exactDraft, setExactDraft] = useState(String(BODY_FAT_DEFAULT));

  const defaults = useMemo(() => buildDefaults(profile), [profile]);
  const {
    control,
    watch,
    setValue,
    getValues,
    reset,
    formState: { dirtyFields, isSubmitting },
  } = useForm<EditValues>({ defaultValues: defaults });

  useEffect(() => {
    reset(buildDefaults(profile));
  }, [profile, reset]);

  const username = watch('username');
  const activities = watch('primary_activities');
  const frequency = watch('typical_weekly_workout_frequency');
  const goals = watch('primary_goals');
  const unit = watch('weight_unit');
  const gender = watch('gender');
  const bodyFat = watch('body_fat_pct');
  const tone = watch('motivation_tone');
  const heightCmWatch = watch('height_cm');
  const heightFt = watch('height_ft');
  const heightIn = watch('height_in');
  const currentWeight = watch('current_weight');
  const sportRows = watch('sports');
  const availability = useUsernameAvailability(username, profile?.username);
  const sports = useFieldArray({ control, name: 'sports' });

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
    setExactDraft(String(Math.round(clampBodyFat(Number(bodyFat)))));
  }, [bodyFat]);

  function jump(id: SectionId) {
    setSection(id);
    scrollRef.current?.scrollTo({ y: Math.max(sectionY.current[id] - 8, 0), animated: true });
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 1800);
  }

  async function pickAvatar() {
    if (!user) {
      return;
    }
    try {
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

  function switchUnits(next: WeightUnit) {
    const current = getValues('weight_unit');
    if (current === next) {
      return;
    }
    const heightCm =
      current === 'lb'
        ? feetInchesToCm(Number(getValues('height_ft') || 0), Number(getValues('height_in') || 0))
        : Number(getValues('height_cm') || 0);
    if (heightCm > 0) {
      if (next === 'lb') {
        const { feet, inches } = cmToFeetInches(heightCm);
        setValue('height_ft', String(feet), { shouldDirty: true });
        setValue('height_in', String(inches), { shouldDirty: true });
      } else {
        setValue('height_cm', prettyNumber(heightCm), { shouldDirty: true });
      }
    }
    const weight = Number(getValues('current_weight'));
    if (Number.isFinite(weight) && weight > 0) {
      setValue('current_weight', prettyNumber(convertWeight(weight, current, next)), { shouldDirty: true });
    }
    const goalWeight = Number(getValues('goal_weight'));
    if (Number.isFinite(goalWeight) && goalWeight > 0) {
      setValue('goal_weight', prettyNumber(convertWeight(goalWeight, current, next)), { shouldDirty: true });
    }
    setValue('weight_unit', next, { shouldDirty: true });
  }

  function addSport(name: string) {
    const label = name.trim();
    if (!label || sportRows.some((row) => row.name.toLowerCase() === label.toLowerCase())) {
      return;
    }
    sports.append({ name: label, last_done: LAST_DONE_DEFAULT });
  }

  function removeSportNamed(name: string) {
    const index = sportRows.findIndex((row) => row.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      sports.remove(index);
    }
  }

  async function onSave() {
    const values = getValues();
    const dirty = dirtyFields;
    const nextErrors: FieldError = {};
    const touchedPhysical =
      Boolean(dirty.gender) ||
      Boolean(dirty.height_cm) ||
      Boolean(dirty.height_ft) ||
      Boolean(dirty.height_in) ||
      Boolean(dirty.current_weight) ||
      Boolean(dirty.goal_weight) ||
      Boolean(dirty.weight_unit) ||
      Boolean(dirty.body_fat_pct);

    if (dirty.username) {
      if (!/^[a-z0-9_]{3,24}$/.test(values.username) || values.username.startsWith('blob_')) {
        nextErrors.username = 'Use a lowercase username, 3–24 characters';
      } else if (availability.isTaken) {
        nextErrors.username = 'That username is taken';
      }
    }
    if (dirty.display_name && values.display_name.trim().length < 2) {
      nextErrors.display_name = 'Enter a display name';
    }
    if (dirty.bio && values.bio.length > 160) {
      nextErrors.bio = 'Keep it to 160 characters';
    }
    if (dirty.primary_activities && values.primary_activities.length === 0) {
      nextErrors.primary_activities = 'Pick at least one activity';
    }
    if (dirty.current_weight && values.current_weight.trim()) {
      const n = Number(values.current_weight);
      if (!Number.isFinite(n) || n <= 0) {
        nextErrors.current_weight = 'That weight looks off';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldError(nextErrors);
      return;
    }
    setFieldError({});
    setFormError(null);

    const patch: ProfileUpdate = {};
    if (dirty.username) {
      patch.username = values.username.trim().toLowerCase();
    }
    if (dirty.display_name) {
      patch.display_name = values.display_name.trim();
    }
    if (dirty.bio) {
      patch.bio = values.bio.trim() || null;
    }
    if (dirty.motivation_tone) {
      patch.motivation_tone = asCopyTone(values.motivation_tone);
    }
    if (dirty.encouragement_tone) {
      patch.encouragement_tone = asCopyTone(values.encouragement_tone);
    }
    if (dirty.allow_profile_posts) {
      patch.allow_profile_posts = values.allow_profile_posts;
    }
    if (dirty.mute_mentions) {
      patch.mute_mentions = values.mute_mentions;
    }
    if (dirty.profile_visibility) {
      patch.profile_visibility = values.profile_visibility;
    }
    if (dirty.primary_activities) {
      patch.primary_activities = values.primary_activities;
    }
    if (dirty.typical_weekly_workout_frequency) {
      patch.typical_weekly_workout_frequency = parseOptionalNumber(
        values.typical_weekly_workout_frequency,
      );
    }

    const fitnessTouched = Boolean(dirty.primary_goals) || Boolean(dirty.sports);
    if (fitnessTouched || dirty.typical_weekly_workout_frequency) {
      const current = fitnessProfileFromUser(profile);
      patch.fitness_profile = {
        ...current,
        primary_goals: values.primary_goals,
        primary_goal: values.primary_goals[0] ?? current.primary_goal,
        sports: values.sports.map((row) => ({
          name: row.name.trim(),
          last_done: asLastDone(row.last_done),
        })),
        training_days_per_week: clampDays(
          parseOptionalNumber(values.typical_weekly_workout_frequency) ??
            current.training_days_per_week,
        ),
      };
    }

    if (touchedPhysical) {
      if (dirty.gender && (values.gender === 'male' || values.gender === 'female')) {
        patch.gender = values.gender;
      }
      if (dirty.weight_unit) {
        patch.weight_unit = values.weight_unit;
        patch.fitness_profile = {
          ...(patch.fitness_profile ?? fitnessProfileFromUser(profile)),
          preferred_units: values.weight_unit === 'kg' ? 'metric' : 'imperial',
        };
      }
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
        goal != null ? inputWeightToKg(goal, values.weight_unit === 'kg' ? 'metric' : 'imperial') : null;
      if (Number.isFinite(heightCm) && heightCm >= 100) {
        patch.height_cm = heightCm;
      }
      if (Number.isFinite(weightKg) && weightKg >= 30) {
        patch.current_weight = weightKg;
      }
      if (dirty.goal_weight) {
        patch.goal_weight = goalKg;
      }
      if (dirty.body_fat_pct) {
        patch.body_fat_pct = clampBodyFat(values.body_fat_pct);
      }
      const complete =
        (patch.gender === 'male' ||
          patch.gender === 'female' ||
          profile?.gender === 'male' ||
          profile?.gender === 'female') &&
        (patch.height_cm != null || profile?.height_cm != null) &&
        (patch.current_weight != null || profile?.current_weight != null);
      if (complete && !hasCompletedBodyMetrics(profile)) {
        patch.body_metrics_completed_at = new Date().toISOString();
      }
    }

    if (Object.keys(patch).length === 0) {
      showToast(copy('profile.saved'));
      scrollRef.current?.scrollTo({ y: 0 });
      return;
    }

    try {
      await updateProfile.mutateAsync(patch);
      showToast(copy('profile.saved'));
      scrollRef.current?.scrollTo({ y: 0 });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <View className="flex-1 px-4 pt-2">
        <ChipRow>
          {SECTIONS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              selected={section === item.id}
              onPress={() => jump(item.id)}
            />
          ))}
        </ChipRow>

        <ScrollView
          ref={scrollRef}
          className="mt-4 flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}>
          <View onLayout={(event) => { sectionY.current.profile = event.nativeEvent.layout.y; }} className="gap-4">
            <AppText className="text-[18px] font-extrabold text-charcoal">Profile</AppText>
            <Pressable
              className="items-center"
              onPress={() => void pickAvatar()}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo">
              <Avatar
                uri={profile?.avatar_url}
                name={watch('display_name') || watch('username')}
                size={96}
              />
              <AppText className="mt-3 text-sm font-semibold text-charcoal">
                {uploadAvatar.isPending ? 'Uploading…' : 'Change photo'}
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
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldError.username}
                />
              )}
            />
            <Controller
              control={control}
              name="display_name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Display name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldError.display_name}
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
                  error={fieldError.bio}
                />
              )}
            />
            <MotivationToneChips
              value={tone}
              onChange={(next) => setValue('motivation_tone', next, { shouldDirty: true })}
            />
            <MotivationToneChips
              value={watch('encouragement_tone')}
              label={copy('profile.encouragementLabel')}
              onChange={(next) => setValue('encouragement_tone', next, { shouldDirty: true })}
            />
            <SettingToggle
              label={copy('wall.allow')}
              value={watch('allow_profile_posts')}
              onChange={(next) => setValue('allow_profile_posts', next, { shouldDirty: true })}
            />
            <SettingToggle
              label={copy('wall.muteMentions')}
              value={watch('mute_mentions')}
              onChange={(next) => setValue('mute_mentions', next, { shouldDirty: true })}
            />
          </View>

          <View
            onLayout={(event) => { sectionY.current.training = event.nativeEvent.layout.y; }}
            className="mt-8 gap-4">
            <AppText className="text-[18px] font-extrabold text-charcoal">Training</AppText>
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
                        setValue('primary_activities', next, { shouldDirty: true, shouldValidate: false });
                      }}
                    />
                  );
                })}
              </ChipRow>
              {fieldError.primary_activities ? (
                <AppText className="text-xs text-coral-dark">{fieldError.primary_activities}</AppText>
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
                      setValue('typical_weekly_workout_frequency', String(option), { shouldDirty: true })
                    }
                  />
                ))}
              </ChipRow>
            </Card>
            <Card className="gap-4">
              <AppText className="text-base font-semibold text-charcoal">{copy('training.aims')}</AppText>
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
            </Card>
            <Card className="gap-4">
              <AppText className="text-base font-semibold text-charcoal">Sports & activities</AppText>
              <AppText className="text-[13px] leading-5 text-muted">
                {copy('training.lastDoneHint')}
              </AppText>
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
                    style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10 }}>
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
                        style={{ color: THEME.accentForeground, flexShrink: 0 }}>
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
                            onChange={(next) => onChange(next)}
                            accessibilityLabel={`${sportLabel(field.name)} last done`}
                          />
                        )}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          </View>

          <View
            onLayout={(event) => { sectionY.current.physical = event.nativeEvent.layout.y; }}
            className="mt-8 gap-4 pb-4">
            <AppText className="text-[18px] font-extrabold text-charcoal">Physical Details</AppText>
            <AppText className="text-[13px] leading-5 text-muted">
              Always private. Used for Challenge recommendations and competition placement. Not required
              to save a name or photo.
            </AppText>
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
            </View>
            <View className="gap-2">
              <AppText className="text-sm font-semibold text-charcoal">Units</AppText>
              <UnitToggle
                value={unit === 'kg' ? 'metric' : 'imperial'}
                onChange={(next) => switchUnits(next === 'metric' ? 'kg' : 'lb')}
              />
            </View>
            {unit === 'lb' ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="height_ft"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="Feet"
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="5"
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
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="10"
                      />
                    )}
                  />
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
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="178"
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
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={unit === 'lb' ? '165' : '75'}
                  error={fieldError.current_weight}
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
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional"
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
                <View className="mt-1 gap-2">
                  <BfpSliderCopy tone={tone} />
                  <Controller
                    control={control}
                    name="body_fat_pct"
                    render={({ field: { value, onChange } }) => (
                      <BodyFatSlider value={value} onChange={(next) => onChange(clampBodyFat(next))} />
                    )}
                  />
                </View>
                {exactOpen ? (
                  <View className="mt-2 flex-row items-end gap-2">
                    <View className="flex-1">
                      <Input
                        label={copy('bfp.exactLabel')}
                        keyboardType="decimal-pad"
                        value={exactDraft}
                        onChangeText={setExactDraft}
                        placeholder={`${BODY_FAT_MIN}–${BODY_FAT_MAX}`}
                      />
                    </View>
                    <Button
                      title="Set"
                      size="sm"
                      className="mb-1"
                      onPress={() => {
                        setValue('body_fat_pct', clampBodyFat(Number(exactDraft)), { shouldDirty: true });
                        setExactOpen(false);
                      }}
                    />
                  </View>
                ) : (
                  <Pressable className="mt-2" onPress={() => setExactOpen(true)} accessibilityRole="button">
                    <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
                      {copy('bfp.enterExact')}
                    </AppText>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>

        {formError ? (
          <AppText className="pb-2 text-sm text-coral-dark">{formError}</AppText>
        ) : null}
        {toast ? (
          <View className="mb-2 items-center">
            <View
              className="px-4 py-2.5"
              style={{
                backgroundColor: THEME.primary,
                borderRadius: 16,
                ...themeShadow('card'),
              }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                {toast}
              </AppText>
            </View>
          </View>
        ) : null}
        <View style={{ paddingBottom: 8 + TAB_BAR_PEEK }}>
          <Button
            title={copy('profile.update')}
            size="lg"
            loading={isSubmitting || updateProfile.isPending}
            onPress={() => void onSave()}
          />
        </View>
      </View>
    </Screen>
  );
}

function buildDefaults(profile?: Profile | null): EditValues {
  const unit: WeightUnit = preferredUnitSystem(profile) === 'metric' ? 'kg' : 'lb';
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
      ? prettyNumber(unit === 'kg' ? goalKg : convertWeight(goalKg, 'kg', 'lb'))
      : '';
  const fitness = fitnessProfileFromUser(profile);
  return {
    username: profile?.username?.startsWith('blob_') ? '' : (profile?.username ?? ''),
    display_name: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
    primary_activities: (profile?.primary_activities ?? []).filter((item) =>
      ACTIVITY_OPTIONS.includes(item as (typeof ACTIVITY_OPTIONS)[number]),
    ),
    typical_weekly_workout_frequency:
      profile?.typical_weekly_workout_frequency != null
        ? String(profile.typical_weekly_workout_frequency)
        : '',
    primary_goals: fitness.primary_goals ?? [],
    sports: fitness.sports.map((row) => ({
      name: row.name,
      last_done: asLastDone(row.last_done),
    })),
    gender: profile?.gender === 'male' || profile?.gender === 'female' ? profile.gender : '',
    height_cm: heightCm,
    height_ft: heightFt,
    height_in: heightIn,
    current_weight: displayWeight,
    goal_weight: displayGoal,
    weight_unit: unit,
    body_fat_pct:
      profile?.body_fat_pct != null ? clampBodyFat(Number(profile.body_fat_pct)) : BODY_FAT_DEFAULT,
    motivation_tone: asCopyTone(profile?.motivation_tone),
    encouragement_tone: asCopyTone(profile?.encouragement_tone),
    allow_profile_posts: profile?.allow_profile_posts !== false,
    mute_mentions: Boolean(profile?.mute_mentions),
    profile_visibility: profile?.profile_visibility === 'friends' ? 'friends' : 'public',
  };
}

function SettingToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      className="flex-row items-center justify-between"
      style={{ minHeight: 44 }}>
      <AppText className="mr-3 flex-1 text-[14px] leading-5 text-charcoal">{label}</AppText>
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 2,
          backgroundColor: value ? THEME.accent : THEME.border,
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: THEME.surface,
            alignSelf: value ? 'flex-end' : 'flex-start',
          }}
        />
      </View>
    </Pressable>
  );
}
