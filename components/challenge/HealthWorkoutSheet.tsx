import { View } from 'react-native';

import { HealthWorkoutPicker } from '@/components/challenge/HealthWorkoutPicker';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import type { ChallengeProof } from '@/lib/challengeProofs';
import { THEME, themeShadow } from '@/lib/theme';
import type { HealthWorkout } from '@/services/health';

type HealthWorkoutSheetProps = {
  visible: boolean;
  challengeId: string;
  challengeTitle: string;
  minMinutes?: number | null;
  frequency?: string | null;
  startsAt?: string | null;
  isOfficial?: boolean | null;
  seriesId?: string | null;
  timezone?: string | null;
  daysRequired?: number | null;
  dayWindows?: unknown;
  userId?: string;
  attaching?: boolean;
  proof?: ChallengeProof | null;
  onClose: () => void;
  onDenied?: () => void;
  onAttach: (workout: HealthWorkout) => Promise<void>;
};

export function HealthWorkoutSheet({
  visible,
  challengeTitle,
  minMinutes,
  frequency,
  startsAt,
  isOfficial,
  seriesId,
  timezone,
  daysRequired,
  dayWindows,
  userId,
  attaching = false,
  proof,
  onClose,
  onDenied,
  onAttach,
}: HealthWorkoutSheetProps) {
  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end">
      <View
        className="pt-2"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: '88%',
          minHeight: 320,
          ...themeShadow('card'),
        }}>
        <View className="mb-1 items-center pt-2">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <View style={{ maxHeight: 520 }}>
          <HealthWorkoutPicker
            challengeTitle={challengeTitle}
            proof={proof}
            minMinutes={minMinutes}
            frequency={frequency}
            startsAt={startsAt}
            isOfficial={isOfficial}
            seriesId={seriesId}
            timezone={timezone}
            daysRequired={daysRequired}
            dayWindows={dayWindows}
            userId={userId}
            attaching={attaching}
            onAttach={onAttach}
            onAddPhoto={() => {
              onDenied?.();
              onClose();
            }}
            onClose={onClose}
          />
        </View>
      </View>
    </ChromeOverlay>
  );
}
