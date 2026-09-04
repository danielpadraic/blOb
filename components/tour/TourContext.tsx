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
import { scrollDeltaToCenter, scrollViewToY } from '@/lib/tourScroll';
import { scrollToOffsetSafe, scrollToSafe } from '@/lib/tourScrollSafe';
import type { SimpleCurrency } from '@/lib/simpleChallenge';

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
  createCurrency: SimpleCurrency;
  setCreateCurrency: (value: SimpleCurrency) => void;
  setCreateScroll: (node: ScrollView | null) => void;
  setCreateScrollY: (y: number) => void;
  centerCreateRect: (
    rect: LayoutRectangle,
    viewport: { top: number; bottom: number; center: number },
  ) => boolean;
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
  const [createCurrency, setCreateCurrency] = useState<SimpleCurrency>('coins');
  const [version, setVersion] = useState(0);
  const rects = useRef(new Map<string, TourRect>());
  const homeScroll = useRef<ScrollView | null>(null);
  const createPeek = useRef<((step: number) => void) | null>(null);
  const createScroll = useRef<ScrollView | null>(null);
  const createScrollY = useRef(0);

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
    const node = homeScroll.current;
    if (node == null) {
      return;
    }
    if (scrollToOffsetSafe(node, { offset: 0, animated: true })) {
      return;
    }
    scrollToSafe(node, { y: 0, animated: true });
  }, []);

  const setCreateScroll = useCallback((node: ScrollView | null) => {
    createScroll.current = node;
    if (!node) {
      createScrollY.current = 0;
    }
  }, []);

  const setCreateScrollY = useCallback((y: number) => {
    createScrollY.current = y;
  }, []);

  const centerCreateRect = useCallback(
    (rect: LayoutRectangle, viewport: { top: number; bottom: number; center: number }) => {
      const scroll = createScroll.current;
      if (!scroll) {
        return false;
      }
      const delta = scrollDeltaToCenter(rect, viewport);
      if (Math.abs(delta) < 8) {
        return false;
      }
      const next = Math.max(0, createScrollY.current + delta);
      createScrollY.current = next;
      scrollViewToY(scroll, next);
      return true;
    },
    [],
  );

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
      createCurrency,
      setCreateCurrency,
      setCreateScroll,
      setCreateScrollY,
      centerCreateRect,
    }),
    [
      active,
      bump,
      centerCreateRect,
      createActive,
      createCurrency,
      createRunId,
      createTrack,
      epoch,
      peekCreateStep,
      rectFor,
      register,
      runId,
      scrollHomeToTop,
      setCreateCurrency,
      setCreatePeek,
      setCreateScroll,
      setCreateScrollY,
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
