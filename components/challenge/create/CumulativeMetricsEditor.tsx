import { Pressable, View } from 'react-native';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Stepper, StepperField } from '@/components/ui/Stepper';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  CUMULATIVE_METRIC_CAP,
  applyMetricName,
  applyMetricUnit,
  defaultCumulativeMetrics,
  isDistanceMetricName,
  metricAllowsDecimals,
  newCumulativeMetric,
  type CumulativeMetric,
} from '@/lib/cumulativeMetrics';
import { payoutOptionsForFamily, type PayoutControlId } from '@/lib/formatPayout';
import { THEME } from '@/lib/theme';

export function CumulativeMetricsEditor({
  metrics,
  window,
  payout,
  topPlacesValue,
  onMetricsChange,
  onWindowChange,
  onPayoutChange,
  onTopPlacesChange,
}: {
  metrics: CumulativeMetric[];
  window: 'challenge' | 'week';
  payout?: PayoutControlId;
  topPlacesValue?: number;
  onMetricsChange: (next: CumulativeMetric[]) => void;
  onWindowChange: (next: 'challenge' | 'week') => void;
  onPayoutChange: (next: PayoutControlId) => void;
  onTopPlacesChange: (next: number) => void;
}) {
  const rows = metrics.length > 0 ? metrics.slice(0, CUMULATIVE_METRIC_CAP) : defaultCumulativeMetrics();
  const selected = payout === 'top_count' || payout === 'top_percent' ? payout : 'even_split_remaining';
  const ranked = selected === 'top_count' || selected === 'top_percent';

  function patch(index: number, next: CumulativeMetric) {
    onMetricsChange(rows.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  return (
    <View className="gap-3" style={{ overflow: 'visible' }}>
      {rows.map((metric, index) => {
        const distance = isDistanceMetricName(metric.name);
        const decimals = metricAllowsDecimals(metric);
        return (
          <View key={metric.id} className="gap-2" style={{ overflow: 'visible' }}>
            <View
              className="flex-row flex-wrap items-end"
              style={{ gap: 8, overflow: 'visible' }}>
              <View style={{ flexGrow: 1, flexShrink: 0, minWidth: 168 }}>
                <AppText className="mb-1.5 text-sm font-semibold text-charcoal">
                  {copy('create.cumulativeTarget')}
                </AppText>
                <Stepper
                  value={metric.target}
                  min={decimals ? 0.25 : 0}
                  max={1_000_000}
                  step={decimals ? 0.25 : 1}
                  wide
                  accessibilityLabel={copy('create.cumulativeTarget')}
                  onChange={(target) => patch(index, { ...metric, target })}
                />
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 140 }}>
                <Input
                  label={copy('create.metricName')}
                  placeholder={copy('create.metricNamePlaceholder')}
                  value={metric.name}
                  onChangeText={(name) => patch(index, applyMetricName(metric, name))}
                  maxLength={40}
                />
              </View>
              {rows.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove metric"
                  onPress={() => onMetricsChange(rows.filter((_, itemIndex) => itemIndex !== index))}
                  className="h-[52px] w-[52px] items-center justify-center rounded-xl"
                  style={{ borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface }}>
                  <AppText className="text-[18px] font-semibold text-muted">×</AppText>
                </Pressable>
              ) : null}
            </View>
            {distance ? (
              <ChipRow>
                <Chip
                  label={copy('create.distanceUnitMi')}
                  selected={(metric.unit ?? 'mi') === 'mi'}
                  minHeight={44}
                  onPress={() => patch(index, applyMetricUnit(metric, 'mi'))}
                />
                <Chip
                  label={copy('create.distanceUnitKm')}
                  selected={metric.unit === 'km'}
                  minHeight={44}
                  onPress={() => patch(index, applyMetricUnit(metric, 'km'))}
                />
              </ChipRow>
            ) : null}
          </View>
        );
      })}

      {rows.length > 1 ? (
        <AppText className="text-[13px] leading-5 text-muted">{copy('create.mustHitEvery')}</AppText>
      ) : null}

      {rows.length < CUMULATIVE_METRIC_CAP ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onMetricsChange([...rows, newCumulativeMetric()])}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {copy('create.addMetric')}
          </AppText>
        </Pressable>
      ) : null}

      <AppText className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        Payout
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        {payoutOptionsForFamily('cumulative').map((item) => (
          <Chip
            key={item.id}
            label={item.id === 'even_split_remaining' ? copy('create.anyoneHits') : item.id === 'top_percent' ? copy('create.topPercent') : copy('create.topCount')}
            selected={selected === item.id}
            minHeight={44}
            onPress={() => onPayoutChange(item.id)}
          />
        ))}
      </View>
      {ranked ? (
        <View className="gap-2">
          <AppText className="text-[13px] leading-5 text-muted">{copy('create.rankedByFinish')}</AppText>
          <StepperField
            label={selected === 'top_percent' ? copy('create.whatPercent') : copy('create.howManyPeople')}
            value={Math.max(Number(topPlacesValue) || (selected === 'top_percent' ? 25 : 3), 1)}
            min={1}
            max={selected === 'top_percent' ? 100 : 99}
            onChange={onTopPlacesChange}
          />
        </View>
      ) : null}

      <AppText className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {copy('create.cumulativeWindow')}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          label={copy('create.windowChallenge')}
          selected={window === 'challenge'}
          minHeight={44}
          onPress={() => onWindowChange('challenge')}
        />
        <Chip
          label={copy('create.windowWeek')}
          selected={window === 'week'}
          minHeight={44}
          onPress={() => onWindowChange('week')}
        />
      </View>
    </View>
  );
}
