import { Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { COLORS } from '@/lib/constants';
import {
  activityQtyLabel,
  comparablePointsHeadline,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';
import { THEME } from '@/lib/theme';

export function ComparablePointsMethodCard({
  enabled,
  config,
  onEnabledChange,
}: {
  enabled: boolean;
  config: ComparablePointsConfig | null;
  onEnabledChange: (next: boolean) => void;
}) {
  const activities = config
    ? config.activities.filter((item) => item.name.trim().length > 0)
    : [];

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <AppText className="text-[17px] font-semibold leading-6 text-charcoal">
            Comparable Points
          </AppText>
          <AppText className="mt-0.5 text-[13px] leading-5 text-muted">
            {enabled && config
              ? comparablePointsHeadline(config)
              : 'Compare different kinds of work on one leaderboard'}
          </AppText>
        </View>
        <Switch
          value={enabled}
          onValueChange={onEnabledChange}
          trackColor={{ true: COLORS.mintDark, false: COLORS.line }}
          thumbColor={COLORS.white}
          ios_backgroundColor={COLORS.line}
          accessibilityLabel="Comparable Points"
        />
      </View>

      {enabled && activities.length > 0 ? (
        <View className="mt-3 gap-2">
          {activities.map((activity) => (
            <View key={activity.id} className="flex-row flex-wrap items-center gap-2">
              <AppText className="min-w-0 flex-shrink text-[14px] leading-5 text-charcoal">
                {activity.name.trim()}
                {' · '}
                {activityQtyLabel(activity)}
              </AppText>
              {activity.multiplier.enabled ? <Badge label="Multiplier" /> : null}
              {activity.qualifiers.enabled ? <Badge label="Qualifiers" /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View
      className="rounded-full px-2.5"
      style={{
        minHeight: 22,
        justifyContent: 'center',
        backgroundColor: THEME.accentSoft,
      }}>
      <AppText className="text-[11px] font-semibold" style={{ color: THEME.accent }}>
        {label}
      </AppText>
    </View>
  );
}
