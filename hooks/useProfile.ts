import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { asCopyTone, copy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';
import type { Profile, ProfileUpdate, PublicProfile } from '@/lib/types';
import { getErrorMessage, isUnknownColumnError } from '@/utils/errors';
import { isProfileComplete } from '@/utils/validators';
import { useAuth } from '@/hooks/useAuth';
import { fetchPublicProfileById } from '@/hooks/usePublicProfile';
import { uploadProfilePhoto } from '@/lib/profilePhoto';

function isNoRow(error: { code?: string; details?: string; message: string }): boolean {
  const code = String(error.code ?? '');
  const details = String(error.details ?? '');
  const message = error.message.toLowerCase();
  return (
    code === 'PGRST116' ||
    details.includes('0 rows') ||
    message.includes('0 rows') ||
    message.includes('cannot coerce') ||
    message.includes('406')
  );
}

function asOwnProfile(raw: unknown, userId: string): Profile | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') {
    return null;
  }
  const profile = row as Profile;
  if (profile.id && profile.id !== userId) {
    throw new Error('Couldn’t load your wallet. Try signing in again.');
  }
  const coins = Number(profile.coins ?? profile.credits ?? 0);
  const gender = profile.gender === 'male' || profile.gender === 'female' ? profile.gender : null;
  const bodyFat = profile.body_fat_pct == null ? null : Number(profile.body_fat_pct);
  return {
    ...profile,
    id: profile.id || userId,
    coins,
    bucks: Number(profile.bucks ?? 0),
    credits: coins,
    last_shown_coin_balance:
      profile.last_shown_coin_balance == null ? null : Number(profile.last_shown_coin_balance),
    gender,
    body_fat_pct: Number.isFinite(bodyFat) ? bodyFat : null,
    body_metrics_completed_at: profile.body_metrics_completed_at ?? null,
    fitness_profile: profile.fitness_profile ?? null,
    timezone: profile.timezone ?? null,
    motivation_tone: asCopyTone(profile.motivation_tone),
    is_official: Boolean(profile.is_official),
  };
}

export async function fetchCurrentUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) {
    if (isNoRow(error)) {
      return null;
    }
    throw new Error(getErrorMessage(error));
  }
  return asOwnProfile(data, userId);
}

export function useProfile(userId?: string) {
  const { user } = useAuth();
  const id = userId ?? user?.id;
  const isSelf = Boolean(id && user?.id === id);

  return useQuery({
    queryKey: ['profile', id, isSelf ? 'self' : 'public'],
    enabled: Boolean(id),
    retry: isSelf ? false : 1,
    queryFn: async (): Promise<Profile | PublicProfile | null> => {
      if (isSelf) {
        const profile = await fetchCurrentUserProfile(id!);
        console.log('[blob:profile] query result', {
          userId: id,
          profile,
        });
        return profile;
      }

      const profile = await fetchPublicProfileById(id!);
      return profile;
    },
  });
}

export type AuthGatePath = 'boot' | 'auth' | 'setup' | 'app';

export function useMyProfile() {
  const { user, session, isLoading: authLoading } = useAuth();
  const query = useProfile(user?.id);

  const profile = (query.data as Profile | null | undefined) ?? null;
  const profileCheckFinished = !user || query.isFetched;
  const isBootstrapping = authLoading || Boolean(user && !query.isFetched);
  const needsOnboarding = Boolean(user && query.isFetched && !isProfileComplete(profile));

  let path: AuthGatePath = 'boot';
  if (!authLoading && profileCheckFinished) {
    if (!session) {
      path = 'auth';
    } else if (needsOnboarding) {
      path = 'setup';
    } else {
      path = 'app';
    }
  }

  useEffect(() => {
    if (path === 'boot') {
      console.log('[blob:gate] still checking', {
        authLoading,
        hasSession: Boolean(session),
        profileFetched: query.isFetched,
      });
      return;
    }

    console.log('[blob:session]', session
      ? { id: session.user.id, email: session.user.email }
      : null);
    console.log('[blob:profile]', {
      status: query.status,
      profile,
      error: query.error?.message ?? null,
    });
    console.log('[blob:gate] path', path);
  }, [
    authLoading,
    path,
    profile,
    query.error,
    query.isFetched,
    query.status,
    session,
  ]);

  return {
    ...query,
    profile,
    needsOnboarding,
    isBootstrapping,
    path,
  };
}

