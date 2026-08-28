import { Stack } from 'expo-router';

import { THEME } from '@/lib/theme';

export default function StoryStackLayout() {
  // Routes stay `/story/*` so existing links keep working. User-facing name is Wave.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: THEME.textPrimary,
        headerStyle: { backgroundColor: THEME.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: THEME.background },
      }}>
      <Stack.Screen
        name="create"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: THEME.background },
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
