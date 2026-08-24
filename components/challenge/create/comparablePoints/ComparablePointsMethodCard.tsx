import { Image, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { challengeTypeIconSource } from '@/lib/challengeTypeIcon';
import {
  activityQtyLabel,
  comparablePointsHeadline,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';
import { THEME } from '@/lib/theme';

export function ComparablePointsMethodCard({
  config,
  onPress,
}: {
  config: ComparablePointsConfig | null;
  onPress: () => void;
}) {
  const saved = config != null;
  const activities = saved
    ? config.activities.filter((item) => item.name.trim().length > 0)
    : [];

  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View
          className="h-11 w-11 items-center justify-center overflow-hidden"
          style={{
            backgroundColor: THEME.accentSoft,
            borderRadius: 14,
          }}>
          <Image
            source={challengeTypeIconSource('fitness')}
            style={{ width: 28, height: 28 }}
            resizeMode="contain"
          />
        </View>
        <View className="min-w-0 flex-1">
          <AppText className="text-[17px] font-semibold leading-6 text-charcoal">
            Comparable Points
          </AppText>
          {saved ? (
            <AppText className="mt-0.5 text-[13px] leading-5 text-muted">
              {comparablePointsHeadline(config)}
            </AppText>
          ) : (
            <AppText className="mt-0.5 text-[13px] leading-5 text-muted">
              Compare different kinds of work on one leaderboard
            </AppText>
          )}
        </View>
      </View>

      {saved && activities.length > 0 ? (
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

      <View className="mt-4">
        <Button title={saved ? 'Edit scoring' : 'Configure'} onPress={onPress} />
      </View>
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