export function useUsernameAvailability(
  username: string,
  currentUsername?: string | null,
) {
  const [debounced, setDebounced] = useState(username);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(username.trim().toLowerCase()), 400);
    return () => clearTimeout(timer);
  }, [username]);

  const formatValid = /^[a-z0-9_]{3,24}$/.test(debounced);
  const isUnchanged = Boolean(
    currentUsername &&
      debounced === currentUsername &&
      !currentUsername.startsWith('blob_'),
  );

  const query = useQuery({
    queryKey: ['username-available', debounced],
    enabled: formatValid && !isUnchanged,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', debounced)
        .maybeSingle();
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return data == null;
    },
    staleTime: 10_000,
  });

  return {
    username: debounced,
    isChecking: formatValid && !isUnchanged && query.isFetching,
    isAvailable: isUnchanged ? true : query.data,
    isTaken: formatValid && query.data === false,
  };
}

function omitOptionalPreferences<
  T extends { motivation_tone?: unknown; mute_mentions?: unknown; timezone?: unknown },
>(row: T): Omit<T, 'motivation_tone' | 'mute_mentions' | 'timezone'> {
  const { motivation_tone: _tone, mute_mentions: _mute, timezone: _tz, ...rest } = row;
  return rest;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
      if (!error) {
        return patch;
      }
      if (isUnknownColumnError(error)) {
        const retryPatch = omitOptionalPreferences(patch);
        if (Object.keys(retryPatch).length === 0) {
          throw new Error(copy('error.preferenceSave'));
        }
        const retry = await supabase.from('profiles').update(retryPatch).eq('id', user.id);
        if (!retry.error) {
          return retryPatch;
        }
        throw new Error(
          isUnknownColumnError(retry.error)
            ? copy('error.preferenceSave')
            : getErrorMessage(retry.error),
        );
      }
      throw new Error(getErrorMessage(error));
    },
    onSuccess: (patch) => {
      queryClient.setQueryData(['profile', user?.id, 'self'], (current) =>
        current && typeof current === 'object' ? { ...current, ...patch } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });
}

export function useCompleteProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }

      const row = {
        id: user.id,
        username: patch.username ?? `blob_${user.id.replace(/-/g, '').slice(0, 10)}`,
        display_name: patch.display_name ?? null,
        avatar_url: patch.avatar_url ?? null,
        bio: patch.bio ?? null,
        height_cm: patch.height_cm ?? null,
        current_weight: patch.current_weight ?? null,
        goal_weight: patch.goal_weight ?? null,
        weight_unit: patch.weight_unit ?? 'lb',
        gender: patch.gender ?? null,
        body_fat_pct: patch.body_fat_pct ?? null,
        body_metrics_completed_at: patch.body_metrics_completed_at ?? null,
        typical_weekly_workout_frequency:
          patch.typical_weekly_workout_frequency ?? null,
        primary_activities: patch.primary_activities ?? [],
        skill_tags: patch.skill_tags ?? [],
        show_fitness_stats_publicly: patch.show_fitness_stats_publicly ?? false,
        motivation_tone: patch.motivation_tone ?? 'neutral',
      };

      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
      if (!error) {
        return;
      }
      // Never block account creation on optional prefs / schema-cache misses.
      const retryRow = omitOptionalPreferences(row);
      const retry = await supabase.from('profiles').upsert(retryRow, { onConflict: 'id' });
      if (!retry.error) {
        return;
      }
      throw new Error(
        isUnknownColumnError(error) || isUnknownColumnError(retry.error)
          ? copy('error.preferenceSave')
          : getErrorMessage(retry.error),
      );
    },
    onSuccess: (_data, patch) => {
      queryClient.setQueryData(['profile', user?.id, 'self'], (current) =>
        current && typeof current === 'object' ? { ...current, ...patch } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });
}

export function useUploadAvatar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uri: string) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return uploadProfilePhoto(user.id, uri);
    },
    onSuccess: (publicUrl) => {
      queryClient.setQueryData(['profile', user?.id, 'self'], (current) =>
        current && typeof current === 'object' ? { ...current, avatar_url: publicUrl } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });
}
