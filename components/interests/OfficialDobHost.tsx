import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { OfficialDobSheet } from '@/components/interests/OfficialDobSheet';
import { useMyProfile } from '@/hooks/useProfile';
import { officialDobStatus, type OfficialDobStatus } from '@/lib/officialDob';

type OfficialDobContextValue = {
  status: OfficialDobStatus;
  /** Returns true when join may continue. Opens the private birthday sheet otherwise. */
  ensureAdult: () => boolean;
  /** You-tab editor. Never shown on the public profile. */
  openEditor: () => void;
};

const OfficialDobContext = createContext<OfficialDobContextValue | null>(null);

export function OfficialDobProvider({ children }: { children: ReactNode }) {
  const { profile } = useMyProfile();
  const status = officialDobStatus(profile?.date_of_birth);
  const [open, setOpen] = useState<OfficialDobStatus | null>(null);

  const ensureAdult = useCallback(() => {
    const next = officialDobStatus(profile?.date_of_birth);
    if (next === 'ok') {
      return true;
    }
    setOpen(next);
    return false;
  }, [profile?.date_of_birth]);

  const openEditor = useCallback(() => {
    setOpen('dob_required');
  }, []);

  const value = useMemo(() => ({ status, ensureAdult, openEditor }), [ensureAdult, openEditor, status]);

  return (
    <OfficialDobContext.Provider value={value}>
      {children}
      <OfficialDobSheet
        visible={open === 'dob_required' || open === 'underage'}
        mode={open === 'underage' ? 'underage' : 'dob_required'}
        value={profile?.date_of_birth}
        onClose={() => setOpen(null)}
      />
    </OfficialDobContext.Provider>
  );
}

export function useOfficialDob() {
  const value = useContext(OfficialDobContext);
  if (!value) {
    throw new Error('useOfficialDob must be used inside OfficialDobProvider');
  }
  return value;
}

export function useOfficialDobOptional() {
  return useContext(OfficialDobContext);
}
