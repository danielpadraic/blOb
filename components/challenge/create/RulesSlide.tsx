import { useContext, useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { DistanceMilesRow, HeartRateMinutesRow } from '@/components/challenge/create/ExtraTasksEditor';
import { LocationPlacePicker } from '@/components/challenge/LocationPlacePicker';
import { FieldAnchor, FieldLabel, WizardFocusContext } from '@/components/challenge/create/wizardUi';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import {
  EXTRA_RULE_PRESETS,
  consistencyRuleSentence,
  emptyExtraRule,
  type ExtraRuleKind,
} from '@/lib/consistencyRules';
import { pointsToWinHelper, pointsToWinOf, sumTaskPoints } from '@/lib/ruleActivityCopy';
import { CREATE_PROOF_TYPES, proofMeta } from '@/lib/constants';
import { heartRateProofSentence } from '@/lib/challengeProofs';
import { milesToMeters } from '@/lib/distance';
import { copy } from '@/lib/copy';
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
  isCumulative,
  isUnlimited,
  onFrequencyChange,
  onAddTask,
  onRemoveTask,
  onEditGoal,
  registerFlush,
}: {
  control: Form['control'];
  errors: Form['formState']['errors'];
  setValue: Form['setValue'];
  getValues: Form['getValues'];
  values: CreateChallengeValues;
  isPoints: boolean;
  isCumulative?: boolean;
  isUnlimited: boolean;
  onFrequencyChange: (next: ChallengeFrequency) => void;
  onAddTask: () => void;
  onRemoveTask: (index: number) => void;
  onEditGoal: () => void;
  registerFlush?: (flush: () => void) => void;
}) {
  const focus = useContext(WizardFocusContext);
  const extraRules = values.extra_rules ?? [];
  const hasConstraintCopy = extraRules.some((rule) => (rule.text ?? '').trim().length >= 2);
  const [constraintsOpen, setConstraintsOpen] = useState(hasConstraintCopy);
  const [customDraft, setCustomDraft] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const periods = isUnlimited
    ? PERIODS.filter((item) => item.value === 'daily' || item.value === 'weekly')
    : PERIODS;
  const preview = consistencyRuleSentence(values);
  const taskLine = (values.task ?? '').trim() || values.rule_activity.trim() || 'task';
  const winDefault = String(sumTaskPoints(values.tasks));
  const winAmount = pointsToWinOf(values);
  const showConstraints = constraintsOpen || hasConstraintCopy || customOpen;

  function flushCustomDraft() {
    const text = customDraft.trim();
    if (text.length < 2) {
      setCustomDraft('');
      setCustomOpen(false);
      return;
    }
    setValue('extra_rules', [...getValues('extra_rules'), { ...emptyExtraRule('custom'), text }], {
      shouldValidate: false,
      shouldDirty: true,
    });
    setCustomDraft('');
    setCustomOpen(false);
    setConstraintsOpen(true);
  }
  registerFlush?.(flushCustomDraft);

  function toggleProof(type: ProofType) {
    const current = getValues('proofs');
    const next = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    setValue('proofs', next, { shouldValidate: true, shouldDirty: true });
    if (type === 'hr_monitor' && next.includes('hr_monitor')) {
      const minutes = Math.max(Number(getValues('min_minutes')) || 30, 1);
      if (minutes < 1) {
        setValue('min_minutes', '30', { shouldDirty: true });
      }
    }
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
      { shouldValidate: false, shouldDirty: true },
    );
  }

  function togglePresetRule(kind: ExtraRuleKind) {
    const current = getValues('extra_rules');
    const existing = current.findIndex((item) => item.kind === kind);
    if (existing >= 0) {
      setValue(
        'extra_rules',
        current.filter((_, index) => index !== existing),
        { shouldValidate: false, shouldDirty: true },
      );
      return;
    }
    setValue('extra_rules', [...current, emptyExtraRule(kind)], { shouldValidate: false, shouldDirty: true });
    setConstraintsOpen(true);
    if (kind === 'min_minutes') {
      setValue('min_minutes', '30', { shouldDirty: true });
    }
  }

  function openCustomConstraint() {
    setConstraintsOpen(true);
    setCustomOpen(true);
  }

  function removeRule(index: number) {
    setValue(
      'extra_rules',
      getValues('extra_rules').filter((_, itemIndex) => itemIndex !== index),
      { shouldValidate: false, shouldDirty: true },
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
      { shouldValidate: false, shouldDirty: true },
    );
    if (kind === 'min_minutes') {
      setValue('min_minutes', '30', { shouldDirty: true });
    }
  }

  return (
    <View className="gap-5">
      {isPoints ? (
        <>
        <FieldAnchor name="tasks">
          <FieldLabel
            label="Tasks"
            error={errors.tasks?.message ?? errors.tasks?.root?.message}
            hint="Each task is an action people check in for. Highest totals win.">
            <View className="gap-3">
              {values.tasks.map((task, index) => (
                <Card key={task.id} className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <AppText className="text-sm font-semibold text-charcoal">Task {index + 1}</AppText>
                    {values.tasks.length > 1 ? (
                      <Pressable
                        onPress={() => onRemoveTask(index)}
                        accessibilityRole="button"
                        style={{ minHeight: 44, justifyContent: 'center' }}>
                        <AppText className="text-sm font-semibold text-coral-dark">Remove</AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  <FieldAnchor name={`tasks.${index}.title`}>
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
                          onFocus={() => focus?.onFieldFocus(`tasks.${index}.title`)}
                          error={errors.tasks?.[index]?.title?.message}
                        />
                      )}
                    />
                  </FieldAnchor>
                  <Controller
                    control={control}
                    name={`tasks.${index}.points`}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label="Points"
                        placeholder="1"
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        onFocus={() => focus?.onFieldFocus(`tasks.${index}.points`)}
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
        <FieldAnchor name="points_to_win">
          <Controller
            control={control}
            name="points_to_win"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Points to win"
                placeholder={winDefault}
                keyboardType="number-pad"
                value={(value ?? '').trim() ? value ?? '' : winDefault}
                onChangeText={onChange}
                onBlur={onBlur}
                onFocus={() => focus?.onFieldFocus('points_to_win')}
                error={errors.points_to_win?.message}
                hint={pointsToWinHelper(winAmount)}
              />
            )}
          />
        </FieldAnchor>
        </>
      ) : (
        <>
          <FieldAnchor name="task">
            <View
              className="gap-2"
              style={{
                backgroundColor: THEME.surface,
                borderRadius: THEME.radius,
                borderWidth: 1,
                borderColor: THEME.border,
                padding: 14,
              }}>
              <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Task
              </AppText>
              <View className="flex-row items-start justify-between gap-3">
                <AppText className="flex-1 text-[15px] font-medium leading-6 text-charcoal">
                  {taskLine}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit task on Goal"
                  onPress={onEditGoal}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
                    Edit
                  </AppText>
                </Pressable>
              </View>
              <AppText className="text-xs leading-5 text-muted">
                The action people check in for. Constraints belong below — not a second task.
              </AppText>
            </View>
          </FieldAnchor>

          {isCumulative ? (
            <View className="gap-3">
              <DistanceMilesRow
                meters={Math.max(Number(values.cumulative_target) || milesToMeters(100), 1)}
                onChangeMeters={(meters) =>
                  setValue('cumulative_target', String(meters), { shouldDirty: true, shouldValidate: false })
                }
              />
              <FieldLabel label={copy('create.cumulativeWindow')}>
                <ChipRow>
                  <Chip
                    label={copy('create.windowChallenge')}
                    selected={(values.cumulative_window ?? 'challenge') === 'challenge'}
                    minHeight={44}
                    onPress={() => setValue('cumulative_window', 'challenge', { shouldDirty: true })}
                  />
                  <Chip
                    label={copy('create.windowWeek')}
                    selected={values.cumulative_window === 'week'}
                    minHeight={44}
                    onPress={() => setValue('cumulative_window', 'week', { shouldDirty: true })}
                  />
                </ChipRow>
              </FieldLabel>
              <AppText className="text-[12px] leading-5 text-muted">
                Everyone who hits the total splits the prize.
              </AppText>
            </View>
          ) : null}

          {isCumulative ? null : (
          <FieldAnchor name="rules">
          <FieldAnchor name="target_count">
            <View className="gap-3">
              <AppText className="text-[15px] leading-6 text-charcoal">How often</AppText>
              <View className="flex-row flex-wrap items-start gap-2">
                <View style={{ width: 76 }}>
                  <Controller
                    control={control}
                    name="target_count"
                    render={({ field: { onChange, onBlur, value, ref } }) => (
                      <Input
                        ref={ref}
                        accessibilityLabel="How many check-ins"
                        placeholder="6"
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        onFocus={() => focus?.onFieldFocus('target_count')}
                        error={errors.target_count?.message}
                      />
                    )}
                  />
                </View>
                <View className="min-w-[180px] flex-1 justify-center">
                  <AppText className="text-[15px] leading-6 text-charcoal">check-ins every</AppText>
                </View>
              </View>
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
          )}

          <FieldAnchor name="proofs">
            <ProofPicker
              label="Proof for each check-in"
              selected={values.proofs}
              error={errors.proofs?.message}
              onToggle={toggleProof}
            />
          </FieldAnchor>
          {values.proofs.includes('hr_monitor') ? (
            <FieldAnchor name="min_minutes">
              <HeartRateMinutesRow
                value={Math.max(Number(values.min_minutes) || 30, 1)}
                onChange={(minutes) => {
                  setValue('min_minutes', String(minutes), { shouldDirty: true, shouldValidate: false });
                  const extras = getValues('extra_rules') ?? [];
                  setValue(
                    'extra_rules',
                    extras.map((rule) =>
                      rule.kind === 'min_minutes' ? { ...rule, text: heartRateProofSentence(minutes) } : rule,
                    ),
                    { shouldDirty: true },
                  );
                }}
              />
            </FieldAnchor>
          ) : null}
          {values.proofs.includes('distance') ? (
            <DistanceMilesRow
              meters={Math.max(Number(values.distance_meters_required) || milesToMeters(1), 1)}
              onChangeMeters={(meters) =>
                setValue('distance_meters_required', String(meters), { shouldDirty: true, shouldValidate: false })
              }
            />
          ) : null}
          {values.proofs.includes('location') ? (
            <LocationPlacePicker
              place={values.location_place}
              onChange={(location_place) =>
                setValue('location_place', location_place, { shouldDirty: true, shouldValidate: false })
              }
            />
          ) : null}
        </>
      )}

      <FieldAnchor name="extra_rules">
        <FieldLabel
          label="Constraints"
          hint="A constraint limits the task — separate days, min minutes, or a custom limit. Not another task."
          error={typeof errors.extra_rules?.message === 'string' ? errors.extra_rules.message : undefined}>
          <View className="gap-3">
            {showConstraints ? (
              <>
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
                    <Chip label="Custom" selected={customOpen} onPress={openCustomConstraint} />
                  </ChipRow>
                )}
                {extraRules.map((rule, index) => (
                  <Card key={rule.id} className="gap-3">
                    <View className="flex-row items-center justify-between">
                      <AppText className="text-sm font-semibold text-charcoal">
                        {rule.kind === 'custom' ? 'Custom limit' : `Constraint ${index + 1}`}
                      </AppText>
                      <Pressable
                        onPress={() => removeRule(index)}
                        accessibilityRole="button"
                        style={{ minHeight: 44, justifyContent: 'center' }}>
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
                    <FieldAnchor name={`extra_rules.${index}.text`}>
                      <Controller
                        control={control}
                        name={`extra_rules.${index}.text`}
                        render={({ field: { onChange, onBlur, value, ref } }) => (
                          <Input
                            ref={ref}
                            placeholder="e.g. Check-ins must be on separate calendar days"
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            onFocus={() => focus?.onFieldFocus(`extra_rules.${index}.text`)}
                            error={errors.extra_rules?.[index]?.text?.message}
                            multiline
                            textAlignVertical="top"
                            style={{ minHeight: 72 }}
                          />
                        )}
                      />
                    </FieldAnchor>
                    <ProofPicker
                      label="Proof for this constraint"
                      selected={rule.proofs}
                      optional
                      onToggle={(type) => toggleExtraProof(index, type)}
                    />
                  </Card>
                ))}
                {customOpen ? (
                  <FieldAnchor name="extra_rules.custom">
                    <Input
                      placeholder="e.g. At least 20 minutes each check-in"
                      value={customDraft}
                      onChangeText={setCustomDraft}
                      onBlur={flushCustomDraft}
                      onFocus={() => focus?.onFieldFocus('extra_rules')}
                      multiline
                      textAlignVertical="top"
                      style={{ minHeight: 72 }}
                    />
                    <AppText className="mt-1 text-xs leading-5 text-muted">
                      Leave blank if you don’t need a custom limit. Next still works.
                    </AppText>
                  </FieldAnchor>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={openCustomConstraint}
                    style={{ minHeight: 44, justifyContent: 'center' }}>
                    <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
                      {copy('create.addConstraint')}
                    </AppText>
                  </Pressable>
                )}
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={openCustomConstraint}
                style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
                  {copy('create.addConstraint')}
                </AppText>
              </Pressable>
            )}
          </View>
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
              onFocus={() => focus?.onFieldFocus('rules_video_url')}
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
            label={type === 'location' ? `📍 ${proofMeta(type).short}` : proofMeta(type).short}
            selected={selected.includes(type)}
            onPress={() => onToggle(type)}
          />
        ))}
      </ChipRow>
      {optional ? (
        <AppText className="text-xs leading-5 text-muted">Optional. Leave empty to use the primary proof.</AppText>
      ) : null}
    </FieldLabel>
  );
}
