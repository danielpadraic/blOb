import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ChallengesStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen
        name="create"
        options={{
          headerShown: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      />
      <Stack.Screen name="callout/create" options={{ title: 'Callout' }} />
      <Stack.Screen name="callout/[id]" options={{ title: 'Callout' }} />
      <Stack.Screen name="[id]" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
