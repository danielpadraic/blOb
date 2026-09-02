import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useCopyTone } from '@/hooks/useCopy';
import { useMyProfile } from '@/hooks/useProfile';
import {
  challengeDayStamp,
  hostRoundCaptureHref,
  hostRoundPromptLine,
  isHostRoundPromptHost,
  readHostRoundPromptDismissed,
  readHostRoundPromptPushed,
  reelOnChallengeDay,
  shouldShowHostRoundPrompt,
  viewerLocalDayStamp,
  writeHostRoundPromptDismissed,
  writeHostRoundPromptPushed,
} from '@/lib/hostRoundPrompt';
import { getPushPermissionState } from '@/lib/push';
import { supabase } from '@/lib/supabase';

type HostRoundChallenge = {
  id?: string | null;
  created_by?: string | null;
  status?: string | null;
  timezone?: string | null;
};

export function hostRoundPromptQueryKey(
  userId?: string | null,
  challengeId?: string | null,
  challengeDay?: string | null,
  localDay?: string | null,
) {
  return ['host-round-prompt', userId ?? '', challengeId ?? '', challengeDay ?? '', localDay ?? ''] as const;
}

async function fetchPostedRoundToday(
  userId: string,
  challengeId: string,
  timeZone: string | null | undefined,
  challengeDay: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('reels')
    .select('id, created_at, challenge_id')
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(24);
  if (error) {
    return false;
  }
  return (data ?? []).some((row) => reelOnChallengeDay(row.created_at, timeZone, challengeDay));
}

async function maybePushHostRoundPrompt(input: {
  userId: string;
  challengeId: string;
  localDay: string;
  body: string;
}): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (await readHostRoundPromptPushed(input.userId, input.challengeId, input.localDay)) {
    return;
  }
  if ((await getPushPermissionState()) !== 'granted') {
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'blOb',
        body: input.body,
        data: {
          type: 'host_round_prompt',
          challenge_id: input.challengeId,
          href: hostRoundCaptureHref(input.challengeId),
        },
      },
      trigger: null,
    });
    await writeHostRoundPromptPushed(input.userId, input.challengeId, input.localDay);
  } catch {
    // Chip still shows. Do not add server push for this slice.
  }
}

export function useHostRoundPrompt(challenge?: HostRoundChallenge | null) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const tone = useCopyTone();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const challengeId = challenge?.id ?? null;
  const isHost = isHostRoundPromptHost({ viewerId: userId, createdBy: challenge?.created_by });
  const challengeDay = challengeId
    ? challengeDayStamp(new Date(), challenge?.timezone)
    : '';
  const localDay = viewerLocalDayStamp(new Date(), profile?.timezone);
  const line = hostRoundPromptLine(tone);
  const enabled = Boolean(userId && challengeId && isHost && challenge?.status === 'live');

  const query = useQuery({
    queryKey: hostRoundPromptQueryKey(userId, challengeId, challengeDay, localDay),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [dismissedLocalDay, postedRoundToday] = await Promise.all([
        readHostRoundPromptDismissed(userId!, challengeId!, localDay),
        fetchPostedRoundToday(userId!, challengeId!, challenge?.timezone, challengeDay),
      ]);
      return { dismissedLocalDay, postedRoundToday };
    },
  });

  const visible = shouldShowHostRoundPrompt({
    isHost,
    status: challenge?.status,
    postedRoundToday: query.data?.postedRoundToday === true,
    dismissedLocalDay: query.data?.dismissedLocalDay === true,
  });

  useEffect(() => {
    if (!visible || !userId || !challengeId || query.isLoading) {
      return;
    }
    void maybePushHostRoundPrompt({
      userId,
      challengeId,
      localDay,
      body: line,
    });
  }, [challengeId, line, localDay, query.isLoading, userId, visible]);

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!userId || !challengeId) {
        return;
      }
      await writeHostRoundPromptDismissed(userId, challengeId, localDay);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: hostRoundPromptQueryKey(userId, challengeId, challengeDay, localDay),
      });
    },
  });

  return {
    visible,
    line,
    captureHref: challengeId ? hostRoundCaptureHref(challengeId) : null,
    dismiss: () => dismiss.mutate(),
    refetch: query.refetch,
  };
}
