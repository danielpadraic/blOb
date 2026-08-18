import { Stack } from 'expo-router';

import { THEME } from '@/lib/theme';

export default function AuthCallbackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: THEME.background },
      }}
    />
  );
}
