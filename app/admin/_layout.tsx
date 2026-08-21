import { Stack } from 'expo-router';

import { AdminGate } from '@/components/admin/AdminGate';
import { StackBackButton } from '@/components/navigation/StackBackButton';
import { TAB_STACK_SCREEN_OPTIONS, TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

function AdminBack() {
  return <StackBackButton fallback={TABS_HREF} preferHistory />;
}

export default function AdminLayout() {
  return (
    <AdminGate>
      <Stack
        screenOptions={{
          ...TAB_STACK_SCREEN_OPTIONS,
          headerStyle: { backgroundColor: THEME.background },
          contentStyle: { backgroundColor: THEME.background },
          headerBackVisible: false,
          headerLeft: () => <AdminBack />,
        }}>
        <Stack.Screen name="index" options={{ title: 'Admin' }} />
        <Stack.Screen name="errors" options={{ title: 'Errors' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="[metric]" options={{ title: 'Pulse' }} />
      </Stack>
    </AdminGate>
  );
}
