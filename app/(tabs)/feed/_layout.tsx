import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function FeedStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="compose" options={{ title: 'New Post' }} />
      <Stack.Screen name="p/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
