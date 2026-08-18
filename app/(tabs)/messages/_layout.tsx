import { Stack } from 'expo-router';

import { THEME } from '@/lib/theme';

export default function MessagesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: THEME.textPrimary,
        headerStyle: { backgroundColor: THEME.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: THEME.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
