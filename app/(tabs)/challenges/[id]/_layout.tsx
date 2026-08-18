import { Stack } from 'expo-router';

import { StackBackButton } from '@/components/navigation/StackBackButton';
import { THEME } from '@/lib/theme';

export default function ChallengeIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: THEME.textPrimary,
        headerStyle: { backgroundColor: THEME.background },
        headerShadowVisible: false,
        headerBackTitle: 'Lobby',
        headerTitleStyle: { fontWeight: '700', color: THEME.textPrimary },
        contentStyle: { backgroundColor: THEME.background },
        headerShown: false,
      }}>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: 'Challenge',
          headerBackVisible: false,
          headerLeft: () => <StackBackButton />,
        }}
      />
      <Stack.Screen name="submit" options={{ headerShown: true, title: 'Log workout' }} />
    </Stack>
  );
}
