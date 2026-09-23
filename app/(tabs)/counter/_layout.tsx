import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

const OPTIONS = {
  ...TAB_STACK_SCREEN_OPTIONS,
  presentation: 'card' as const,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

export default function CounterStackLayout() {
  return (
    <Stack screenOptions={OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Counter' }} />
      <Stack.Screen name="history" options={{ title: 'History' }} />
      <Stack.Screen name="[id]" options={{ ...HIDDEN_STACK_HEADER, ...OPTIONS }} />
    </Stack>
  );
}
