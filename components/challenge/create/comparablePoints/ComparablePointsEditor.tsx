import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityCard } from '@/components/challenge/create/comparablePoints/ActivityCard';
import { LogExtrasEditor } from '@/components/challenge/create/comparablePoints/LogExtrasEditor';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import type { ComparablePointsForm } from '@/hooks/useComparablePointsForm';
import {
  COMPARABLE_POINTS_HARD_MAX,
  COMPARABLE_POINTS_SOFT_MAX,
  comparablePointsLaneSubline,
  comparablePointsLiveSentence,
  extrasKeepAddingFor,
  formatPoints,
  inferInputKind,
  inferScoreWindow,
  multiplierMetricKey,
  scoreComparableWindow,
  scoreWindowLabel,
  scoringLaneName,
  type ScoreWindow,
} from '@/lib/comparablePoints';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

const WINDOW_CHIPS: { id: ScoreWindow; label: string; help: string }[] = [
  { id: 'challenge', label: 'This challenge', help: 'Running total. The multiplier revalues the whole contest.' },
  { id: 'period', label: 'Each period', help: 'The challenge-tz period only. The multiplier revalues that period.' },
  { id: 'day', label: 'Each day', help: 'That calendar day only. The multiplier revalues that day.' },
];

export function ComparablePointsEditor({ form }: { form: ComparablePointsForm }) {
  const { draft } = form;
  const [simOpen, setSimOpen] = useState(false);
  const [sampleQty, setSampleQty] = useState<Record<string, string>>({});

  const sentence = useMemo(() => comparablePointsLiveSentence(draft), [draft]);
  const window = inferScoreWindow(draft.window);
  const atSoftMax = draft.activities.length >= COMPARABLE_POINTS_SOFT_MAX;
  const atHardMax = draft.activities.length >= COMPARABLE_POINTS_HARD_MAX;
  const sampleTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const activity of draft.activities) {
      totals[activity.id] = Number(sampleQty[activity.id] || 0);
      const label = activity.multiplier.label?.trim();
      if (activity.multiplier.enabled && label) {
        totals[multiplierMetricKey(label)] = Number(sampleQty[multiplierMetricKey(label)] || 0);
      }
    }
    return totals;
  }, [draft.activities, sampleQty]);
  const samplePoints = useMemo(() => scoreComparableWindow(draft, sampleTotals), [draft, sampleTotals]);

  return (
    <View className="gap-4">
      <View className="gap-1">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Full-value points
        </AppText>
        <Input
          label="Full-value points"
          placeholder="10000"
          keyboardType="number-pad"
          value={draft.parity_points > 0 ? String(draft.parity_points) : ''}
          onChangeText={form.setParityPoints}
          hint="Each activity is worth this many points when it hits its full-value quantity."
        />
      </View>

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
          extrasKeepAdding={draft.extras_keep_adding !== false}
          lanes={draft.lanes ?? []}
          canRemove={draft.activities.length > 1}
          onChange={(partial) => form.patchActivity(activity.id, partial)}
          onRemove={() => form.removeActivity(activity.id)}
          onToggleLane={(laneId) => form.toggleLaneActivity(laneId, activity.id)}
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
          {copy('create.sides')}
        </AppText>
        <AppText className="text-[13px] leading-5 text-muted">{copy('create.sidesHelp')}</AppText>
        {(draft.lanes ?? []).map((lane) => (
          <View
            key={lane.id}
            className="gap-2"
            style={{
              backgroundColor: THEME.surface,
              borderRadius: THEME.radius,
              borderWidth: 1,
              borderColor: THEME.border,
              padding: 14,
            }}>
            <Input
              label="Side name"
              placeholder="e.g. Rookie"
              value={scoringLaneName(lane)}
              onChangeText={(name) => form.patchLane(lane.id, name)}
              maxLength={40}
            />
            <AppText className="text-sm font-semibold text-charcoal">{copy('create.sideActivities')}</AppText>
            <ChipRow>
              {draft.activities
                .filter((activity) => activity.name.trim())
                .map((activity) => {
                  const selected = (lane.activities ?? []).includes(activity.id);
                  return (
                    <Chip
                      key={activity.id}
                      label={activity.name}
                      selected={selected}
                      onPress={() => form.toggleLaneActivity(lane.id, activity.id)}
                    />
                  );
                })}
            </ChipRow>
            {(draft.lanes ?? []).length > 2 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => form.removeLane(lane.id)}
                style={{ minHeight: 32, justifyContent: 'center' }}>
                <AppText className="text-sm font-semibold text-muted">Remove side</AppText>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={form.addLane}
          className="items-center self-start rounded-full px-3"
          style={{
            minHeight: 36,
            borderWidth: 1,
            borderColor: THEME.border,
            backgroundColor: THEME.surface,
            justifyContent: 'center',
          }}>
          <AppText className="text-sm font-semibold text-charcoal">{copy('create.addSide')}</AppText>
        </Pressable>
      </View>

      <View className="gap-2">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Amounts above full value
        </AppText>
        <Chip
          label={draft.extras_keep_adding !== false ? 'Keep adding · on' : 'Keep adding · off'}
          selected={draft.extras_keep_adding !== false}
          onPress={() => form.setExtrasKeepAdding(draft.extras_keep_adding === false)}
        />
      </View>

      <LogExtrasEditor form={form} />

      <View className="gap-2">
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Score window
        </AppText>
        <ChipRow>
          {WINDOW_CHIPS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              selected={window === item.id}
              onPress={() => form.setWindow(item.id)}
            />
          ))}
        </ChipRow>
        <AppText className="text-[13px] leading-5 text-muted">
          {WINDOW_CHIPS.find((item) => item.id === window)?.help}
        </AppText>
        <AppText className="text-sm leading-6 text-charcoal">{sentence}</AppText>
        {comparablePointsLaneSubline(draft) ? (
          <AppText className="text-[13px] leading-5 text-muted">{comparablePointsLaneSubline(draft)}</AppText>
        ) : null}
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
          <AppText className="font-semibold text-charcoal">Test a sample</AppText>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {simOpen ? 'Hide' : 'Open'}
          </AppText>
        </Pressable>
        {simOpen ? (
          <View className="gap-3 px-4 pb-4">
            <AppText className="text-[13px] leading-5 text-muted">
              Plug in one window of work. This doesn’t save to the challenge.
            </AppText>
            {draft.activities.map((activity) => {
              const name = activity.name.trim() || 'Untitled activity';
              const money = inferInputKind(activity.unit, activity.input_kind) === 'money';
              const multiplierLabel = activity.multiplier.label?.trim();
              const multiplierKey = multiplierLabel ? multiplierMetricKey(multiplierLabel) : '';
              return (
                <View key={activity.id} className="gap-2">
                  <Input
                    label={`${name}${money ? ' ($)' : activity.unit ? ` (${activity.unit})` : ''}`}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={sampleQty[activity.id] ?? ''}
                    onChangeText={(value) =>
                      setSampleQty((current) => ({ ...current, [activity.id]: value }))
                    }
                  />
                  {activity.multiplier.enabled && multiplierLabel && multiplierKey ? (
                    <Input
                      label={multiplierLabel}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      value={sampleQty[multiplierKey] ?? ''}
                      onChangeText={(value) =>
                        setSampleQty((current) => ({ ...current, [multiplierKey]: value }))
                      }
                    />
                  ) : null}
                </View>
              );
            })}
            <AppText className="text-sm font-semibold text-charcoal">
              {scoreWindowLabel(window)} total: {formatPoints(samplePoints)} pts
            </AppText>
            {draft.activities.some((activity) => extrasKeepAddingFor(activity, draft)) ? null : (
              <AppText className="text-xs leading-5 text-muted">
                Amounts above full value are capped on this sample.
              </AppText>
            )}
          </View>
        ) : null}
      </View>

      {form.error ? (
        <AppText className="text-sm leading-5 text-coral-dark">{form.error}</AppText>
      ) : null}
    </View>
  );
}
