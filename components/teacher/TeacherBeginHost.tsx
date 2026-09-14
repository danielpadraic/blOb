import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { TeacherBeginSheet } from '@/components/teacher/TeacherBeginSheet';
import { TeacherStartOverSheet } from '@/components/teacher/TeacherStartOverSheet';

export type TeacherSheet = 'begin' | 'restart' | null;

type TeacherBeginContextValue = {
  sheet: TeacherSheet;
  openBegin: () => void;
  openRestart: () => void;
  close: () => void;
};

const TeacherBeginContext = createContext<TeacherBeginContextValue | null>(null);

export function TeacherBeginProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<TeacherSheet>(null);
  const close = useCallback(() => setSheet(null), []);
  const value = useMemo<TeacherBeginContextValue>(
    () => ({
      sheet,
      openBegin: () => setSheet('begin'),
      openRestart: () => setSheet('restart'),
      close,
    }),
    [close, sheet],
  );
  return (
    <TeacherBeginContext.Provider value={value}>{children}</TeacherBeginContext.Provider>
  );
}

export function useTeacherBegin() {
  const ctx = useContext(TeacherBeginContext);
  if (!ctx) {
    throw new Error('useTeacherBegin needs TeacherBeginProvider');
  }
  return ctx;
}

export function useTeacherBeginOptional() {
  return useContext(TeacherBeginContext);
}

export function TeacherBeginLayer() {
  const ctx = useTeacherBeginOptional();
  if (!ctx) {
    return null;
  }
  return (
    <>
      <TeacherBeginSheet />
      <TeacherStartOverSheet />
    </>
  );
}
