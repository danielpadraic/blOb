import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { z } from 'zod';

import { BodyFatSlider } from '@/components/profile/BodyFatSlider';
import { MorphingBlob } from '@/components/profile/MorphingBlob';
import { UnitToggle } from '@/components/profile/UnitToggle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { AppText } from '@/components/ui/AppText';
import { useUpdateProfile } from '@/hooks/useProfile';
import {
  BODY_FAT_DEFAULT,
  BODY_FAT_MAX,
  BODY_FAT_MIN,
  calcBmi,
  clampBodyFat,
  displayHeightParts,
  displayWeight,
  formatBmi,
  inputHeightToCm,
  inputWeightToKg,
  profileWeightKg,
  unitSystemFromWeightUnit,
  weightUnitFromSystem,
  type BodyGender,
  type BodyUnitSystem,
} from '@/lib/bodyMetrics';
import { THEME } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { prettyNumber } from '@/utils/units';

const GENDER_OPTIONS = [
  { value: 'female' as const, label: 'Female' },
  { value: 'male' as const, label: 'Male' },
];

const schema = z
  .object({
    gender: z.enum(['male', 'female']),
    units: z.enum(['imperial', 'metric']),
    height_cm: z.string().optional(),
    height_ft: z.string().optional(),
    height_in: z.string().optional(),
    weight: z.string().min(1, 'Add your weight'),
    body_fat_pct: z.number(),
  })
  .superRefine((values, ctx) => {
    if (values.units === 'imperial') {
      const feet = Number(values.height_ft);
      const inches = Number(values.height_in || '0');
      if (!values.height_ft?.trim() || !Number.isFinite(feet) || feet < 4 || feet > 7) {
        ctx.addIssue({ code: 'custom', path: ['height_ft'], message: 'Height is usually 4–7 feet' });
      }
      if (!Number.isFinite(inches) || inches < 0 || inches >= 12) {
        ctx.addIssue({ code: 'custom', path: ['height_in'], message: 'Inches should be 0–11' });
      }
      const pounds = Number(values.weight);
      if (!Number.isFinite(pounds) || pounds < 70 || pounds > 500) {
        ctx.addIssue({ code: 'custom', path: ['weight'], message: 'That weight looks off' });
      }
      return;
    }
    const cm = Number(values.height_cm);
    if (!values.height_cm?.trim() || !Number.isFinite(cm) || cm < 100 || cm > 250) {
      ctx.addIssue({ code: 'custom', path: ['height_cm'], message: 'Height should be 100–250 cm' });
    }
    const kilos = Number(values.weight);
    if (!Number.isFinite(kilos) || kilos < 30 || kilos > 250) {
      ctx.addIssue({ code: 'custom', path: ['weight'], message: 'That weight looks off' });
    }
  });

type FormValues = z.infer<typeof schema>;

type BodyMetricsFormProps = {
  profile?: Profile | null;
  onSkip?: () => void;
  afterSave?: () => void;
};

