import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useAuth } from '@/hooks/useAuth';
import { challengeInviteMessage } from '@/lib/challengeFeedPost';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  inviteToChallenge,
  markNotificationsRead,
} from '@/lib/notifications';
import { getOrCreateDirectConversation, sendMessage } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';

const NOTIFICATIONS_STALE_MS = 30_000;
const REALTIME_INVALIDATE_MIN_MS = 2_000;

function notificationChannelName(userId: string) {
  return `notifications:${userId}`;
}

function isNotificationChannel(channel: RealtimeChannel, userId: string) {
  const topic = channel.topic;
  const name = notificationChannelName(userId);
  return topic === name || topic === `realtime:${name}`;
}

function dropNotificationChannels(userId: string) {
  for (const existing of supabase.getChannels()) {
    if (isNotificationChannel(existing, userId)) {
      void supabase.removeChannel(existing);
    }
  }
}

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: Boolean(user?.id),
    staleTime: NOTIFICATIONS_STALE_MS,
    refetchOnMount: false,
    queryFn: fetchNotifications,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, 'unread'],
    enabled: Boolean(user?.id),
    staleTime: NOTIFICATIONS_STALE_MS,
    refetchOnMount: false,
    queryFn: fetchUnreadNotificationCount,
  });
}

/** Call once from TabLayout. Never add .on() after subscribe(); never throw into React. */
export function useNotificationsRealtime() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();
  const lastInvalidateAt = useRef(0);

  useEffect(() => {
    if (!userId) {
      return;
    }

    dropNotificationChannels(userId);

    const channel = supabase.channel(notificationChannelName(userId));
    const state = String((channel as { state?: string }).state ?? '');
    if (state === 'joined' || state === 'joining') {
      return () => {
        void supabase.removeChannel(channel);
      };
    }

    try {
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              const now = Date.now();
              if (now - lastInvalidateAt.current < REALTIME_INVALIDATE_MIN_MS) {
                return;
              }
              lastInvalidateAt.current = now;
              void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
            } catch (error) {
              console.log('[blob:notifications] realtime callback skipped', error);
            }
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('[blob:notifications] realtime', status);
          }
        });
    } catch (error) {
      console.log('[blob:notifications] realtime skipped', error);
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}

export function useMarkNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids?: string[]) => {
      await markNotificationsRead(ids);
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.id] });
      const previous = queryClient.getQueryData<AppNotification[]>(['notifications', user?.id]);
      queryClient.setQueryData<AppNotification[]>(['notifications', user?.id], (current) =>
        (current ?? []).map((item) => {
          if (item.read_at) {
            return item;
          }
          if (ids && ids.length > 0 && !ids.includes(item.id)) {
            return item;
          }
          return { ...item, read_at: new Date().toISOString() };
        }),
      );
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications', user?.id], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', user?.id, 'unread'] });
    },
  });
}

export function useInviteToChallenge(challengeId: string | undefined, challengeTitle?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteeIds: string | string[]) => {
      if (!challengeId) {
        throw new Error('Challenge not found.');
      }
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const ids = [...new Set((Array.isArray(inviteeIds) ? inviteeIds : [inviteeIds]).filter(Boolean))];
      if (ids.length === 0) {
        throw new Error('Pick someone to invite.');
      }
      const sent: string[] = [];
      const failed: { id: string; error: unknown }[] = [];
      const title = challengeTitle?.trim() || 'this challenge';
      const body = challengeInviteMessage(title, challengeId);
      for (const inviteeId of ids) {
        try {
          await inviteToChallenge(challengeId, inviteeId);
          try {
            const conversation = await getOrCreateDirectConversation(user.id, inviteeId);
            await sendMessage(user.id, {
              conversation_id: conversation.id,
              body,
            });
          } catch (dmError) {
            console.log('[blob:invite] dm skipped', dmError);
          }
          sent.push(inviteeId);
        } catch (error) {
          failed.push({ id: inviteeId, error });
        }
      }
      if (sent.length === 0) {
        throw failed[0]?.error ?? new Error('Couldn’t send that invite.');
      }
      return { sent, failed };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-invites', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (user?.id) {
        void queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
      }
    },
  });
}
