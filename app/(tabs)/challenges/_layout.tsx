import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export const unstable_settings = {
  initialRouteName: 'index',
};

const CREATE_MODAL = {
  title: 'Create a Challenge',
  headerShown: false,
  presentation: 'containedTransparentModal' as const,
  animation: 'fade' as const,
  contentStyle: { backgroundColor: 'transparent' },
};

export default function ChallengesStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="create" options={CREATE_MODAL} />
      <Stack.Screen name="callout/create" options={{ title: 'Call out' }} />
      <Stack.Screen name="callout/[id]" options={{ title: 'Call-out' }} />
      <Stack.Screen name="[id]" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
