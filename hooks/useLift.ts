import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  createCustomExercise,
  deleteLiftSession,
  fetchCustomExercises,
  fetchLastSessionForMuscles,
  fetchLiftHistory,
  fetchLiftSession,
  saveLiftSession,
  unitFor,
} from '@/lib/lift/api';
import type { ExerciseOption } from '@/lib/lift/catalog';
import type { MuscleKey } from '@/lib/lift/muscles';
import type { LiftSessionDraft } from '@/lib/lift/types';
import type { WeightUnit } from '@/lib/types';

/** Everything Lift reads lives under this key so one save can refresh the whole feature. */
export const LIFT_KEY = 'lift';

export function useLiftHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [LIFT_KEY, 'history', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchLiftHistory(),
  });
}

export function useLiftSession(id: string | null | undefined) {
  const { user } = useAuth();
  const sessionId = String(id ?? '').trim();
  return useQuery({
    queryKey: [LIFT_KEY, 'session', sessionId, user?.id],
    enabled: Boolean(sessionId && user?.id),
    queryFn: () => fetchLiftSession(sessionId),
  });
}

export function useCustomExercises() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [LIFT_KEY, 'customs', user?.id],
    enabled: Boolean(user?.id),
    // The list changes only when this user adds one, and the sheet reads it on every keystroke.
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchCustomExercises(),
  });
}

/** The most recent finished session covering every picked muscle, or null. */
export function useLastSessionForMuscles(muscles: readonly MuscleKey[]) {
  const { user } = useAuth();
  const key = [...muscles].sort().join(',');
  return useQuery({
    queryKey: [LIFT_KEY, 'last', key, user?.id],
    enabled: Boolean(user?.id && muscles.length),
    queryFn: () => fetchLastSessionForMuscles(muscles),
  });
}

/** lb unless the profile says kg. */
export function useLiftUnit(): WeightUnit {
  const { profile } = useMyProfile();
  return unitFor(profile?.weight_unit);
}

export function useSaveLiftSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, completed }: { draft: LiftSessionDraft; completed?: boolean }) =>
      saveLiftSession(draft, { completed }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY] });
    },
  });
}

export function useDeleteLiftSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLiftSession(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY] });
    },
  });
}

export function useCreateCustomExercise() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; muscle: MuscleKey; secondaries?: MuscleKey[] }) =>
      createCustomExercise(input),
    onSuccess: (created: ExerciseOption) => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY, 'customs'] });
      return created;
    },
  });
}
