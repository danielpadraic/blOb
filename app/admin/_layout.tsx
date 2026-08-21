import { Stack } from 'expo-router';

import { AdminGate } from '@/components/admin/AdminGate';
import { TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export default function AdminLayout() {
  return (
    <AdminGate>
      <Stack
        screenOptions={{
          ...TAB_STACK_SCREEN_OPTIONS,
          headerStyle: { backgroundColor: THEME.background },
          contentStyle: { backgroundColor: THEME.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'Admin' }} />
        <Stack.Screen name="errors" options={{ title: 'Errors' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="[metric]" options={{ title: 'Pulse' }} />
      </Stack>
    </AdminGate>
  );
}
