import { Stack } from 'expo-router';

import { THEME } from '@/lib/theme';

export default function ReelStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: THEME.textPrimary,
        headerStyle: { backgroundColor: THEME.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#101312' },
      }}>
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
          contentStyle: { backgroundColor: '#101312' },
        }}
      />
    </Stack>
  );
}
