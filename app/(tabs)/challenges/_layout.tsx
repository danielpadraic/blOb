import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ChallengesStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="create" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="callout/create" options={{ title: 'Call out' }} />
      <Stack.Screen name="callout/[id]" options={{ title: 'Call-out' }} />
      <Stack.Screen name="[id]" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
