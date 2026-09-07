import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

const LIFT_STACK_OPTIONS = {
  ...TAB_STACK_SCREEN_OPTIONS,
  // History lives on You. Opening a row must be a full card under the blOb header, not an iOS
  // page sheet that peeks ~120px with no room for sets.
  presentation: 'card' as const,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

export default function LiftStackLayout() {
  return (
    <Stack screenOptions={LIFT_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Lift' }} />
      {/* A static segment, so "Use this workout" resolves here rather than to a session id. */}
      <Stack.Screen name="new" options={{ title: 'Use this workout' }} />
      {/* Also static, and also not a session: the interval timer logs nothing. */}
      <Stack.Screen name="timer" options={{ title: 'Timer' }} />
      {/* The session screen sets its own header so the title can be the session name. */}
      <Stack.Screen name="[id]" options={{ ...HIDDEN_STACK_HEADER, ...LIFT_STACK_OPTIONS }} />
    </Stack>
  );
}
