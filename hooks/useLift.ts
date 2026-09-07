import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenges, type LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import {
  createCustomExercise,
  deleteLiftSession,
  fetchCardioMethods,
  fetchCustomExercises,
  fetchLastSessionForMuscles,
  fetchLastSessionWithExercises,
  fetchLiftHistory,
  fetchLiftSession,
  fetchOpenLiftSession,
  importLiftSession,
  saveLiftSession,
  setLiftSessionFavorite,
  startLiftSession,
  unitFor,
} from '@/lib/lift/api';
import { attachLiftToCheckin } from '@/lib/lift/attach';
import { liftingChallenges } from '@/lib/lift/liftingChallenge';
import { shareLiftSession, type LiftShareInput } from '@/lib/lift/share';
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

/** The one session still in progress, or null. Drives "Pick up where you left off". */
export function useOpenLiftSession() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [LIFT_KEY, 'open', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchOpenLiftSession(),
  });
}

/** Opens a session for these muscles, adopting the open one if there already is one. */
export function useStartLiftSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ muscles, unit }: { muscles: readonly MuscleKey[]; unit: WeightUnit }) =>
      startLiftSession(muscles, unit),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY] });
    },
  });
}

/** The shared cardio catalog. It only changes when we ship a migration, so it is cached hard. */
export function useCardioMethods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [LIFT_KEY, 'cardio-methods'],
    enabled: Boolean(user?.id),
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => fetchCardioMethods(),
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

export function useSetLiftSessionFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      setLiftSessionFavorite(id, favorite),
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

/** The live challenges a finished lift can be attached to. Empty means no attach row is shown. */
/**
 * Every active challenge the viewer could put a lift on.
 *
 * This used to be filtered to challenges whose task *read* like lifting, which meant a challenge
 * called "October Fitness" or "Summer Shred" silently offered nowhere to share and the sheet said
 * there were no challenges at all. The person doing the lifting knows which of their challenges it
 * belongs to better than a keyword list does, so the whole active set is offered and the ones that
 * do read like lifting are simply sorted first.
 */
export function useLiftingChallenges(): LoggableChallenge[] {
  const { data } = useLoggableChallenges();
  return useMemo(() => {
    const all = data ?? [];
    const lifting = new Set(liftingChallenges(all).map((challenge) => challenge.id));
    return [...all].sort((a, b) => Number(lifting.has(b.id)) - Number(lifting.has(a.id)));
  }, [data]);
}

/** The viewer's own last session sharing a catalog exercise with the one they are importing. */
export function useLastSessionWithExercises(exerciseIds: readonly string[]) {
  const { user } = useAuth();
  const key = [...exerciseIds].sort().join(',');
  return useQuery({
    queryKey: [LIFT_KEY, 'last-matching', key, user?.id],
    enabled: Boolean(user?.id && exerciseIds.length),
    queryFn: () => fetchLastSessionWithExercises(exerciseIds),
  });
}

export function useShareLiftSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LiftShareInput) => shareLiftSession(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY] });
      void client.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useAttachLiftToCheckin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      draft: LiftSessionDraft;
      challengeId: string;
      caption?: string | null;
      home: boolean;
    }) => attachLiftToCheckin(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY] });
      void client.invalidateQueries({ queryKey: ['feed'] });
      void client.invalidateQueries({ queryKey: ['loggable-challenge'] });
      void client.invalidateQueries({ queryKey: ['challenge-checkin'] });
    },
  });
}

/** Copies a session the viewer can see into a new one of their own. */
export function useImportLiftSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      source: LiftSessionDraft;
      numbers: 'keep' | 'empty';
      unit: WeightUnit;
    }) => importLiftSession(input.source, { numbers: input.numbers, unit: input.unit }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [LIFT_KEY, 'customs'] });
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
