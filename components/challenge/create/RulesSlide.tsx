import { Image } from 'expo-image';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { FieldAnchor, FieldLabel } from '@/components/challenge/create/wizardUi';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  EXTRA_RULE_PRESETS,
  RULE_ACTIVITY_PRESETS,
  consistencyRuleSentence,
  emptyExtraRule,
  isActivityPreset,
  type ExtraRuleKind,
} from '@/lib/consistencyRules';
import { CREATE_PROOF_TYPES, proofMeta } from '@/lib/constants';
import { THEME } from '@/lib/theme';
import type { ChallengeFrequency, ProofType } from '@/lib/types';
import type { CreateChallengeValues } from '@/utils/validators';

const PERIODS: { value: ChallengeFrequency; label: string }[] = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'once', label: 'Once' },
];

type Form = UseFormReturn<CreateChallengeValues>;

export function RulesSlide({
  control,
  errors,
  setValue,
  getValues,
  values,
  isPoints,
  isUnlimited,
  coverBusy,
  onFrequencyChange,
  onAddTask,
  onRemoveTask,
  onUploadCover,
  onClearCover,
}: {
  control: Form['control'];
  errors: Form['formState']['errors'];
  setValue: Form['setValue'];
  getValues: Form['getValues'];
  values: CreateChallengeValues;
  isPoints: boolean;
  isUnlimited: boolean;
  coverBusy: boolean;
  onFrequencyChange: (next: ChallengeFrequency) => void;
  onAddTask: () => void;
  onRemoveTask: (index: number) => void;
  onUploadCover: () => void;
  onClearCover: () => void;
}) {
  const extraRules = values.extra_rules ?? [];
  const activityIsCustom = !isActivityPreset(values.rule_activity);
  const periods = isUnlimited
    ? PERIODS.filter((item) => item.value === 'daily' || item.value === 'weekly')
    : PERIODS;
  const preview = consistencyRuleSentence(values);

  function toggleProof(type: ProofType) {
    const current = getValues('proofs');
    const next = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    setValue('proofs', next, { shouldValidate: true, shouldDirty: true });
  }

  function toggleTaskProof(index: number, type: ProofType) {
    const tasks = getValues('tasks');
    const task = tasks[index];
    if (!task) {
      return;
    }
    const current = task.proofs ?? [];
    const next = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    setValue(
      'tasks',
      tasks.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, proofs: next, proof_required: next.length > 0 }
          : item,
      ),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  function toggleExtraProof(index: number, type: ProofType) {
    const current = getValues('extra_rules');
    const rule = current[index];
    if (!rule) {
      return;
    }
    const proofs = rule.proofs.includes(type)
      ? rule.proofs.filter((item) => item !== type)
      : [...rule.proofs, type];
    setValue(
      'extra_rules',
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, proofs } : item)),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  function setActivity(next: string) {
    setValue('rule_activity', next, { shouldValidate: true, shouldDirty: true });
  }

  function togglePresetRule(kind: ExtraRuleKind) {
    const current = getValues('extra_rules');
    const existing = current.findIndex((item) => item.kind === kind);
    if (existing >= 0) {
      setValue(
        'extra_rules',
        current.filter((_, index) => index !== existing),
        { shouldValidate: true, shouldDirty: true },
      );
      return;
    }
    const next = [...current, emptyExtraRule(kind)];
    setValue('extra_rules', next, { shouldValidate: true, shouldDirty: true });
    if (kind === 'min_minutes') {
      setValue('min_minutes', '30', { shouldDirty: true });
    }
  }

  function addCustomRule() {
    setValue('extra_rules', [...getValues('extra_rules'), emptyExtraRule('custom')], {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  function removeRule(index: number) {
    setValue(
      'extra_rules',
      getValues('extra_rules').filter((_, itemIndex) => itemIndex !== index),
      { shouldValidate: true, shouldDirty: true },
    );
  }

  function setRuleKind(index: number, kind: ExtraRuleKind) {
    const current = getValues('extra_rules');
    const preset = EXTRA_RULE_PRESETS.find((item) => item.kind === kind);
    setValue(
      'extra_rules',
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              kind,
              text: kind === 'custom' ? item.text : preset?.text ?? item.text,
            }
          : item,
      ),
      { shouldValidate: true, shouldDirty: true },
    );
    if (kind === 'min_minutes') {
      setValue('min_minutes', '30', { shouldDirty: true });
    }
  }

  return (
    <View className="gap-5">
      {isPoints ? (
        <FieldAnchor name="tasks">
          <FieldLabel
            label="Tasks"
            error={errors.tasks?.message ?? errors.tasks?.root?.message}
            hint="Each task has its own points and proof. Highest totals win.">
            <View className="gap-3">
              {values.tasks.map((task, index) => (
                <Card key={task.id} className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <AppText className="text-sm font-semibold text-charcoal">Task {index + 1}</AppText>
                    {values.tasks.length > 1 ? (
                      <Pressable onPress={() => onRemoveTask(index)} accessibilityRole="button">
                        <AppText className="text-sm font-semibold text-coral-dark">Remove</AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  <Controller
                    control={control}
                    name={`tasks.${index}.title`}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="What they do"
                        placeholder="e.g. Finish a 5K, read 20 pages"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.tasks?.[index]?.title?.message}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`tasks.${index}.points`}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="Points"
                        placeholder="10"
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.tasks?.[index]?.points?.message}
                      />
                    )}
                  />
                  <ProofPicker
                    label="Proof for this task"
                    selected={task.proofs ?? []}
                    hint="Say the action. 'Photo' is not enough."
                    onToggle={(type) => toggleTaskProof(index, type)}
                  />
                </Card>
              ))}
              <Button title="Add a task" variant="outline" onPress={onAddTask} />
            </View>
          </FieldLabel>
        </FieldAnchor>
      ) : (
        <>
          <FieldAnchor name="rules">
          <FieldAnchor name="target_count">
            <View className="gap-3">
              <AppText className="text-[15px] leading-6 text-charcoal">Competitors must log</AppText>
              <View className="flex-row flex-wrap items-start gap-2">
                <View style={{ width: 76 }}>
                  <Controller
                    control={control}
                    name="target_count"
                    render={({ field: { onChange, onBlur, value, ref } }) => (
                      <Input
                        ref={ref}
                        accessibilityLabel="How many logs"
                        placeholder="6"
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.target_count?.message}
                      />
                    )}
                  />
                </View>
                <View className="min-w-[180px] flex-1">
                  <FieldAnchor name="rule_activity">
                    <ChipRow>
                      {RULE_ACTIVITY_PRESETS.map((item) => (
                        <Chip
                          key={item}
                          label={item}
                          selected={values.rule_activity === item}
                          onPress={() => setActivity(item)}
                        />
                      ))}
                      <Chip
                        label="custom"
                        selected={activityIsCustom}
                        onPress={() => {
                          if (!activityIsCustom) {
                            setActivity('');
                          }
                        }}
                      />
                    </ChipRow>
                    {activityIsCustom ? (
                      <View className="mt-2">
                        <Controller
                          control={control}
                          name="rule_activity"
                          render={({ field: { onChange, onBlur, value, ref } }) => (
                            <Input
                              ref={ref}
                              accessibilityLabel="Custom activity"
                              placeholder="e.g. cold plunge"
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              error={errors.rule_activity?.message}
                            />
                          )}
                        />
                      </View>
                    ) : errors.rule_activity?.message ? (
                      <AppText className="mt-1 text-xs text-coral-dark">
                        {errors.rule_activity.message}
                      </AppText>
                    ) : null}
                  </FieldAnchor>
                </View>
              </View>
              <AppText className="text-[15px] leading-6 text-charcoal">every</AppText>
              <FieldAnchor name="frequency">
                <ChipRow>
                  {periods.map((item) => (
                    <Chip
                      key={item.value}
                      label={item.value === 'once' ? 'Once' : item.label}
                      selected={values.frequency === item.value}
                      onPress={() => onFrequencyChange(item.value)}
                    />
                  ))}
                </ChipRow>
                {errors.frequency?.message ? (
                  <AppText className="mt-1 text-xs text-coral-dark">{errors.frequency.message}</AppText>
                ) : values.frequency === 'once' ? (
                  <AppText className="mt-1 text-xs leading-5 text-muted">
                    Once is the total for the whole challenge.
                  </AppText>
                ) : null}
              </FieldAnchor>
              <View className="gap-1">
                <AppText className="text-[15px] font-medium leading-6 text-charcoal">{preview}</AppText>
                {isUnlimited ? (
                  <AppText className="text-xs leading-5 text-muted">
                    Miss this cadence and you’re eliminated.
                  </AppText>
                ) : (
                  <AppText className="text-xs leading-5 text-muted">
                    Miss this and you get 0.00 Coins.
                  </AppText>
                )}
              </View>
            </View>
          </FieldAnchor>
          </FieldAnchor>

          <FieldAnchor name="proofs">
            <ProofPicker
              label="Proof for each log"
              selected={values.proofs}
              error={errors.proofs?.message}
              onToggle={toggleProof}
            />
          </FieldAnchor>
        </>
      )}

      <FieldAnchor name="extra_rules">
        <FieldLabel
          label="Additional rules"
          error={typeof errors.extra_rules?.message === 'string' ? errors.extra_rules.message : undefined}>
          <View className="gap-3">
            {isPoints ? null : (
              <ChipRow>
                {EXTRA_RULE_PRESETS.map((item) => (
                  <Chip
                    key={item.kind}
                    label={item.kind === 'separate_days' ? 'Separate days' : 'Min 30 minutes'}
                    selected={extraRules.some((rule) => rule.kind === item.kind)}
                    onPress={() => togglePresetRule(item.kind)}
                  />
                ))}
              </ChipRow>
            )}
            {extraRules.map((rule, index) => (
              <Card key={rule.id} className="gap-3">
                <View className="flex-row items-center justify-between">
                  <AppText className="text-sm font-semibold text-charcoal">Rule {index + 1}</AppText>
                  <Pressable onPress={() => removeRule(index)} accessibilityRole="button">
                    <AppText className="text-sm font-semibold text-coral-dark">Remove</AppText>
                  </Pressable>
                </View>
                {isPoints ? null : (
                  <ChipRow>
                    {EXTRA_RULE_PRESETS.map((item) => (
                      <Chip
                        key={item.kind}
                        label={item.kind === 'separate_days' ? 'Separate days' : 'Min 30 minutes'}
                        selected={rule.kind === item.kind}
                        onPress={() => setRuleKind(index, item.kind)}
                      />
                    ))}
                    <Chip
                      label="Custom"
                      selected={rule.kind === 'custom'}
                      onPress={() => setRuleKind(index, 'custom')}
                    />
                  </ChipRow>
                )}
                <Controller
                  control={control}
                  name={`extra_rules.${index}.text`}
                  render={({ field: { onChange, onBlur, value, ref } }) => (
                    <Input
                      ref={ref}
                      placeholder="e.g. Logs must be on separate calendar days"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.extra_rules?.[index]?.text?.message}
                      multiline
                      textAlignVertical="top"
                      style={{ minHeight: 72 }}
                    />
                  )}
                />
                <ProofPicker
                  label="Proof for this rule"
                  selected={rule.proofs}
                  optional
                  onToggle={(type) => toggleExtraProof(index, type)}
                />
              </Card>
            ))}
            <Button title="Add another rule" variant="outline" onPress={addCustomRule} />
          </View>
        </FieldLabel>
      </FieldAnchor>

      <FieldAnchor name="cover_image_url">
        <FieldLabel
          label="Cover image"
          error={errors.cover_image_url?.message}
          hint="Optional. Shows on the Lobby card and challenge page.">
          {values.cover_image_url ? (
            <Image
              source={{ uri: values.cover_image_url }}
              style={{ height: 120, width: '100%', borderRadius: THEME.radiusSm, backgroundColor: THEME.background }}
              contentFit="cover"
            />
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title={coverBusy ? 'Uploading…' : values.cover_image_url ? 'Replace cover' : 'Upload cover'}
                variant="outline"
                loading={coverBusy}
                onPress={onUploadCover}
              />
            </View>
            {values.cover_image_url ? (
              <View className="flex-1">
                <Button title="Remove" variant="ghost" onPress={onClearCover} />
              </View>
            ) : null}
          </View>
          <Controller
            control={control}
            name="cover_image_url"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Or paste a cover URL"
                placeholder="https://"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
        </FieldLabel>
      </FieldAnchor>

      <FieldAnchor name="rules_video_url">
        <Controller
          control={control}
          name="rules_video_url"
          render={({ field: { onChange, onBlur, value, ref } }) => (
            <Input
              ref={ref}
              label="Rules video URL"
              placeholder="https://"
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.rules_video_url?.message}
              autoCapitalize="none"
              autoCorrect={false}
              hint="Optional. Paste a public video link if you didn’t upload one."
            />
          )}
        />
      </FieldAnchor>
    </View>
  );
}

function ProofPicker({
  label,
  selected,
  error,
  optional,
  hint = "Say the action. 'Photo' is not enough.",
  onToggle,
}: {
  label: string;
  selected: ProofType[];
  error?: string;
  optional?: boolean;
  hint?: string;
  onToggle: (type: ProofType) => void;
}) {
  return (
    <FieldLabel
      label={label}
      error={error}
      hint={hint}>
      <ChipRow>
        {CREATE_PROOF_TYPES.map((type) => (
          <Chip
            key={type}
            label={proofMeta(type).short}
            selected={selected.includes(type)}
            onPress={() => onToggle(type)}
          />
        ))}
      </ChipRow>
      {selected.length > 0 ? (
        <View className="gap-1">
          {selected.map((type) => (
            <AppText key={type} className="text-sm leading-5 text-muted">
              {proofMeta(type).label} — {proofMeta(type).helper}
            </AppText>
          ))}
        </View>
      ) : optional ? (
        <AppText className="text-xs leading-5 text-muted">Optional. Leave empty to use the primary proof.</AppText>
      ) : null}
    </FieldLabel>
  );
}
