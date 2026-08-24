import { useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { ActivityCard } from '@/components/challenge/create/comparablePoints/ActivityCard';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { ComparablePointsForm } from '@/hooks/useComparablePointsForm';
import {
  COMPARABLE_POINTS_HARD_MAX,
  COMPARABLE_POINTS_SOFT_MAX,
  comparablePointsLiveSentence,
  formatPoints,
  scoreSampleActivity,
} from '@/lib/comparablePoints';
import { COLORS } from '@/lib/constants';
import { THEME } from '@/lib/theme';

export function ComparablePointsEditor({ form }: { form: ComparablePointsForm }) {
  const { draft } = form;
  const [simOpen, setSimOpen] = useState(false);
  const [sampleQty, setSampleQty] = useState<Record<string, string>>({});
  const [sampleMultiplier, setSampleMultiplier] = useState<Record<string, string>>({});
  const [sampleMet, setSampleMet] = useState<Record<string, boolean>>({});

  const sentence = useMemo(() => comparablePointsLiveSentence(draft), [draft]);
  const atSoftMax = draft.activities.length >= COMPARABLE_POINTS_SOFT_MAX;
  const atHardMax = draft.activities.length >= COMPARABLE_POINTS_HARD_MAX;

  return (
    <View className="gap-4">
      <View className="gap-1">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Activities
        </AppText>
        <AppText className="text-[13px] leading-5 text-muted">
          Each activity can earn the same full-value points. Start with one.
        </AppText>
      </View>

      {draft.activities.map((activity, index) => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          index={index}
          parityPoints={draft.parity_points}
          canRemove={draft.activities.length > 1}
          onChange={(partial) => form.patchActivity(activity.id, partial)}
          onRemove={() => form.removeActivity(activity.id)}
          onAddQualifier={() => form.addQualifier(activity.id)}
          onPatchQualifier={(id, label) => form.patchQualifier(activity.id, id, label)}
          onRemoveQualifier={(id) => form.removeQualifier(activity.id, id)}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        disabled={atHardMax}
        onPress={form.addActivity}
        className="items-center self-start rounded-full px-3"
        style={{
          minHeight: 36,
          opacity: atHardMax ? 0.45 : 1,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          justifyContent: 'center',
        }}>
        <AppText className="text-sm font-semibold text-charcoal">+ Add another activity</AppText>
      </Pressable>
      {atSoftMax ? (
        <AppText className="text-xs leading-5 text-muted">
          Keep it to 3–4 activities so the board stays readable.
        </AppText>
      ) : null}

      <View className="gap-2">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Parity
        </AppText>
        <Input
          label="Points at full value"
          placeholder="10000"
          keyboardType="number-pad"
          value={draft.parity_points > 0 ? String(draft.parity_points) : ''}
          onChangeText={form.setParityPoints}
          hint="Every activity’s full-value quantity is worth this many points."
        />
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <AppText className="font-semibold text-charcoal">Shared floor</AppText>
            <AppText className="mt-0.5 text-xs leading-5 text-muted">
              Use each activity’s floor together when scoring the day.
            </AppText>
          </View>
          <Switch
            value={Boolean(draft.floor_master)}
            onValueChange={form.setFloorMaster}
            trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
            thumbColor={COLORS.white}
            ios_backgroundColor={COLORS.line}
          />
        </View>
        <AppText className="text-sm leading-6 text-charcoal">{sentence}</AppText>
      </View>

      <View
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          overflow: 'hidden',
        }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSimOpen((current) => !current)}
          className="flex-row items-center justify-between px-4"
          style={{ minHeight: 52 }}>
          <AppText className="font-semibold text-charcoal">Test a sample day</AppText>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {simOpen ? 'Hide' : 'Open'}
          </AppText>
        </Pressable>
        {simOpen ? (
          <View className="gap-3 px-4 pb-4">
            <AppText className="text-[13px] leading-5 text-muted">
              Plug in one day’s work. This doesn’t save to the challenge.
            </AppText>
            {draft.activities.map((activity) => {
              const qty = Number(sampleQty[activity.id] || 0);
              const multiplierQty = Number(sampleMultiplier[activity.id] || 0);
              const met = sampleMet[activity.id] !== false;
              const points = scoreSampleActivity(draft, activity, qty, met, multiplierQty);
              return (
                <View key={activity.id} className="gap-2">
                  <Input
                    label={activity.name.trim() || 'Untitled activity'}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={sampleQty[activity.id] ?? ''}
                    onChangeText={(value) =>
                      setSampleQty((current) => ({ ...current, [activity.id]: value }))
                    }
                  />
                  {activity.multiplier.enabled ? (
                    <Input
                      label={activity.multiplier.label?.trim() || 'Multiplier'}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      value={sampleMultiplier[activity.id] ?? ''}
                      onChangeText={(value) =>
                        setSampleMultiplier((current) => ({ ...current, [activity.id]: value }))
                      }
                    />
                  ) : null}
                  {activity.qualifiers.enabled ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        setSampleMet((current) => ({ ...current, [activity.id]: !met }))
                      }
                      className="self-start rounded-full px-3"
                      style={{
                        minHeight: 32,
                        justifyContent: 'center',
                        backgroundColor: met ? THEME.accentSoft : THEME.surface,
                        borderWidth: 1,
                        borderColor: met ? THEME.accent : THEME.border,
                      }}>
                      <AppText
                        className="text-xs font-semibold"
                        style={{ color: met ? THEME.accent : THEME.textMuted }}>
                        {met ? 'Qualifiers met' : 'Qualifiers not met'}
                      </AppText>
                    </Pressable>
                  ) : null}
                  <AppText className="text-[13px] text-muted">{formatPoints(points)} pts</AppText>
                </View>
              );
            })}
            <AppText className="text-sm font-semibold text-charcoal">
              Day total:{' '}
              {formatPoints(
                draft.activities.reduce((sum, activity) => {
                  const qty = Number(sampleQty[activity.id] || 0);
                  const multiplierQty = Number(sampleMultiplier[activity.id] || 0);
                  const met = sampleMet[activity.id] !== false;
                  return sum + scoreSampleActivity(draft, activity, qty, met, multiplierQty);
                }, 0),
              )}{' '}
              pts
            </AppText>
          </View>
        ) : null}
      </View>

      {form.error ? (
        <AppText className="text-sm leading-5 text-coral-dark">{form.error}</AppText>
      ) : null}
    </View>
  );
}
