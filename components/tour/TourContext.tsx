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

export type TourRect = LayoutRectangle;

type TourContextValue = {
  active: boolean;
  runId: number;
  epoch: number;
  targetId: string | null;
  start: () => void;
  stop: () => void;
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
  const [version, setVersion] = useState(0);
  const rects = useRef(new Map<string, TourRect>());
  const homeScroll = useRef<ScrollView | null>(null);

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
    setActive(true);
    setRunId((current) => current + 1);
    setEpoch((current) => current + 1);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setTargetId(null);
  }, []);

  const value = useMemo(
    () => ({
      active,
      runId,
      epoch,
      targetId,
      start,
      stop,
      setTargetId,
      bump,
      register,
      rectFor,
      setHomeScroll,
      scrollHomeToTop,
    }),
    [active, bump, epoch, rectFor, register, runId, scrollHomeToTop, setHomeScroll, start, stop, targetId],
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
