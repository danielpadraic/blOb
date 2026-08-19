import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type LayoutRectangle } from 'react-native';

export type TourRect = LayoutRectangle;

type TourContextValue = {
  active: boolean;
  start: () => void;
  stop: () => void;
  register: (id: string, rect: TourRect | null) => void;
  rectFor: (id: string | null) => TourRect | null;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [version, setVersion] = useState(0);
  const rects = useRef(new Map<string, TourRect>());

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

  const value = useMemo(
    () => ({
      active,
      start: () => setActive(true),
      stop: () => setActive(false),
      register,
      rectFor,
    }),
    [active, register, rectFor],
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
