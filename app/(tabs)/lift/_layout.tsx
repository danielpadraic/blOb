import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function LiftStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Lift' }} />
      {/* A static segment, so "Use this workout" resolves here rather than to a session id. */}
      <Stack.Screen name="new" options={{ title: 'Use this workout' }} />
      {/* The session screen sets its own header so the title can be the session name. */}
      <Stack.Screen name="[id]" options={HIDDEN_STACK_HEADER} />
    </Stack>
  );
}
