import { Stack } from 'expo-router';

import { HIDDEN_STACK_HEADER, PROFILE_STACK_TITLE, TAB_STACK_SCREEN_OPTIONS } from '@/lib/routes';

export default function YouStackLayout() {
  return (
    <Stack screenOptions={TAB_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="edit" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="legal/[doc]" options={{ title: 'Legal' }} />
      <Stack.Screen name="send" options={{ title: 'Send' }} />
      <Stack.Screen name="body-metrics" options={{ title: 'Body metrics' }} />
      <Stack.Screen name="interests" options={HIDDEN_STACK_HEADER} />
      <Stack.Screen name="fitness-history" options={{ title: 'Fitness history' }} />
      <Stack.Screen name="lifts" options={{ title: 'Lifts' }} />
      <Stack.Screen name="u/[username]" options={PROFILE_STACK_TITLE} />
    </Stack>
  );
}
