import { AlertsPanel } from '@/components/notifications/AlertsPanel';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';

export default function NotificationsScreen() {
  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} className="px-4 pt-1">
      <AlertsPanel />
    </Screen>
  );
}
