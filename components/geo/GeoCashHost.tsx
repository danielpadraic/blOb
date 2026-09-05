import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { GpsJitSheet } from '@/components/geo/GpsJitSheet';
import { GeoUnavailableSheet } from '@/components/geo/GeoUnavailableSheet';
import { HomeStatePickerSheet } from '@/components/geo/HomeStatePickerSheet';
import { NeedRegionSheet } from '@/components/geo/NeedRegionSheet';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { requestGeoCashGate } from '@/lib/geo/cashGate';
import { canPerformCashAction } from '@/lib/geo/eligibility';
import { readPreciseUspsRegion } from '@/lib/geo/preciseLocation';
import { isPreciseFresh, type CashAction, type UspsRegion } from '@/lib/geo/regions';
import { getErrorMessage } from '@/utils/errors';

type Sheet = 'need_region' | 'home_state' | 'gps' | 'unavailable' | null;

type Pending = {
  action: CashAction;
  challengeId?: string | null;
  resolve: (ok: boolean) => void;
};

type GeoCashContextValue = {
  busy: boolean;
  ensure: (input: { action: CashAction; challengeId?: string | null }) => Promise<boolean>;
  showUnavailable: () => void;
  openHomeState: (opts?: { onSaved?: () => void }) => void;
};

const GeoCashContext = createContext<GeoCashContextValue | null>(null);

export function GeoCashProvider({ children }: { children: ReactNode }) {
  const { profile, refetch } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const homeSavedRef = useRef<(() => void) | null>(null);
  const inflightRef = useRef<Promise<boolean> | null>(null);

  const closeSheets = useCallback(() => {
    setSheet(null);
    setGpsLoading(false);
    setSaveError(null);
  }, []);

  const resolvePending = useCallback((ok: boolean) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    inflightRef.current = null;
    setRunning(false);
    setGpsLoading(false);
    pending?.resolve(ok);
  }, []);

  const showDenied = useCallback(() => {
    resolvePending(false);
    setSheet('unavailable');
  }, [resolvePending]);

  const runGate = useCallback(
    async (preciseRegion: string | null | undefined, declaredRegion: string | null | undefined) => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      const preview = canPerformCashAction({
        action: pending.action,
        declaredRegion,
        preciseRegion: preciseRegion ?? null,
      });
      if (!preview.allowed) {
        showDenied();
        return;
      }
      try {
        const result = await requestGeoCashGate({
          action: pending.action,
          challengeId: pending.challengeId,
          preciseRegion: preciseRegion ?? null,
        });
        void refetch();
        if (!result.allowed) {
          showDenied();
          return;
        }
        closeSheets();
        resolvePending(true);
      } catch {
        showDenied();
      }
    },
    [closeSheets, refetch, resolvePending, showDenied],
  );

  const continueWithDeclared = useCallback(
    (declaredRegion: string | null | undefined) => {
      const pending = pendingRef.current;
      if (!pending) {
        closeSheets();
        return;
      }
      const preview = canPerformCashAction({
        action: pending.action,
        declaredRegion,
      });
      if (!preview.allowed) {
        showDenied();
        return;
      }
      if (isPreciseFresh(profile?.last_precise_at)) {
        void runGate(null, declaredRegion);
        return;
      }
      setSheet('gps');
    },
    [closeSheets, profile?.last_precise_at, runGate, showDenied],
  );

  const ensure = useCallback(
    (input: { action: CashAction; challengeId?: string | null }) => {
      if (inflightRef.current) {
        return inflightRef.current;
      }
      const run = new Promise<boolean>((resolve) => {
        pendingRef.current = { ...input, resolve };
        setRunning(true);
        const declared = profile?.declared_region ?? null;
        if (!declared) {
          setSheet('need_region');
          return;
        }
        continueWithDeclared(declared);
      });
      inflightRef.current = run;
      return run;
    },
    [continueWithDeclared, profile?.declared_region],
  );

  const openHomeState = useCallback((opts?: { onSaved?: () => void }) => {
    homeSavedRef.current = opts?.onSaved ?? null;
    setSaveError(null);
    setSheet('home_state');
  }, []);

  const showUnavailable = useCallback(() => {
    resolvePending(false);
    setSheet('unavailable');
  }, [resolvePending]);

  async function saveHomeState(region: UspsRegion) {
    setSaveError(null);
    try {
      await updateProfile.mutateAsync({ declared_region: region });
      await refetch();
      const onSaved = homeSavedRef.current;
      homeSavedRef.current = null;
      onSaved?.();
      if (pendingRef.current) {
        continueWithDeclared(region);
        return;
      }
      closeSheets();
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  }

  async function useLocation() {
    if (gpsLoading) {
      return;
    }
    setGpsLoading(true);
    const declared = profile?.declared_region ?? null;
    const fix = await readPreciseUspsRegion();
    if (fix.ok) {
      await runGate(fix.region, declared);
      return;
    }
    if (fix.reason === 'outside_us') {
      await runGate('XX', declared);
      return;
    }
    await runGate(null, declared);
  }

  const value = useMemo<GeoCashContextValue>(
    () => ({
      busy: running || gpsLoading || sheet === 'need_region' || sheet === 'home_state' || sheet === 'gps',
      ensure,
      showUnavailable,
      openHomeState,
    }),
    [ensure, gpsLoading, openHomeState, running, sheet, showUnavailable],
  );

  return (
    <GeoCashContext.Provider value={value}>
      {children}
      <NeedRegionSheet
        visible={sheet === 'need_region'}
        onAddState={() => {
          setSaveError(null);
          setSheet('home_state');
        }}
        onNotNow={() => {
          closeSheets();
          resolvePending(false);
        }}
      />
      <HomeStatePickerSheet
        visible={sheet === 'home_state'}
        value={profile?.declared_region}
        saving={updateProfile.isPending}
        error={saveError}
        onSave={(region) => void saveHomeState(region)}
        onClose={() => {
          homeSavedRef.current = null;
          if (pendingRef.current) {
            closeSheets();
            resolvePending(false);
            return;
          }
          closeSheets();
        }}
      />
      <GpsJitSheet
        visible={sheet === 'gps'}
        loading={gpsLoading}
        onUseLocation={() => void useLocation()}
        onUseHomeState={() => void runGate(null, profile?.declared_region ?? null)}
        onClose={() => {
          closeSheets();
          resolvePending(false);
        }}
      />
      <GeoUnavailableSheet
        visible={sheet === 'unavailable'}
        onClose={closeSheets}
      />
    </GeoCashContext.Provider>
  );
}

export function useGeoCash() {
  const value = useContext(GeoCashContext);
  if (!value) {
    throw new Error('useGeoCash must be used inside GeoCashProvider');
  }
  return value;
}

export function useGeoCashOptional() {
  return useContext(GeoCashContext);
}
