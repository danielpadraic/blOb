import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import type Svg from 'react-native-svg';

import { WorkoutProofCard } from '@/components/challenge/WorkoutProofCard';
import { writeWorkoutCardPng } from '@/lib/health/workoutCardFile';
import {
  WORKOUT_CARD_HEIGHT,
  WORKOUT_CARD_WIDTH,
  type WorkoutProofCardModel,
} from '@/lib/health/workoutProofCard';
import type { HealthActivityType } from '@/services/health/types';

export type WorkoutCardRequest = {
  /** Changing this key restarts a render. Use the proof slot + workout id. */
  key: string;
  card: WorkoutProofCardModel;
  activityType: HealthActivityType;
};

type Props = {
  request: WorkoutCardRequest | null;
  onRendered: (key: string, fileUri: string) => void;
  onFailed: (key: string, message: string) => void;
};

/** Give the watermark a frame to decode before rasterizing. It is optional, so this stays short. */
const SETTLE_MS = 220;

/**
 * Mounts the proof card off-screen and rasterizes it through Svg.toDataURL. Kept out of the visible
 * tree so the user never sees a second editor — they only see the finished thumb in the slot.
 *
 * The mount is the full card size on purpose. `toDataURL` allocates a bitmap of the size it is given
 * but draws the view at whatever size the view actually is, anchored top-left — so mounting a
 * quarter-scale card and asking for a full-size bitmap produced a small card in the corner of a
 * mostly empty image. Both numbers have to agree.
 */
export function WorkoutProofCardRenderer({ request, onRendered, onFailed }: Props) {
  const svgRef = useRef<Svg | null>(null);

  useEffect(() => {
    if (!request || Platform.OS === 'web') {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const node = svgRef.current;
      if (!node || typeof node.toDataURL !== 'function') {
        onFailed(request.key, 'Could not build that workout card.');
        return;
      }
      try {
        node.toDataURL(
          (base64) => {
            if (cancelled) {
              return;
            }
            void (async () => {
              try {
                const uri = await writeWorkoutCardPng(base64, request.key);
                if (cancelled) {
                  return;
                }
                onRendered(request.key, uri);
              } catch (caught) {
                if (!cancelled) {
                  onFailed(
                    request.key,
                    caught instanceof Error ? caught.message : 'Could not build that workout card.',
                  );
                }
              }
            })();
          },
          { width: WORKOUT_CARD_WIDTH, height: WORKOUT_CARD_HEIGHT },
        );
      } catch {
        onFailed(request.key, 'Could not build that workout card.');
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [request, onRendered, onFailed]);

  if (!request || Platform.OS === 'web') {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        // Parked past the bottom-left corner rather than at 0,0. The card is wider than a phone, and
        // a transparent view that big sitting over the screen invites stray layout and touch bugs.
        left: -WORKOUT_CARD_WIDTH,
        top: -WORKOUT_CARD_HEIGHT,
        width: WORKOUT_CARD_WIDTH,
        height: WORKOUT_CARD_HEIGHT,
        opacity: 0,
        zIndex: -1,
      }}>
      <WorkoutProofCard
        ref={svgRef}
        card={request.card}
        activityType={request.activityType}
        width={WORKOUT_CARD_WIDTH}
        height={WORKOUT_CARD_HEIGHT}
      />
    </View>
  );
}
