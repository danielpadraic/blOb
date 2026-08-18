import { Stack } from 'expo-router';

import { THEME } from '@/lib/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: THEME.background },
      }}
    />
  );
}
