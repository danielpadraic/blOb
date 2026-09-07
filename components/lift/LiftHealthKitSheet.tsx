import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { formatDuration } from '@/lib/lift/duration';
import { THEME, themeShadow } from '@/lib/theme';
import type { HealthWorkout } from '@/services/health/types';

/**
 * Optional HealthKit link after Complete. Cancel still leaves the session completed.
 * Native iOS only — the parent never mounts this on Web or Android.
 */

type LiftHealthKitSheetProps = {
  visible: boolean;
  workouts: HealthWorkout[];
  busy?: boolean;
  onClose: () => void;
  onPick: (workout: HealthWorkout) => void;
};

export function LiftHealthKitSheet({
  visible,
  workouts,
  busy,
  onClose,
  onPick,
}: LiftHealthKitSheetProps) {
  return (
    <ChromeOverlay visible={visible} onClose={busy ? undefined : onClose} align="end" zIndex={145}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 24,
          ...themeShadow('card'),
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 6,
          }}>
          <AppText style={{ flex: 1, fontSize: 17, fontWeight: '800', color: THEME.textPrimary }}>
            Link a workout
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip"
            hitSlop={10}
            disabled={busy}
            onPress={onClose}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
            <AppText style={{ fontSize: 14, fontWeight: '700', color: THEME.accent }}>Skip</AppText>
          </Pressable>
        </View>
        <AppText style={{ paddingHorizontal: 16, paddingBottom: 10, fontSize: 13, color: THEME.textMuted }}>
          Optional. Your lift is already completed.
        </AppText>
        <ScrollView
          style={{ maxHeight: 360 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
          {workouts.map((workout) => (
            <Pressable
              key={workout.providerWorkoutId}
              accessibilityRole="button"
              accessibilityLabel={`Link ${workout.activityLabel}`}
              disabled={busy}
              onPress={() => onPick(workout)}
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: THEME.border,
                backgroundColor: pressed ? THEME.accentSoft : THEME.surface,
                opacity: busy ? 0.6 : 1,
              })}>
              <Glyph name={GLYPH.heartbeat} color={THEME.accent} size={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: THEME.textPrimary }}>
                  {workout.activityLabel}
                </AppText>
                <AppText numberOfLines={1} style={{ fontSize: 12, color: THEME.textMuted }}>
                  {formatDuration(workout.durationSec)}
                </AppText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
