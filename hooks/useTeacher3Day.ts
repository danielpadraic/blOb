import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  emptyTeacher3DayState,
  parseTeacher3DayState,
  type TeacherHrSource,
} from '@/lib/teacher3day';
import { getErrorMessage } from '@/utils/errors';

export const TEACHER_3DAY_KEY = 'teacher-3day-state';

export function useTeacher3DayState() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [TEACHER_3DAY_KEY, user?.id],
    enabled: Boolean(user?.id),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('teacher_3day_state');
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return parseTeacher3DayState(data);
    },
  });
}

export function useSetTeacherPrep() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { cameraReady?: boolean; hrSource?: TeacherHrSource | null }) => {
      const { error } = await supabase.rpc('set_teacher_prep', {
        p_camera_ready: Boolean(input.cameraReady),
        p_hr_source: input.hrSource ?? null,
      });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });
}

export function useBeginTeacher3Day() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (restart = false) => {
      const { data, error } = await supabase.rpc('begin_teacher_3day', { p_restart: restart });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return parseTeacher3DayState(data);
    },
    onSuccess: (state) => {
      queryClient.setQueryData([TEACHER_3DAY_KEY, user?.id], state ?? emptyTeacher3DayState());
      void queryClient.invalidateQueries({ queryKey: [TEACHER_3DAY_KEY, user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
    },
  });
}
