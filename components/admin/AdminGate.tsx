import { Link } from 'expo-router';
import type { ReactNode } from 'react';

import { MascotState } from '@/components/mascot/MascotState';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAdminAccess } from '@/hooks/useAdmin';
import { copy } from '@/lib/copy';
import { TABS_HREF } from '@/lib/routes';

export function AdminGate({ children }: { children: ReactNode }) {
  const { allowed, loading } = useAdminAccess();

  if (loading) {
    return (
      <Screen>
        <MascotState kind="loading" title="Checking…" compact />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <MascotState kind="error" title={copy('notFound.title')} />
        <Link href={TABS_HREF} className="items-center">
          <AppText className="text-center font-semibold" style={{ color: '#2C9B89' }}>
            Go home
          </AppText>
        </Link>
      </Screen>
    );
  }

  return children;
}
