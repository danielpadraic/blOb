import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type LayoutRectangle, type ScrollView } from 'react-native';

import type { CreateTourTrack } from '@/lib/createTour';

export type TourRect = LayoutRectangle;

type TourContextValue = {
  active: boolean;
  runId: number;
  epoch: number;
  targetId: string | null;
  createActive: boolean;
  createRunId: number;
  createTrack: CreateTourTrack | null;
  start: () => void;
  stop: () => void;
  startCreate: (track: CreateTourTrack) => void;
  stopCreate: () => void;
  peekCreateStep: (step: number) => void;
  setCreatePeek: (fn: ((step: number) => void) | null) => void;
  setTargetId: (id: string | null) => void;
  bump: () => void;
  register: (id: string, rect: TourRect | null) => void;
  rectFor: (id: string | null) => TourRect | null;
  setHomeScroll: (node: ScrollView | null) => void;
  scrollHomeToTop: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [runId, setRunId] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [createActive, setCreateActive] = useState(false);
  const [createRunId, setCreateRunId] = useState(0);
  const [createTrack, setCreateTrack] = useState<CreateTourTrack | null>(null);
  const [version, setVersion] = useState(0);
  const rects = useRef(new Map<string, TourRect>());
  const homeScroll = useRef<ScrollView | null>(null);
  const createPeek = useRef<((step: number) => void) | null>(null);

  const register = useCallback((id: string, rect: TourRect | null) => {
    if (!rect || rect.width < 1 || rect.height < 1) {
      rects.current.delete(id);
    } else {
      rects.current.set(id, rect);
    }
    setVersion((current) => current + 1);
  }, []);

  const rectFor = useCallback(
    (id: string | null) => {
      if (!id) {
        return null;
      }
      return rects.current.get(id) ?? null;
    },
    [version],
  );

  const bump = useCallback(() => {
    setEpoch((current) => current + 1);
  }, []);

  const setHomeScroll = useCallback((node: ScrollView | null) => {
    homeScroll.current = node;
  }, []);

  const scrollHomeToTop = useCallback(() => {
    homeScroll.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const start = useCallback(() => {
    setCreateActive(false);
    setCreateTrack(null);
    setActive(true);
    setRunId((current) => current + 1);
    setEpoch((current) => current + 1);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setTargetId(null);
  }, []);

  const startCreate = useCallback((track: CreateTourTrack) => {
    setActive(false);
    setCreateTrack(track);
    setCreateActive(true);
    setCreateRunId((current) => current + 1);
    setEpoch((current) => current + 1);
  }, []);

  const stopCreate = useCallback(() => {
    setCreateActive(false);
    setCreateTrack(null);
    setTargetId(null);
  }, []);

  const setCreatePeek = useCallback((fn: ((step: number) => void) | null) => {
    createPeek.current = fn;
  }, []);

  const peekCreateStep = useCallback((step: number) => {
    createPeek.current?.(step);
  }, []);

  const value = useMemo(
    () => ({
      active,
      runId,
      epoch,
      targetId,
      createActive,
      createRunId,
      createTrack,
      start,
      stop,
      startCreate,
      stopCreate,
      peekCreateStep,
      setCreatePeek,
      setTargetId,
      bump,
      register,
      rectFor,
      setHomeScroll,
      scrollHomeToTop,
    }),
    [
      active,
      bump,
      createActive,
      createRunId,
      createTrack,
      epoch,
      peekCreateStep,
      rectFor,
      register,
      runId,
      scrollHomeToTop,
      setCreatePeek,
      setHomeScroll,
      start,
      startCreate,
      stop,
      stopCreate,
      targetId,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const value = useContext(TourContext);
  if (!value) {
    throw new Error('useTour must be used inside TourProvider');
  }
  return value;
}

export function useTourOptional() {
  return useContext(TourContext);
}
