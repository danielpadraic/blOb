import { useEffect } from 'react';
import { AppState } from 'react-native';

import { pingAppOpen } from '@/lib/appErrors';
import { useAuth } from '@/hooks/useAuth';

/** Records an app open for DAU. Best-effort; at most once per hour on the server. */
export function useAppOpenPing() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }
    pingAppOpen();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        pingAppOpen();
      }
    });
    return () => sub.remove();
  }, [session?.user?.id]);
}