export function BodyMetricsForm({ profile, onSkip, afterSave }: BodyMetricsFormProps) {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const [exactOpen, setExactOpen] = useState(false);
  const [exactDraft, setExactDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults = useMemo(() => buildDefaults(profile), [profile]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const gender = watch('gender');
  const units = watch('units');
  const bodyFat = watch('body_fat_pct');
  const heightCmWatch = watch('height_cm');
  const heightFt = watch('height_ft');
  const heightIn = watch('height_in');
  const weightWatch = watch('weight');

  const liveBmi = useMemo(() => {
    const heightCm = inputHeightToCm({
      system: units,
      cm: Number(heightCmWatch),
      feet: Number(heightFt),
      inches: Number(heightIn),
    });
    const weightKg = inputWeightToKg(Number(weightWatch), units);
    if (!heightCm || !Number.isFinite(weightKg) || weightKg <= 0) {
      return null;
    }
    return calcBmi(heightCm, weightKg);
  }, [heightCmWatch, heightFt, heightIn, units, weightWatch]);

  useEffect(() => {
    setExactDraft(String(Math.round(bodyFat)));
  }, [bodyFat]);

  function switchUnits(next: BodyUnitSystem) {
    const current = getValues('units');
    if (current === next) {
      return;
    }
    const heightCm = inputHeightToCm({
      system: current,
      cm: Number(getValues('height_cm')),
      feet: Number(getValues('height_ft')),
      inches: Number(getValues('height_in')),
    });
    const weightKg = inputWeightToKg(Number(getValues('weight')), current);
    const parts = heightCm ? displayHeightParts(heightCm, next) : { cm: '', feet: '', inches: '' };
    setValue('height_cm', parts.cm, { shouldValidate: false });
    setValue('height_ft', parts.feet, { shouldValidate: false });
    setValue('height_in', parts.inches, { shouldValidate: false });
    if (Number.isFinite(weightKg) && weightKg > 0) {
      setValue('weight', prettyNumber(displayWeight(weightKg, next)), { shouldValidate: false });
    }
    setValue('units', next, { shouldValidate: true });
  }

  function applyExact() {
    const next = clampBodyFat(Number(exactDraft));
    setValue('body_fat_pct', next, { shouldDirty: true });
    setExactOpen(false);
  }

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

  const onSubmit = handleSubmit(async (values) => {
    const heightCm = inputHeightToCm({
      system: values.units,
      cm: Number(values.height_cm),
      feet: Number(values.height_ft),
      inches: Number(values.height_in),
    });
    const weightKg = inputWeightToKg(Number(values.weight), values.units);
    if (!heightCm || !Number.isFinite(weightKg)) {
      setFormError('Add a height and weight first.');
      return;
    }
    setFormError(null);
    try {
      await updateProfile.mutateAsync({
        gender: values.gender,
        height_cm: heightCm,
        current_weight: weightKg,
        weight_unit: weightUnitFromSystem(values.units),
        body_fat_pct: clampBodyFat(values.body_fat_pct),
        body_metrics_completed_at: new Date().toISOString(),
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
          <AppText className="text-[22px] font-extrabold text-charcoal">You’re set</AppText>
          <AppText className="mt-2 text-[14px] leading-5 text-muted">
            Official Fitness Challenges are unlocked whenever you want them. Nothing here is a grade.
          </AppText>
        </Card>
        <Button title="Continue" size="lg" onPress={finish} />
      </View>
    );
  }

  return (
    <View className="gap-4 pb-8 pt-2">
      <View>
        <AppText className="text-[22px] font-extrabold text-charcoal">Body metrics</AppText>
        <AppText className="mt-1 text-[14px] leading-5 text-muted">
          Used for Official Fitness Challenges and better matching. Private unless you share stats.
        </AppText>
      </View>

      <Controller
        control={control}
        name="gender"
        render={({ field: { value, onChange } }) => (
          <SegmentedControl
            value={value}
            options={GENDER_OPTIONS}
            onChange={onChange}
            accessibilityLabel="Gender"
          />
        )}
      />

      <MorphingBlob gender={gender} bodyFatPct={bodyFat} />

      <Controller
        control={control}
        name="body_fat_pct"
        render={({ field: { value, onChange } }) => <BodyFatSlider value={value} onChange={onChange} />}
      />

      {exactOpen ? (
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Input
              label="Exact body fat %"
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
        <Pressable onPress={() => setExactOpen(true)} accessibilityRole="button">
          <AppText className="text-[13px] font-semibold" style={{ color: THEME.accent }}>
            Enter exact %
          </AppText>
        </Pressable>
      )}

      <UnitToggle value={units} onChange={switchUnits} />

      {units === 'imperial' ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={control}
              name="height_ft"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Height (ft)"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={value ?? ''}
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
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="10"
                  error={errors.height_in?.message}
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
              label="Height (cm)"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={value ?? ''}
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
        name="weight"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={units === 'imperial' ? 'Weight (lb)' : 'Weight (kg)'}
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={units === 'imperial' ? '165' : '75'}
            error={errors.weight?.message}
          />
        )}
      />

      <Card>
        <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">BMI</AppText>
        <AppText className="mt-1 text-[28px] font-extrabold text-charcoal">{formatBmi(liveBmi)}</AppText>
        <AppText className="mt-1 text-[13px] leading-5 text-muted">
          A rough height-to-weight ratio. Not a grade, not a verdict.
        </AppText>
      </Card>

      {errors.gender ? (
        <AppText className="text-[13px]" style={{ color: THEME.danger }}>
          {errors.gender.message}
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

function buildDefaults(profile?: Profile | null): FormValues {
  const units = unitSystemFromWeightUnit(profile?.weight_unit);
  const heightCm = profile?.height_cm ?? 0;
  const parts = heightCm > 0 ? displayHeightParts(heightCm, units) : { cm: '', feet: '', inches: '' };
  const kg = profileWeightKg(profile ?? {});
  const gender: BodyGender =
    profile?.gender === 'male' || profile?.gender === 'female' ? profile.gender : 'female';
  return {
    gender,
    units,
    height_cm: parts.cm,
    height_ft: parts.feet,
    height_in: parts.inches,
    weight: kg ? prettyNumber(displayWeight(kg, units)) : '',
    body_fat_pct: profile?.body_fat_pct != null ? clampBodyFat(Number(profile.body_fat_pct)) : BODY_FAT_DEFAULT,
  };
}
