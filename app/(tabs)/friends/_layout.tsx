import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function FriendsStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...TAB_STACK_SCREEN_OPTIONS,
        contentStyle: {
          ...TAB_STACK_SCREEN_OPTIONS.contentStyle,
          flex: 1,
          minHeight: 0,
          overflow: 'visible',
        },
      }}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
